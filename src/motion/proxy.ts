import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";
import type { Component } from "solid-js";
import type { HTMLMotionProps, MotionComponentProps } from "../types";
import {
  createMotionComponent,
  type MotionComponent,
  type MotionComponentOptions,
} from "./component";

export type MotionElements = {
  [Tag in keyof JSX.IntrinsicElements]: Component<HTMLMotionProps<Tag>>;
};

export interface MotionCreate {
  /**
   * Makes a tag or component a motion component. A component must pass its
   * `ref` to the element it renders.
   */
  create<C extends ValidComponent>(
    component: C,
    options?: MotionComponentOptions,
  ): Component<MotionComponentProps<ComponentProps<C>>>;
}

const create = (component: ValidComponent, options?: MotionComponentOptions) =>
  createMotionComponent(component, options);

const components = new Map<string, MotionComponent>();

/**
 * `motion.div`, `motion.svg`, `motion.circle`… render the element with motion
 * props. Components are created on first access and reused.
 */
export const motion = new Proxy({ create } as MotionCreate & MotionElements, {
  get(_target, key) {
    if (key === "create") return create;
    if (typeof key !== "string") return undefined;

    let component = components.get(key);
    if (!component) {
      component = createMotionComponent(key);
      components.set(key, component);
    }
    return component;
  },
});
