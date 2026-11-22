import {
  applyRef,
  dynamic,
  isServer,
  type ComponentProps,
  type JSX,
  type ValidComponent,
} from "@solidjs/web";
import {
  animateTarget,
  defaultTransformValue,
  HTMLProjectionNode,
  HTMLVisualElement,
  isControllingVariants,
  isMotionValue,
  isVariantLabel,
  rootProjectionNode,
  SVGVisualElement,
  transformProps,
  type AnyResolvedKeyframe,
  type HTMLRenderState,
  type MotionNodeOptions,
  type MotionValue,
  type SVGRenderState,
  type VisualElement,
} from "motion-dom";
import {
  children,
  createComponent,
  createEffect,
  createMemo,
  merge,
  omit,
  onCleanup,
  untrack,
  useContext,
  type Component,
} from "solid-js";
import {
  LayoutGroupContext,
  MotionConfigContext,
  MotionContext,
  PresenceContext,
  type MotionContextValue,
  type PresenceMember,
} from "../context";
import type { MotionComponentProps } from "../types";
import { scheduleAnimateChanges } from "./animate-queue";
import { initFeatures } from "./features";
import {
  commitLayout,
  isLayoutNode,
  LayoutController,
  layoutScope,
  scopeOf,
  snapshotLayout,
} from "./layout";
import { createPresenceState } from "./presence";
import { isSVGComponent, isValidMotionProp } from "./utils";
import { buildInitialRender, camelCaseStyle, makeVisualState, rawStyles } from "./visual-state";

export interface MotionComponentOptions {
  /** Forward motion props (`animate`, `layout`…) to the wrapped component too. */
  forwardMotionProps?: boolean;
  /** Render as HTML or SVG. Detected from the tag name by default. */
  type?: "html" | "svg";
}

type Props = Record<string, unknown> & {
  children?: unknown;
  ref?: unknown;
  style?: unknown;
};

/** Variant labels a motion component passes down to its children. */
function getCurrentTreeVariants(
  props: MotionNodeOptions,
  context: MotionContextValue,
): MotionContextValue {
  if (isControllingVariants(props)) {
    const { initial, animate } = props;
    return {
      initial:
        initial === false || isVariantLabel(initial)
          ? (initial as false | string | string[])
          : undefined,
      animate: isVariantLabel(animate) ? animate : undefined,
    };
  }
  return props.inherit !== false ? context : {};
}

/** A motion component rendering `C`: its props with the motion props on top. */
export type MotionComponent<C extends ValidComponent = ValidComponent> = Component<
  MotionComponentProps<ComponentProps<C>>
>;

/**
 * Creates a motion component that renders `component` (a tag name like
 * "div", or a component that forwards its `ref` to an element).
 */
