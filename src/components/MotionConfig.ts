import type { JSX } from "@solidjs/web";
import { createComponent, useContext } from "solid-js";
import { MotionConfigContext, type MotionConfigValue } from "../context";

export interface MotionConfigProps extends MotionConfigValue {
  children?: JSX.Element;
}

/**
 * Sets defaults for the motion components inside. Unset options inherit
 * from the closest MotionConfig above. Options are read live.
 */
export function MotionConfig(props: MotionConfigProps): JSX.Element {
  const parent = useContext(MotionConfigContext);
  const value: MotionConfigValue = {
    get transition() {
      return props.transition ?? parent.transition;
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
