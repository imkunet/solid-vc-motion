import { scroll, type scrollInfo } from "motion";
import {
  supportsScrollTimeline,
  type AccelerateConfig,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion-dom";
import { createEffect, onCleanup, untrack, type Accessor } from "solid-js";
import { createMotionValue } from ".";

type ElementSource = Element | null | undefined | Accessor<Element | null | undefined>;

// Motion doesn't export the options type of scrollInfo().
type ScrollInfoOptions = NonNullable<Parameters<typeof scrollInfo>[1]>;

export interface ScrollOptions extends Omit<ScrollInfoOptions, "container" | "target"> {
  /**
   * The scrolling element to track, or an accessor for it (a signal set by
   * a `ref`). Defaults to the page. Tracking starts once it resolves.
   */
  container?: ElementSource;
  /**
   * The element whose progress through the container `offset` measures.
   * Defaults to the container's content. Tracking starts once it resolves.
   */
  target?: ElementSource;
}

export interface ScrollMotionValues {
  scrollX: MotionValue<number>;
  scrollY: MotionValue<number>;
  scrollXProgress: MotionValue<number>;
  scrollYProgress: MotionValue<number>;
  /** The maximum scroll offset of each axis. */
  scrollXLength: MotionValue<number>;
  scrollYLength: MotionValue<number>;
}

const read = (source: ElementSource) =>
  (typeof source === "function" ? source() : source) ?? undefined;

/**
 * Motion values that track scroll (React: `useScroll`): the position,
 * progress (0 to 1) and length of each axis, of the page or of
 * `container`. With `target` and `offset`, progress is how far the target
 * has crossed the container.
 *
 * Restarts when `container` or `target` change, and stops when the owner is
 * disposed.
 *
 * ```tsx
 * const [card, setCard] = createSignal<HTMLElement>();
 * const { scrollYProgress } = createScroll({ target: card, offset: ["start end", "end start"] });
 * return <motion.div ref={setCard} style={{ opacity: scrollYProgress }} />;
 * ```
 */
export function createScroll({
  container,
  target,
  ...options
}: ScrollOptions = {}): ScrollMotionValues {
  const values: ScrollMotionValues = {
    scrollX: createMotionValue(0),
    scrollY: createMotionValue(0),
    scrollXProgress: createMotionValue(0),
    scrollYProgress: createMotionValue(0),
    scrollXLength: createMotionValue(0),
    scrollYLength: createMotionValue(0),
  };

  /** Neither source is set but unresolved, so tracking can start. */
  const resolve = () => {
    const resolved = { container: read(container), target: read(target) };
    if ((container && !resolved.container) || (target && !resolved.target)) return;
    return resolved;
  };

  /**
   * Progress bound to an accelerable style (like `opacity`) can run on a
   * native ScrollTimeline. Offsets aren't supported by ScrollTimeline, and
   * targets (ViewTimeline) are tracked from JS.
   */
  interface Accelerated {
    axis: "x" | "y";
    stop?: VoidFunction;
  }
  const accelerated = new Map<AnimationPlaybackControls, Accelerated>();
  /**
   * (Re)attaches an accelerated animation to the resolved container. Until
   * it resolves the animation is paused, or it would play out on its own.
   */
  const attach = (animation: AnimationPlaybackControls, entry: Accelerated) => {
    entry.stop?.();
    entry.stop = undefined;
    const resolved = untrack(resolve);
    if (!resolved) {
      animation.pause();
      return;
    }
    entry.stop = scroll(animation, {
      ...options,
      axis: entry.axis,
      container: resolved.container,
    });
    animation.play();
  };
  if (!target && !options.offset && typeof window !== "undefined" && supportsScrollTimeline()) {
    const accelerate = (axis: "x" | "y"): AccelerateConfig => ({
      factory: (animation) => {
        const entry: Accelerated = { axis };
        accelerated.set(animation, entry);
        attach(animation, entry);
        return () => {
          entry.stop?.();
          accelerated.delete(animation);
        };
      },
      times: [0, 1],
      keyframes: [0, 1],
      ease: (progress) => progress,
      duration: 1,
    });
    values.scrollXProgress.accelerate = accelerate("x");
    values.scrollYProgress.accelerate = accelerate("y");
  }

  createEffect(
    // A new array each run, so the effect re-runs whenever a signal source
    // changes. The effect re-reads them untracked, so an accessor over a
    // plain `ref` variable (`() => el`) resolves once the element renders.
    () => [read(container), read(target)],
    () => {
      const resolved = untrack(resolve);
      accelerated.forEach((entry, animation) => attach(animation, entry));
      if (!resolved) return;
      return scroll(
        (_progress, { x, y }) => {
          values.scrollX.set(x.current);
          values.scrollXProgress.set(x.progress);
          values.scrollXLength.set(x.scrollLength);
          values.scrollY.set(y.current);
          values.scrollYProgress.set(y.progress);
          values.scrollYLength.set(y.scrollLength);
        },
        { ...options, ...resolved },
      );
    },
  );
  /**
   * Native timelines can't be detached, so freeze accelerated animations
   * whose element outlives this owner, as the JS-driven values stop too.
   * Elements unmounting first remove their entry before this runs.
   */
  onCleanup(() => {
    accelerated.forEach((entry, animation) => {
      entry.stop?.();
      animation.pause();
    });
    accelerated.clear();
  });

  return values;
}
