import { createScopedAnimate, type Timeline } from "motion";
import {
  hasReducedMotionListener,
  initPrefersReducedMotion,
  prefersReducedMotion,
  type AnimationScope,
} from "motion-dom";
import { onCleanup, useContext } from "solid-js";
import { MotionConfigContext } from "./context";

/**
 * The element `animate()` resolves selectors within: pass it as a `ref`,
 * or call it with the element.
 */
export type AnimateScope<T extends Element = Element> = AnimationScope<T | null> &
  ((element: T) => void);

// Motion names no type for the scoped animate function.
type ScopedAnimate = ReturnType<typeof createScopedAnimate>;

/**
 * Animates elements, motion values and sequences, scoped to an element
 * (React: `useAnimate`). Selectors resolve inside the scope, animations
 * follow `MotionConfig`'s `reducedMotion` and `skipAnimations`, and all of
 * them stop when the owner is disposed.
 *
 * ```tsx
 * const [scope, animate] = createAnimate();
 * onSettled(() => {
 *   animate("li", { opacity: 1 }, { delay: stagger(0.1) });
 * });
 * return <ul ref={scope}>...</ul>;
 * ```
 */
export function createAnimate<T extends Element = Element>(): [AnimateScope<T>, ScopedAnimate] {
  const config = useContext(MotionConfigContext);

  const shouldReduceMotion = () => {
    const { reducedMotion } = config;
    if (reducedMotion === "always") return true;
    if (reducedMotion !== "user") return false;
    if (!hasReducedMotionListener.current) initPrefersReducedMotion();
    return prefersReducedMotion.current ?? undefined;
  };

  const ref = Object.assign(
    (element: T) => {
      ref.current = element;
    },
    { current: null as T | null, animations: [] as AnimationScope["animations"] },
  );
  // Read live by timelines created with this scope, also when they rebuild
  // after MotionConfig or the OS setting changes.
  Object.defineProperties(ref, {
    reduceMotion: { get: shouldReduceMotion },
    skipAnimations: { get: () => config.skipAnimations },
  });
  const scope: AnimateScope<T> = ref;

  const animate = (...args: unknown[]) => {
    const { reduceMotion, skipAnimations } = scope;
    const scoped = createScopedAnimate({ scope, reduceMotion, skipAnimations });
    return (scoped as (...args: unknown[]) => Timeline)(...args);
  };

  onCleanup(() => {
    scope.animations.forEach((animation) => animation.stop());
    scope.animations.length = 0;
  });

  // The rest parameters stand in for createScopedAnimate's overloads.
  return [scope, animate as ScopedAnimate];
}
