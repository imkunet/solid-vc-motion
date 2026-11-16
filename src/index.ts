export { AnimatePresence, type AnimatePresenceProps } from "./components/AnimatePresence";
export { LayoutGroup, type LayoutGroupProps } from "./components/LayoutGroup";
export { MotionConfig, type MotionConfigProps } from "./components/MotionConfig";
export {
  LayoutGroupContext,
  MotionConfigContext,
  MotionContext,
  type LayoutGroupValue,
  type MotionConfigValue,
  type MotionContextValue,
} from "./context";
export {
  createMotionComponent,
  type MotionComponent,
  type MotionComponentOptions,
} from "./motion/component";
export { motion, type MotionCreate, type MotionElements } from "./motion/proxy";
export { isValidMotionProp } from "./motion/utils";
export type {
  HTMLMotionProps,
  MotionChildren,
  MotionComponentProps,
  MotionProps,
  MotionStyle,
} from "./types";
export {
  createMotionTemplate,
  createMotionValue,
  createMotionValueEvent,
  createSpring,
  createTransform,
  fromMotionValue,
} from "./value";
export {
  isMotionValue,
  motionValue,
  stagger,
  MotionValue,
  transform,
  type SpringOptions,
  type TargetAndTransition,
  type Transition,
  type Variant,
  type Variants,
} from "motion-dom";
