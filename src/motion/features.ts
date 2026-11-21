import {
  addDomEvent,
  addPinchListeners,
  addPointerEvent,
  createAnimationState,
  extractEventInfo,
  Feature,
  frame,
  hover,
  isAnimationControls,
  PanSession,
  press,
  resolveVariant,
  setFeatureDefinitions,
  variantPriorityOrder,
  type FeatureClass,
  type MotionNodeOptions,
  type PanInfo,
  type PinchProps,
  type PointerEventOptions,
  type VisualElement,
} from "motion-dom";
import { pipe } from "motion-utils";
import type { ViewportOptions } from "../types";

/*
 * VisualElement features, ported from Motion for React. They're plain
 * classes driven by `visualElement.updateFeatures()`, so they need nothing
 * from the component layer.
 */

class AnimationFeature extends Feature<unknown> {
  unmountControls?: VoidFunction;

  constructor(node: VisualElement) {
    super(node);
    node.animationState ||= createAnimationState(node);
  }

  updateAnimationControlsSubscription() {
    const { animate } = this.node.getProps();
    if (isAnimationControls(animate)) {
      this.unmountControls = animate.subscribe(this.node);
    }
  }

  mount() {
    this.updateAnimationControlsSubscription();
  }

  update() {
    if (this.node.getProps().animate !== this.node.prevProps?.animate) {
      this.updateAnimationControlsSubscription();
    }
  }

  unmount() {
    this.node.animationState!.reset();
    this.unmountControls?.();
  }
}

let exitId = 0;

class ExitAnimationFeature extends Feature<unknown> {
  private id = exitId++;

  /** The running exit animation, or true once it has completed. */
  private exit?: Promise<unknown> | true;

  update() {
    const { presenceContext, animationState } = this.node;
    if (!presenceContext || !animationState) return;

    const { isPresent, onExitComplete } = presenceContext;
    if (isPresent === !this.exit) return;

    if (isPresent) {
      if (this.exit === true) {
        const { initial } = this.node.getProps();
        if (initial && !Array.isArray(initial)) {
          const {
            transition: _transition,
            transitionEnd: _transitionEnd,
            ...target
          } = resolveVariant(this.node, initial as never) || {};
          for (const key in target) {
            this.node.getValue(key)?.jump(target[key as keyof typeof target] as never);
          }
        }
        this.node.blockInitialAnimation = false;
        animationState.reset();
        void animationState.animateChanges();
      } else {
        void animationState.setActive("exit", false);
      }
      this.exit = undefined;
      return;
    }

    const exit = (this.exit = animationState.setActive("exit", true));
    if (onExitComplete) {
      void exit.then(() => {
        if (this.exit !== exit) return;
        this.exit = true;
        onExitComplete(this.id);
      });
    }
  }

  mount() {
    const { register } = this.node.presenceContext || {};
    if (register) this.unmount = register(this.id, this.node);
    this.update();
  }

  unmount() {}
}

/**
 * Toggles `while{gesture}` and fires `on{gesture}{lifecycle}` callbacks.
 */
function handleGestureEvent(
  node: VisualElement<Element>,
  event: PointerEvent,
  gesture: "Hover" | "Tap",
  lifecycle: "Start" | "End" | "Cancel" | "",
  isRepeat?: boolean,
) {
  const props = node.props as MotionNodeOptions & Record<string, unknown>;
  const whileKey = ("while" + gesture) as "whileHover" | "whileTap";

  if (!isRepeat && node.animationState && props[whileKey]) {
    void node.animationState.setActive(whileKey, lifecycle === "Start");
  }

  const callback = props["on" + gesture + lifecycle] as
    | ((event: PointerEvent, info: unknown) => void)
    | undefined;
  if (callback) {
    frame.postRender(() => callback(event, extractEventInfo(event)));
  }
}

class HoverGesture extends Feature<Element> {
  mount() {
    const { current } = this.node;
    if (!current) return;

    this.unmount = hover(current, (_element, startEvent) => {
      handleGestureEvent(this.node, startEvent, "Hover", "Start");
      return (endEvent) => handleGestureEvent(this.node, endEvent, "Hover", "End");
    });
  }

  unmount() {}
}

class PressGesture extends Feature<Element> {
  /** press() reads its options on each press, so this object is updated in place. */
  private options: PointerEventOptions = {};

  mount() {
    const { current } = this.node;
    if (!current) return;

    this.update();

    const handle = (
      event: PointerEvent,
      lifecycle: "Start" | "" | "Cancel",
      isRepeat?: boolean,
    ) => {
      const element = this.node.current;
      if (element instanceof HTMLButtonElement && element.disabled) return;
      handleGestureEvent(this.node, event, "Tap", lifecycle, isRepeat);
    };

    this.unmount = press(
      current,
      (_element, startEvent) => {
        handle(startEvent, "Start");
        return {
          onComplete: (endEvent, { success }) => handle(endEvent, success ? "" : "Cancel"),
          onRepeat: () => handle(startEvent, "", true),
        };
      },
      this.options,
    );
  }

