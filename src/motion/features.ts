import {
  addDomEvent,
  createAnimationState,
  extractEventInfo,
  Feature,
  frame,
  hover,
  isAnimationControls,
  press,
  resolveVariant,
  setFeatureDefinitions,
  type FeatureClass,
  type MotionNodeOptions,
  type PointerEventOptions,
  type VisualElement,
} from "motion-dom";
import { pipe } from "motion-utils";

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
      isEnabled: enabledBy(
        "variants",
        "animate",
        "whileInView",
        "whileFocus",
        "whileHover",
        "whileTap",
        "whileDrag",
        "exit",
      ),
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
  });
}
