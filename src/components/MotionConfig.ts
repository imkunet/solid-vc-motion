import type { JSX } from "@solidjs/web";
import { resolveTransition } from "motion-dom";
import { createComponent, useContext } from "solid-js";
import { MotionConfigContext, type MotionConfigValue } from "../context";

export interface MotionConfigProps extends MotionConfigValue {
  children?: JSX.Element;
}

/**
 * Sets defaults for the motion components inside. Unset options inherit
 * from the closest MotionConfig above; a `transition` with `inherit: true`
 * merges over the parent's. A motion component reads `reducedMotion` and
 * `skipAnimations` once, when it's created; the other options live.
 */
export function MotionConfig(props: MotionConfigProps): JSX.Element {
  const parent = useContext(MotionConfigContext);
  const value: MotionConfigValue = {
    get transition() {
      // Each read reads every MotionConfig above, so read each level once.
      const transition = props.transition;
      if (!transition) return parent.transition;
      return transition.inherit ? resolveTransition(transition, parent.transition) : transition;
    },
    get reducedMotion() {
      return props.reducedMotion ?? parent.reducedMotion;
    },
    get skipAnimations() {
      return props.skipAnimations ?? parent.skipAnimations;
    },
    get transformPagePoint() {
      return props.transformPagePoint ?? parent.transformPagePoint;
    },
    get isValidProp() {
      return props.isValidProp ?? parent.isValidProp;
    },
  };

  return createComponent(MotionConfigContext, {
    value,
    get children() {
      return props.children;
    },
  });
}
