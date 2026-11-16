import type { JSX } from "@solidjs/web";
import type * as CSS from "csstype";
import type {
  MotionNodeAdvancedOptions,
  MotionNodeAnimationOptions,
  MotionNodeEventOptions,
  MotionNodeFocusHandlers,
  MotionNodeHoverHandlers,
  MotionNodeLayoutOptions,
  MotionNodeTapHandlers,
  MotionValue,
  PropagateOptions,
  SVGPathProperties,
  TransformProperties,
} from "motion-dom";

type StyleMotionValue = MotionValue<number> | MotionValue<string>;

type WithMotionValues<T> = {
  [K in keyof T]?: T[K] | StyleMotionValue;
};

/**
 * `style` accepts CSS in camelCase (like Motion for React) or kebab-case
 * (like Solid), transform shorthands (`x`, `scale`, `rotate`…) and motion
 * values for any of them.
 */
export type MotionStyle = WithMotionValues<CSS.Properties<string | number>> &
  WithMotionValues<CSS.PropertiesHyphen<string | number>> &
  WithMotionValues<TransformProperties> &
  WithMotionValues<SVGPathProperties> & {
    [variable: `--${string}`]: string | number | StyleMotionValue | undefined;
  };

export interface MotionProps
  extends
    MotionNodeAnimationOptions,
    MotionNodeEventOptions,
    MotionNodeTapHandlers,
    MotionNodeHoverHandlers,
    MotionNodeFocusHandlers,
    MotionNodeLayoutOptions,
    MotionNodeAdvancedOptions {
  style?: MotionStyle;
  propagate?: PropagateOptions;
  /**
   * Identity inside AnimatePresence, like React's `key`: an entering element
   * takes over from an exiting one with the same key. Without keys, an
   * element entering where one is exiting (that nothing else replaced)
   * takes over from it.
   */
  key?: string | number;
}

export type MotionChildren = JSX.Element | StyleMotionValue;

/**
 * Props of a `motion.<tag>` component: the element's own attributes with the
 * motion props layered on top (a motion prop wins on a name clash, e.g.
 * `onAnimationStart`).
 */
export type HTMLMotionProps<Tag extends keyof JSX.IntrinsicElements> = Omit<
  JSX.IntrinsicElements[Tag],
  keyof MotionProps | "children"
> &
  MotionProps & { children?: MotionChildren };

export type MotionComponentProps<Props> = Omit<Props, keyof MotionProps | "children"> &
  MotionProps & { children?: MotionChildren };
