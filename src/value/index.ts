import {
  attachSpring,
  isMotionValue,
  mapValue,
  motionValue,
  transformValue,
  type AnyResolvedKeyframe,
  type MotionValue,
  type MotionValueEventCallbacks,
  type SpringOptions,
  type TransformOptions,
} from "motion-dom";
import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js";

/**
 * Motion values hold animated state outside Solid's graph: setting one
 * renders the motion components that use it on the next frame, without
 * re-running any computation. Each primitive below is owned: it's destroyed
 * when its owner (usually the component) is disposed.
 */

function owned<V>(value: MotionValue<V>) {
  onCleanup(() => value.destroy());
  return value;
}

/** Creates a `MotionValue` (React: `useMotionValue`). */
export function createMotionValue<V>(initial: V): MotionValue<V> {
  return owned(motionValue(initial));
}

type InputRange = number[];

/**
 * Derives a `MotionValue` from others (React: `useTransform`).
 *
 * ```tsx
 * const doubled = createTransform(() => x.get() * 2)
 * const opacity = createTransform(x, [0, 100], [1, 0])
 * const label = createTransform(x, (latest) => `${latest}px`)
 * ```
 */
export function createTransform<O>(transformer: () => O): MotionValue<O>;
export function createTransform<O>(
  input: MotionValue<number>,
  inputRange: InputRange,
  outputRange: O[],
  options?: TransformOptions<O>,
): MotionValue<O>;
export function createTransform<I, O>(
  input: MotionValue<I>,
  transformer: (latest: I) => O,
): MotionValue<O>;
export function createTransform<I, O>(
  input: MotionValue<I>[],
  transformer: (latest: I[]) => O,
): MotionValue<O>;
export function createTransform<I, O>(
  input: (() => O) | MotionValue<I> | MotionValue<I>[],
  transformerOrRange?: ((latest: never) => O) | InputRange,
  outputRange?: O[],
  options?: TransformOptions<O>,
): MotionValue<O> {
  if (typeof input === "function") return owned(transformValue(input));

  if (Array.isArray(transformerOrRange)) {
    return owned(
      mapValue(
        // The overloads only pair a range with a single numeric input.
        input as unknown as MotionValue<number>,
        transformerOrRange,
        outputRange!,
        options,
      ),
    );
  }

  const transformer = transformerOrRange as (latest: unknown) => O;
  return owned(
    transformValue(() =>
      transformer(Array.isArray(input) ? input.map((value) => value.get()) : input.get()),
    ),
  );
}

/**
 * Animates to its source with a spring (React: `useSpring`). The source can
 * be a motion value, a fixed value, or an accessor: a signal or prop the
 * spring follows reactively.
 *
 * ```tsx
 * const x = createSpring(() => props.offset, { stiffness: 300 })
 * ```
 */
export function createSpring<V extends AnyResolvedKeyframe>(
  source: V | MotionValue<V> | Accessor<V>,
  options?: SpringOptions,
): MotionValue<V> {
  let target: V | MotionValue<V>;
  if (typeof source === "function") {
    const accessor = source as Accessor<V>;
    const followed = createMotionValue(untrack(accessor));
    createEffect(accessor, (latest) => {
      followed.set(latest);
    });
    target = followed;
  } else {
    target = source;
  }

  const value = createMotionValue(isMotionValue(target) ? target.get() : target);
  onCleanup(attachSpring(value, target, options));
  return value;
}

/**
 * Combines strings and motion values into a string motion value
 * (React: `useMotionTemplate`).
 *
 * ```tsx
 * const shadow = createMotionTemplate`0 0 ${blur}px rgba(0,0,0,0.3)`
 * ```
 */
export function createMotionTemplate(
  fragments: TemplateStringsArray,
  ...values: Array<MotionValue | number | string>
): MotionValue<string> {
  return createTransform(() => {
    let output = "";
    for (let i = 0; i < fragments.length; i++) {
      output += fragments[i];
      const value = values[i];
      if (value !== undefined) {
        output += isMotionValue(value) ? value.get() : value;
      }
    }
    return output;
  });
}

/**
 * Subscribes to a motion value event for the owner's lifetime
 * (React: `useMotionValueEvent`).
 */
export function createMotionValueEvent<V, EventName extends keyof MotionValueEventCallbacks<V>>(
  value: MotionValue<V>,
  event: EventName,
  callback: MotionValueEventCallbacks<V>[EventName],
) {
  onCleanup(value.on(event, callback));
}

/**
 * Reads a motion value as a Solid accessor, for when Solid should react to
 * it (text, conditions, other signals). Setting the value now updates Solid
 * on every change, so prefer passing motion values to `style` directly.
 */
export function fromMotionValue<V>(value: MotionValue<V>): Accessor<V> {
  // Motion values can be set from anywhere, including owned scopes.
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  onCleanup(value.on("change", () => setVersion((count) => count + 1)));
  return () => {
    version();
    return value.get();
  };
}