  update() {
    const { options, node } = this;
    const { globalTapTarget, propagate, tap } = node.props;
    for (const key in options) delete options[key as keyof typeof options];
    Object.assign(options, tap, {
      useGlobalTarget: globalTapTarget,
      stopPropagation: propagate?.tap === false,
    });
  }

  unmount() {}
}

class FocusGesture extends Feature<Element> {
  private isActive = false;

  onFocus() {
    let isFocusVisible = false;
    try {
      isFocusVisible = this.node.current!.matches(":focus-visible");
    } catch {
      isFocusVisible = true;
    }
    if (!isFocusVisible || !this.node.animationState) return;

    void this.node.animationState.setActive("whileFocus", true);
    this.isActive = true;
  }

  onBlur() {
    if (!this.isActive || !this.node.animationState) return;
    void this.node.animationState.setActive("whileFocus", false);
    this.isActive = false;
  }

  mount() {
    const element = this.node.current!;
    this.unmount = pipe(
      addDomEvent(element, "focus", () => this.onFocus()),
      addDomEvent(element, "blur", () => this.onBlur()),
    ) as VoidFunction;
  }

  unmount() {}
}

/*
 * IntersectionObservers are shared per root and settings. Each element has
 * one callback, so the callbacks of every observer share one map.
 */
const intersectionCallbacks = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>();
const intersectionObservers = new WeakMap<Element | Document, Map<string, IntersectionObserver>>();

function observeIntersection(
  element: Element,
  { root, ...options }: IntersectionObserverInit,
  callback: (entry: IntersectionObserverEntry) => void,
) {
  const lookupRoot = root || document;
  let rootObservers = intersectionObservers.get(lookupRoot);
  if (!rootObservers) intersectionObservers.set(lookupRoot, (rootObservers = new Map()));
  const key = JSON.stringify(options);
  let observer = rootObservers.get(key);
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => intersectionCallbacks.get(entry.target)?.(entry)),
      { root, ...options },
    );
    rootObservers.set(key, observer);
  }
  intersectionCallbacks.set(element, callback);
  observer.observe(element);
  return () => {
    intersectionCallbacks.delete(element);
    observer.unobserve(element);
  };
}

const thresholds = { some: 0, all: 1 };

/** MotionProps types `viewport.root` as an element rather than React's ref object. */
const viewportOf = (props: MotionNodeOptions | undefined) =>
  (props?.viewport ?? {}) as unknown as ViewportOptions;

/** `whileInView`, `onViewportEnter` and `onViewportLeave`. */
class InViewFeature extends Feature<Element> {
  private hasEnteredView = false;
  private isInView = false;
  private stopObserver?: VoidFunction;

  private startObserver() {
    this.stopObserver?.();
    const { current } = this.node;
    if (!current || typeof IntersectionObserver === "undefined") return;

    const { root, margin, amount = "some" } = viewportOf(this.node.getProps());
    this.stopObserver = observeIntersection(
      current,
      {
        root,
        rootMargin: margin,
        threshold: typeof amount === "number" ? amount : thresholds[amount],
      },
      (entry) => {
        const { isIntersecting } = entry;
        if (this.isInView === isIntersecting) return;
        this.isInView = isIntersecting;

        // Read live, so `once` and the callbacks can change after mount.
        if (viewportOf(this.node.getProps()).once && !isIntersecting && this.hasEnteredView) {
          return;
        }
        if (isIntersecting) this.hasEnteredView = true;

        void this.node.animationState?.setActive("whileInView", isIntersecting);
        const { onViewportEnter, onViewportLeave } = this.node.getProps();
        (isIntersecting ? onViewportEnter : onViewportLeave)?.(entry);
      },
    );
  }

  mount() {
    this.startObserver();
  }

  update() {
    const previous = viewportOf(this.node.prevProps);
    const viewport = viewportOf(this.node.getProps());
    const hasChanged = (["amount", "margin", "root"] as const).some(
      (name) => viewport[name] !== previous[name],
    );
    if (hasChanged) this.startObserver();
  }

  unmount() {
    this.stopObserver?.();
    this.stopObserver = undefined;
    this.hasEnteredView = false;
    this.isInView = false;
  }
}

/** `onPanSessionStart`, `onPanStart`, `onPan` and `onPanEnd`. */
class PanGesture extends Feature<Element> {
  private session?: PanSession;
  private removePointerDownListener?: VoidFunction;

  private createHandlers() {
    const props = this.node.getProps();
    // PanSession types its events as Event; they're the pointer events it listens to.
    const onFrame =
      (name: "onPanSessionStart" | "onPanStart" | "onPan") => (event: Event, info: PanInfo) => {
        const pointerEvent = event as PointerEvent;
        // Pan handlers run in the frame's update step, as in React.
        if (props[name]) frame.update(() => props[name]?.(pointerEvent, info), false, true);
      };
    return {
      onSessionStart: onFrame("onPanSessionStart"),
      onStart: onFrame("onPanStart"),
      onMove: onFrame("onPan"),
      onEnd: (event: Event, info: PanInfo) => {
        this.session = undefined;
        const pointerEvent = event as PointerEvent;
        if (props.onPanEnd) frame.postRender(() => props.onPanEnd?.(pointerEvent, info));
      },
    };
  }

