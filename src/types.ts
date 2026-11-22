import type { JSX } from "@solidjs/web";
import type * as CSS from "csstype";
import type {
  AnyResolvedKeyframe,
  MotionNodeAdvancedOptions,
  MotionNodeAnimationOptions,
  MotionNodeEventOptions,
  MotionNodeFocusHandlers,
  MotionNodeHoverHandlers,
  MotionNodeLayoutOptions,
  MotionNodeOptions,
  MotionNodePanHandlers,
  MotionNodeTapHandlers,
  MotionNodeViewportOptions,
  MotionValue,
  PropagateOptions,
  SVGPathProperties,
  TransformProperties,
  ViewportOptions as RefViewportOptions,
} from "motion-dom";

/** MotionValue is invariant, so each value type is listed. */
type StyleMotionValue =
  | MotionValue<number>
  | MotionValue<string>
  | MotionValue<AnyResolvedKeyframe>;

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

/** When `whileInView` and `onViewportEnter`/`onViewportLeave` fire. */
export interface ViewportOptions extends Omit<RefViewportOptions, "root"> {
  /** The scrolling element to observe within. Defaults to the viewport. */
  root?: Element | Document | null;
}

export interface MotionProps
  extends
    MotionNodeAnimationOptions,
    MotionNodeEventOptions,
    MotionNodePanHandlers,
    MotionNodeTapHandlers,
    MotionNodeHoverHandlers,
    MotionNodeFocusHandlers,
    Omit<MotionNodeViewportOptions, "viewport">,
    Pick<MotionNodeOptions, "pinch" | "whilePinch">,
    MotionNodeLayoutOptions,
    MotionNodeAdvancedOptions {
  style?: MotionStyle;
  propagate?: PropagateOptions;
  viewport?: ViewportOptions;
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

/**
 * Props of `motion.create(Component)`: the component's props with the
 * motion props layered on top. Its `children` also accept a motion value,
 * forwarded as a text node.
 */
export type MotionComponentProps<Props> = Omit<Props, keyof MotionProps | "children"> &
  MotionProps & {
    children?: "children" extends keyof Props
      ? Props["children" & keyof Props] | MotionChildren
      : MotionChildren;
  };
