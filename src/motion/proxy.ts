import type { JSX } from "@solidjs/web";
import type { Component } from "solid-js";
import type { HTMLMotionProps } from "../types";
import { createMotionComponent, type MotionComponent } from "./component";

export type MotionElements = {
  [Tag in keyof JSX.IntrinsicElements]: Component<HTMLMotionProps<Tag>>;
};

export interface MotionCreate {
  /**
   * Makes a tag or component a motion component. A component must pass its
   * `ref` to the element it renders.
   */
  create: typeof createMotionComponent;
}

const components = new Map<string, MotionComponent<string>>();

/**
 * `motion.div`, `motion.svg`, `motion.circle`… render the element with motion
 * props. Components are created on first access and reused.
 */
export const motion = new Proxy(
  { create: createMotionComponent } as MotionCreate & MotionElements,
  {
    get(_target, key) {
      if (key === "create") return createMotionComponent;
      if (typeof key !== "string") return undefined;

      let component = components.get(key);
      if (!component) {
        component = createMotionComponent(key);
        components.set(key, component);
      }
      return component;
    },
  },
);
