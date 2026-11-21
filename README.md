# solid-vc-motion

> [!WARNING]
> **This project is fully vibecoded.** An AI coding agent (either Claude Opus 5.5 or GPT 6.1 Sol) wrote all of it, including the code, the tests and this README, under human direction. A person has played with the demos but has not reviewed every line.
>
> It's a stopgap until Solid has proper, mature animation libraries. Expect rough edges and bugs. Don't build anything important on it without having a willingness to get your hands dirty. If something better exists by the time you read this, use that.

[Motion](https://motion.dev) for Solid 2.0. It gives you `motion.*` components, motion values, `AnimatePresence`, layout animations (including shared `layoutId` transitions), gestures, scroll animations and `animate()`.

It only covers the Solid side. The animation engine is `motion-dom`, the same package Motion for React runs on, so springs, variants, gestures and layout projection behave the way they do in React. `animate()`, `scroll()` and `inView()` come from `motion`'s main entry, which doesn't use React. The API follows Motion for React, except where Solid works differently.

Requires `solid-js` and `@solidjs/web` 2.0.

```sh
npm install solid-vc-motion solid-js @solidjs/web
```

## Example

```tsx
import { createSignal, Show } from "solid-js";
import { AnimatePresence, motion } from "solid-vc-motion";

function Example() {
  const [open, setOpen] = createSignal(true);
  return (
    <>
      <button onClick={() => setOpen((o) => !o)}>Toggle</button>
      <AnimatePresence>
        <Show when={open()}>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            whileHover={{ scale: 1.05 }}
          />
        </Show>
      </AnimatePresence>
    </>
  );
}
```

## What's included

### `motion` components

Every HTML and SVG element: `motion.div`, `motion.button`, `motion.svg`, `motion.circle` and so on. `motion.create(Component)` works with your own components, as long as they pass `ref` on to the element they render.

Supported props:

- `initial`, `animate`, `exit`, `transition`
- `variants`, including labels inherited by children and `delayChildren: stagger(...)`
- `whileHover`, `whileTap`, `whileFocus`, with `onHoverStart`, `onHoverEnd`, `onTap`, `onTapStart`, `onTapCancel`
- `whileInView`, `onViewportEnter`, `onViewportLeave`, `viewport`
- `onPanSessionStart`, `onPanStart`, `onPan`, `onPanEnd`
- `pinch`, `whilePinch`
- `layout`, `layoutId`, `layoutDependency`, `layoutScroll`, `layoutRoot`
- `style` with motion values and transform shortcuts (`x`, `y`, `scale`, `rotate`...)
- `custom`, `inherit`, `transformTemplate`, `onUpdate`, `onAnimationStart`, `onAnimationComplete`, `onLayoutAnimationStart`, `onLayoutAnimationComplete`

All other props go to the element. Props are reactive: change `animate` and the element animates to the new value. `style` takes camelCase keys (like Motion) or kebab-case keys (like Solid).

`viewport.root` takes the scrolling element itself (React takes a ref object), for example from a signal set by its `ref`:

```tsx
const [list, setList] = createSignal<HTMLElement>();
<ul ref={setList}>
  <motion.li whileInView={{ opacity: 1 }} viewport={{ root: list(), amount: 0.5, once: true }} />
</ul>;
```

`pinch` scales, rotates and moves the element with two touches, a trackpad pinch or Safari's gesture events. Pass options to limit it, such as `pinch={{ scale: { min: 1, max: 4 } }}`. While pinch is on, the element gets `touch-action: none` unless `style` sets a `touch-action`. In React, pinch only works with `pinchFeatures` loaded through `LazyMotion`. Here it always works.

Pan handlers need `touch-action` set on the element (for example `style={{ "touch-action": "none" }}`) to work with touch input, the same as in React.

### `AnimatePresence`

Keeps removed children on screen until their `exit` animation is done. Remove children the usual Solid way, with `<Show>`, `<For>` or `<Switch>`. Use `<Show keyed>` to swap one element for another.

Props: `initial`, `custom`, `mode` (`"sync"`, `"wait"` or `"popLayout"`), `onExitComplete`, `presenceAffectsLayout`.

```tsx
<AnimatePresence mode="wait" custom={direction()}>
  <Show when={page()} keyed>
    {(page) => <motion.img src={page.src} exit={{ opacity: 0 }} />}
  </Show>
</AnimatePresence>
```

Any motion element inside a removed child plays its exit, not just the outermost one.

In React, if you toggle an element off and quickly back on, the same element reverses its exit. Solid always creates a new element, so the new one starts from where the old one was, and the old one is removed. It looks the same. This happens when:

- the new element shows up in the same place as the one leaving, with the same motion elements inside;
- and either nothing else was added when the old one left (a plain `<Show>` toggle), or both have the same `key` prop.

Give elements different `key`s to stop this from happening.

### Layout animations

Add `layout` and the element animates when its size or position changes. `layoutId` lets two different elements animate into each other (tabs, a card that opens into a modal). Children of a `layout` element get stretched while it resizes, the same as in React. Give them `layout` or `layout="position"` to fix that.

React measures layout before every re-render and animates after it. Solid doesn't re-render, so this package measures at these moments instead:

- when a `layout` element is created or removed;
- when its props or children change;
- when its `layoutDependency` changes, if it has one. In that case nothing else triggers it.

Each measurement covers the `layout` elements in the same container (the element's parent, or the parent of an outer `layout` element). Siblings that get pushed around animate. `layout` elements elsewhere on the page move along with the page, like in React.

Sometimes the layout changes for a reason the element can't see, for example a class set on its parent. Use `layoutDependency={value()}` for those. To animate a reordered `<For>` list, wrap it in `LayoutGroup`, or put it inside a `motion` element that has `layout`.

### `LayoutGroup`

Groups `layout` elements so they always measure together. `id` adds a prefix to the `layoutId`s inside, so separate groups can reuse the same ids. It also measures when its direct children are added, removed or reordered.

```tsx
<ul>
  <LayoutGroup>
    <For each={items()}>{(item) => <motion.li layout>{item}</motion.li>}</For>
  </LayoutGroup>
</ul>
```

### `MotionConfig`

Sets defaults for everything inside it: `transition`, `reducedMotion`, `skipAnimations`, `transformPagePoint`, `isValidProp`.

### Motion values

A motion value holds a number or string that animates without re-running any Solid code. Pass it to `style` and only the element updates.

| Motion for React      | This package                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `useMotionValue`      | `createMotionValue(0)`                                                                                 |
| `useTransform`        | `createTransform(() => x.get() * 2)`, `createTransform(x, [0, 100], [1, 0])`, `createTransform(x, fn)` |
| `useSpring`           | `createSpring(x)`. It also takes a signal: `createSpring(() => props.offset)`                          |
| `useMotionTemplate`   | `` createMotionTemplate`blur(${blur}px)` ``                                                            |
| `useMotionValueEvent` | `createMotionValueEvent(x, "change", fn)`                                                              |
| (none)                | `fromMotionValue(x)` turns a motion value into a Solid accessor                                        |
| `useScroll`           | `createScroll()`, `createScroll({ container, target, offset })`                                        |
| `useAnimate`          | `const [scope, animate] = createAnimate()`                                                             |

These are cleaned up when the component that created them is removed. `<motion.span>{count}</motion.span>` renders a motion value as text.

### Scroll animations

`createScroll` returns motion values for `scrollX`, `scrollY`, `scrollXProgress`, `scrollYProgress`, `scrollXLength` and `scrollYLength`. They track the page, or `container` if you give one. With `target` and `offset`, progress measures how far the target has moved through the container. `container` and `target` take an element or an accessor, like a signal set by `ref`. Tracking starts once they resolve and restarts when they change.

```tsx
const [card, setCard] = createSignal<HTMLElement>();
const { scrollYProgress } = createScroll({ target: card, offset: ["start end", "end start"] });
return <motion.div ref={setCard} style={{ opacity: scrollYProgress }} />;
```

A container used with `target` must be positioned (`position: relative` or similar). Otherwise offsets are measured from the wrong element. If page or container progress (with no `target` or `offset`) drives a style the browser can animate natively, such as `opacity`, it runs on a native `ScrollTimeline` where supported. Targets are tracked from JavaScript; in React, some target offsets use a native `ViewTimeline`.

`scroll()` and `scrollInfo()` are also exported.

### `animate()` and `createAnimate`

`animate()` animates elements, selectors, motion values, plain objects and sequences, the same as Motion's `animate`. `createAnimate()` returns a scope and a scoped `animate`. Selectors only match inside the scope, animations follow `MotionConfig`'s `reducedMotion` and `skipAnimations`, and every animation stops when the component is removed. Pass the scope as a `ref`:

```tsx
const [scope, animate] = createAnimate();
const play = () =>
  animate([
    ["li", { opacity: 1 }, { delay: stagger(0.05) }],
    ["button", { scale: 1.1 }],
  ]);
return <ul ref={scope}>...</ul>;
```

`inView()` is exported too.

## Not included

Drag, `LazyMotion` / `m`, `Reorder` and `usePresence`.

## Working on it

The tooling is [Vite+](https://viteplus.dev) (`vp`). Bun is the package manager.

`motion`, `motion-dom` and `motion-utils` are pinned to exact versions that match. `motion` depends on `framer-motion`, which pins its own `motion-dom`, and two copies of `motion-dom` would split the frame loop, so update all three together.

```sh
bun install
bun run dev       # playground with every feature, http://localhost:5173
bun run check     # format, lint and type check
bun run test      # tests (Vitest, jsdom)
bun run build     # library build into dist/
```

`compare-react/` has the same demos built with Motion for React, for comparing side by side. Run `bun install` in that folder, then `bun run compare` from the root (http://localhost:5174).

## License

MIT. Parts are ported from [Motion for React](https://github.com/motiondivision/motion), also MIT. See [LICENSE](LICENSE).