export function createMotionComponent<C extends ValidComponent>(
  component: C,
  { forwardMotionProps = false, type }: MotionComponentOptions = {},
): MotionComponent<C> {
  initFeatures();
  const isSVG = type ? type === "svg" : isSVGComponent(component);
  const isDOM = typeof component === "string";
  const Rendered = dynamic<ValidComponent>(() => component, { static: true });

  return function MotionComponent(props: Props): JSX.Element {
    const config = useContext(MotionConfigContext);
    const parentContext = useContext(MotionContext);
    const presence = useContext(PresenceContext);
    const layoutGroup = useContext(LayoutGroupContext);

    const groupLayoutId = (layoutId: string | undefined) =>
      layoutGroup.id && layoutId !== undefined ? `${layoutGroup.id}-${layoutId}` : layoutId;

    /**
     * An element mounting with the layoutId of one already on screen
     * takes over from it with a shared layout animation, so visually it
     * has already entered: skip its initial animation.
     */
    const resumesSharedLayout = untrack(() => {
      const layoutId = groupLayoutId(props.layoutId as string | undefined);
      return Boolean(
        layoutId && props.initial && rootProjectionNode.current?.sharedNodes.get(layoutId)?.lead,
      );
    });

    /** `style` with camelCase keys, as motion-dom reads it. */
    const styleProp = createMemo(() => camelCaseStyle(props.style));

    /**
     * The props the VisualElement sees, as React would pass them on a
     * render: config defaults, every prop except children and ref, and
     * the grouped layoutId. Re-runs (a "re-render") when any prop changes.
     */
    const motionProps = createMemo(() => {
      const own: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        if (key === "style") own.style = styleProp();
        else if (key !== "children" && key !== "ref") own[key] = props[key];
      }
      const merged = {
        transition: config.transition,
        transformPagePoint: config.transformPagePoint,
        ...own,
        layoutId: groupLayoutId(own.layoutId as string | undefined),
      } as MotionNodeOptions & Record<string, unknown>;
      if (resumesSharedLayout) merged.initial = false;
      return merged;
    });
    const initialProps = untrack(motionProps);

    const presenceState = presence ? createPresenceState(presence) : null;
    const visualState = makeVisualState(
      initialProps,
      parentContext,
      presenceState?.present ?? null,
      isSVG,
    );

    let visualElement: VisualElement<Element> | undefined;
    if (!isServer) {
      const options = untrack(() => ({
        visualState,
        parent: parentContext.visualElement,
        props: initialProps,
        presenceContext: presenceState?.present ?? null,
        blockInitialAnimation: presenceState?.present.initial === false,
        reducedMotionConfig: config.reducedMotion,
        skipAnimations: config.skipAnimations,
        isSVG,
      }));
      visualElement = (
        isSVG
          ? new SVGVisualElement(
              options as typeof options & {
                visualState: { renderState: SVGRenderState };
              },
            )
          : new HTMLVisualElement(
              options as typeof options & {
                visualState: { renderState: HTMLRenderState };
              },
              { allowProjection: true },
            )
      ) as VisualElement<Element>;
      // Every motion element joins the projection tree, so layout
      // animations below it can correct for its transforms.
      HTMLProjectionNode.create(visualElement, initialProps);

      /**
       * A new layout node moves what's already on screen around it:
       * snapshot its motion parent's scope and its LayoutGroup before
       * Solid inserts it.
       */
      if (isLayoutNode(initialProps)) {
        const parentElement = parentContext.visualElement?.current;
        snapshotLayout(parentElement instanceof Element ? layoutScope(parentElement) : undefined);
        layoutGroup.group?.dirty();
      }
    }

    /**
     * Read from the props rather than `visualElement.props`, which only
     * update once the effect below applies them: a child created in the
     * same flush as a change must already see the new labels.
     */
    const context: MotionContextValue = {
      visualElement,
      get initial() {
        return getCurrentTreeVariants(untrack(motionProps), parentContext).initial;
      },
      get animate() {
        return getCurrentTreeVariants(untrack(motionProps), parentContext).animate;
      },
    };

    let element: Element | undefined;
    let isMounted = false;
    let isDisposed = false;
    /** Registers the element with AnimatePresence until it mounts. */
    let enterPresence: ((element: Element) => void) | undefined;
    /** Hands a props change to the VisualElement. Client only. */
    let applyProps: ((latest: MotionNodeOptions) => void) | undefined;
    const layout = visualElement?.projection
      ? new LayoutController(visualElement.projection, layoutGroup.group)
      : undefined;

    if (visualElement) {
      const ve = visualElement;
      let member: PresenceMember | undefined;
      let unregister: VoidFunction | undefined;
      let cancelDeferredMount: VoidFunction | undefined;
      let leavePresenceEntrants: VoidFunction | undefined;
      /** Values taken over from an exiting element that must settle back. */
      let returning: Record<string, AnyResolvedKeyframe> | undefined;

      /**
       * Take over from an exiting element (see AnimatePresence): render
       * its current values now and animate from them. Values our own
       * animation won't target settle back to where they'd rest.
       */
      const resumeFrom = (source: VisualElement) => {
        returning = {};
        const style = (ve.props as { style?: Record<string, unknown> }).style;
        source.values.forEach((value, key) => {
          // Driven by a motion value from `style`: not ours to set.
          if (isMotionValue(style?.[key])) return;
          const rest =
            ve.latestValues[key] ??
            (transformProps.has(key) ? defaultTransformValue(key) : undefined);
          ve.latestValues[key] = value.get();
          if (rest !== undefined) returning![key] = rest;
        });
      };

      const settleReturningValues = () => {
        const pending = returning;
        returning = undefined;
        if (!pending) return;
        // After this mount's animations have started (animate-queue).
        queueMicrotask(() => {
          if (!ve.current) return; // Unmounted since.
          const state = ve.animationState?.getState() ?? {};
          const target: Record<string, AnyResolvedKeyframe> = {};
          for (const key in pending) {
            const isAnimated = Object.values(state).some(
              (type) => type.isActive && key in type.prevResolvedValues,
            );
            if (!isAnimated) target[key] = pending[key];
          }
          if (Object.keys(target).length) animateTarget(ve, target);
        });
      };

      if (presence) {
        enterPresence = (node) => {
          leavePresenceEntrants?.();
          leavePresenceEntrants = presence.enter({
            element: node,
            key: untrack(() => props.key),
            resumeFrom,
          });
        };
      }

      const finalize = () => {
        unregister?.();
        layout?.unmount();
        ve.unmount();
      };

      const mount = (latest: MotionNodeOptions) => {
        isMounted = true;
        leavePresenceEntrants?.();
        ve.mount(element!);
        if (layout && (isLayoutNode(latest) || layout.projection.options.layoutId)) {
          layout.mount(latest);
        }
        if (presence && presenceState) {
          const node = element!;
          member = {
            element: node,
            visualElement: ve,
            key: untrack(() => props.key),
            exiting: false,
            exit: () =>
              presenceState.exit((absent) => {
                if (layout?.isMounted) {
                  const id = "layout";
                  absent.register(id);
                  layout.exit(() => absent.onExitComplete!(id));
                }
                ve.update(ve.props, absent);
                ve.updateFeatures();
              }),
            finalize,
          };
          unregister = presence.register(member);
        }
      };

      const update = (latest: MotionNodeOptions) => {
        if (ve.props !== latest) {
          ve.update(latest, presenceState?.present ?? null);
        }
        ve.updateFeatures();
        ve.scheduleRenderMicrotask();
        scheduleAnimateChanges(ve);
        settleReturningValues();
      };

      applyProps = (latest) => {
        if (!element) return;
        if (!isMounted) {
          /**
           * AnimatePresence mode="wait" creates entering children
           * before it inserts them. Mount once it does.
           */
          if (presence?.isWithheld(element)) {
            cancelDeferredMount?.();
            cancelDeferredMount = presence.deferMount(element, () => {
              const current = untrack(motionProps);
              mount(current);
              update(current);
            });
            return;
          }
          mount(latest);
        }
        update(latest);
      };

      onCleanup(() => {
        isDisposed = true;
        cancelDeferredMount?.();
        leavePresenceEntrants?.();
        if (!isMounted) return;

        // Disposal runs before Solid removes the element.
        const isLayout = layout?.isMounted;
        if (isLayout) {
          snapshotLayout(scopeOf(layout!.projection), layout!.projection);
        }

        if (member) {
          /**
           * AnimatePresence claims members whose top-level child it
           * removes, in this same flush. Unclaimed members (removed
           * deeper inside a child that stays) unmount right away.
           */
          const claimable = member;
          queueMicrotask(() => claimable.exiting || finalize());
        } else {
          finalize();
        }

        if (isLayout) commitLayout();
      });
    }

    /*
     * This effect and the layout one below are created on the server too,
     * where they do nothing: Solid numbers owners for hydration, so both
     * sides must create the same computations in the same order.
     */
    createEffect(motionProps, (latest) => applyProps?.(latest));

    /** Which props reach the rendered element (Motion for React's filterProps). */
    const isForwarded = (key: string) => {
      if (key === "children" || key === "ref" || key === "style" || key === "key") {
        return false;
      }
      if (key === "values" && typeof untrack(() => props.values) === "object") {
        return false;
      }
      const isMotionProp = isValidMotionProp(key);
      const isValid = key.startsWith("on")
        ? !isMotionProp
        : (config.isValidProp?.(key) ?? !isMotionProp);
      if (isDOM) {
        // An element would stringify a motion value. (A component's prop
        // isn't read here: that would evaluate JSX props it may not use.)
        return (
          (isValid || (forwardMotionProps && isMotionProp)) &&
          !isMotionValue(untrack(() => props[key]))
        );
      }
      return isValid || (forwardMotionProps && isMotionProp) || !isMotionProp;
    };
    const elementProps = omit(props, (key) => typeof key !== "string" || !isForwarded(key));

    const initialRender = buildInitialRender(
      visualState.latestValues,
      initialProps,
      component,
      isSVG,
    );
    const style = () => ({
      ...rawStyles({
        style: styleProp(),
        layout: props.layout as MotionNodeOptions["layout"],
        layoutId: props.layoutId as string | undefined,
      }),
      ...initialRender.style,
    });
    /** Tap targets are focusable, like a button. Tags only: a component keeps its own default. */
    const tabindex = () =>
      props.tabindex ?? (props.whileTap || props.onTap || props.onTapStart ? 0 : undefined);

    const setElement = (instance: Element) => {
      element = instance;
      enterPresence?.(instance);
      const ref = untrack(() => props.ref);
      if (ref) applyRef(ref as (el: Element) => void, instance);
    };

    /** A motion value child's text node, made once per value. */
    let valueChild: { value: MotionValue; text: Text; stop: VoidFunction } | undefined;
    onCleanup(() => valueChild?.stop());

    /**
     * A motion value child renders as text, updated outside Solid. Cached:
     * a component may read its children many times, or outside an owner.
     */
    const renderChild = (child: unknown): JSX.Element => {
      if (!isMotionValue(child)) {
        // No longer a motion value: drop the old one's subscription.
        valueChild?.stop();
        valueChild = undefined;
        return child as JSX.Element;
      }
      if (isServer) return `${child.get()}`;
      if (valueChild?.value !== child) {
        valueChild?.stop();
        const text = document.createTextNode(`${child.get()}`);
        const stop = child.on("change", (latest) => {
          text.data = `${latest}`;
        });
        valueChild = { value: child, text, stop };
      }
      return valueChild.text;
    };

    /** Rendered inside the MotionContext so children resolve against it. */
    const MotionElement = () => {
      /**
       * A tag's children resolve here, so a change of them re-measures
       * layout. A component reads its own lazily: inside any context it
       * provides, and only if it renders them.
       */
      const resolved = isDOM ? children(() => renderChild(props.children)) : undefined;

      createEffect(
        () => {
          const latest = motionProps();
          // A change of children is a re-render of this node.
          if (latest.layoutDependency === undefined) resolved?.();
          if (layout && isMounted && !isDisposed) {
            untrack(() => layout.willUpdate(latest));
          }
          return latest;
        },
        (latest) => {
          if (!layout || !isMounted || isDisposed) return;
          if (layout.isMounted) layout.didUpdate();
          else if (isLayoutNode(latest)) layout.mount(latest);
        },
      );

      return createComponent(
        Rendered,
        merge(
          elementProps,
          initialRender.attrs,
          isDOM && {
            get tabindex() {
              return tabindex();
            },
          },
          {
            get style() {
              return style();
            },
            ref: setElement,
            get children() {
              return resolved ? resolved() : renderChild(props.children);
            },
          },
        ),
      );
    };

    return createComponent(MotionContext, {
      value: context,
      get children() {
        return createComponent(MotionElement, {});
      },
    });
  };
}