  mount() {
    const { current } = this.node;
    if (!current) return;
    this.removePointerDownListener = addPointerEvent(current, "pointerdown", (event) => {
      this.session = new PanSession(event, this.createHandlers(), {
        transformPagePoint: this.node.getTransformPagePoint(),
        contextWindow: current.ownerDocument.defaultView,
      });
    });
  }

  update() {
    this.session?.updateHandlers(this.createHandlers());
  }

  unmount() {
    this.removePointerDownListener?.();
    this.session?.end();
  }
}

const pinchValueKeys = ["scale", "rotate", "x", "y"] as const;

/** The `pinch` prop and `whilePinch`. */
class PinchGesture extends Feature<HTMLElement | SVGElement> {
  /** The element's touch-action not set by `style`, restored when pinch turns off. */
  private touchAction = "";

  /** The touch-action `style` sets, in either key style. */
  private styleTouchAction() {
    const { style } = this.node.getProps() as { style?: Record<string, unknown> };
    const own = style?.touchAction ?? style?.["touch-action"];
    return typeof own === "string" && own ? own : undefined;
  }

  mount() {
    const { current } = this.node;
    if (!current) return;
    // Inline touch-action from `style` is Solid's to set and clear.
    if (!this.styleTouchAction()) this.touchAction = current.style.touchAction;
    this.update();

    /**
     * The latest enabled options. addPinchListeners reads them before
     * each step, so a pinch disabled mid-way still calls its `onEnd`.
     */
    let options: PinchProps = {};
    const call =
      (key: "onStart" | "onMove" | "onEnd") =>
      (event: Event, info: Parameters<NonNullable<PinchProps["onMove"]>>[1]) =>
        options[key]?.(event, info);

    this.unmount = addPinchListeners(
      current,
      () => pinchValueKeys.map((key) => this.node.getValue(key, key === "scale" ? 1 : 0)) as never,
      () => {
        const { pinch } = this.node.getProps();
        return pinch && (options = pinch === true ? {} : pinch);
      },
      (_element, event, info) => {
        const setActive = (isActive: boolean) =>
          void this.node.animationState?.setActive("whilePinch", isActive);
        setActive(true);
        call("onStart")(event, info);
        return {
          onPinch: call("onMove"),
          onComplete: (endEvent, endInfo) => {
            setActive(false);
            call("onEnd")(endEvent, endInfo);
          },
        };
      },
    );
  }

  /**
   * Stops touches panning or zooming the page while pinch is on, unless
   * `style` sets a touch-action (like "pan-y", for a list that still
   * scrolls with one finger).
   */
  update() {
    const element = this.node.current;
    if (!element) return;
    const { pinch } = this.node.getProps();
    element.style.touchAction = this.styleTouchAction() ?? (pinch ? "none" : this.touchAction);
  }

  unmount() {}
}

const enabledBy =
  (...names: string[]) =>
  (props: MotionNodeOptions) =>
    names.some((name) => !!props[name as keyof MotionNodeOptions]);

// motion-dom types feature constructors as `new (props: unknown)`; they're
// constructed with the VisualElement.
const asFeature = (feature: new (node: VisualElement<never>) => Feature) =>
  feature as unknown as FeatureClass;

let initialized = false;

/**
 * Registers the features this package supports. Layout isn't a Feature
 * here: it's wired into the component, which owns the reactive timing.
 */
export function initFeatures() {
  if (initialized) return;
  initialized = true;

  setFeatureDefinitions({
    animation: {
      isEnabled: enabledBy("variants", ...variantPriorityOrder),
      Feature: asFeature(AnimationFeature),
    },
    exit: { isEnabled: enabledBy("exit"), Feature: asFeature(ExitAnimationFeature) },
    hover: {
      isEnabled: enabledBy("whileHover", "onHoverStart", "onHoverEnd"),
      Feature: asFeature(HoverGesture),
    },
    tap: {
      isEnabled: enabledBy("whileTap", "onTap", "onTapStart", "onTapCancel"),
      Feature: asFeature(PressGesture),
    },
    focus: { isEnabled: enabledBy("whileFocus"), Feature: asFeature(FocusGesture) },
    inView: {
      isEnabled: enabledBy("whileInView", "onViewportEnter", "onViewportLeave"),
      Feature: asFeature(InViewFeature),
    },
    pan: {
      isEnabled: enabledBy("onPan", "onPanStart", "onPanSessionStart", "onPanEnd"),
      Feature: asFeature(PanGesture),
    },
    pinch: { isEnabled: enabledBy("pinch"), Feature: asFeature(PinchGesture) },
  });
}
