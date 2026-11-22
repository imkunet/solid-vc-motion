import { render } from "@solidjs/web";
import { createSignal, flush, For, Show } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { AnimatePresence, LayoutGroup, motion } from "../src";

/**
 * jsdom has no layout engine, so each test describes the layout it wants:
 * a function from element to box, evaluated against the live DOM.
 */
type Box = { x: number; y: number; width: number; height: number };
let layoutOf: (element: HTMLElement) => Box;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const { x, y, width, height } = layoutOf(this);
    return {
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      toJSON() {},
    };
  });
});

const disposers: VoidFunction[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function mount(view: () => any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  disposers.push(render(view, container));
  return container;
}

const byId = (id: string) => document.querySelector<HTMLElement>(`[data-id=${id}]`)!;
/** Lets Solid flush, then the layout update microtask after it. */
const commit = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};
const slow = { duration: 10, ease: "linear" } as const;

describe("layout animations", () => {
  test("a prop change that resizes the element animates from the old size", async () => {
    layoutOf = (el) => ({
      x: 0,
      y: 0,
      width: el.classList.contains("wide") ? 200 : 100,
      height: 100,
    });
    const [wide, setWide] = createSignal(false);
    mount(() => <motion.div data-id="box" layout class={{ wide: wide() }} transition={slow} />);
    await commit();
    expect(byId("box").style.transform).not.toMatch(/scale/);

    setWide(true);
    await commit();
    // Projected back to its old width: 100 / 200.
    expect(byId("box").style.transform).toMatch(/scale\(0\.5/);
  });

  test("children changes animate the layout node", async () => {
    const [open, setOpen] = createSignal(false);
    layoutOf = (el) => ({
      x: 0,
      y: 0,
      width: 100,
      height: el.querySelector("p") ? 300 : 100,
    });
    mount(() => (
      <motion.div data-id="box" layout transition={slow}>
        <Show when={open()}>
          <p>more</p>
        </Show>
      </motion.div>
    ));
    await commit();
    setOpen(true);
    await commit();
    expect(byId("box").style.transform).toMatch(/scale\(1, 0\.333/);
  });

  test("siblings moved by another node's update animate too", async () => {
    const [tall, setTall] = createSignal(false);
    layoutOf = (el) => {
      const first = byId("first");
      const firstHeight = first?.classList.contains("tall") ? 300 : 100;
      return el.dataset.id === "second"
        ? { x: 0, y: firstHeight, width: 100, height: 100 }
        : { x: 0, y: 0, width: 100, height: firstHeight };
    };
    mount(() => (
      <>
        <motion.div data-id="first" layout class={{ tall: tall() }} transition={slow} />
        <motion.div data-id="second" layout transition={slow} />
      </>
    ));
    await commit();
    setTall(true);
    await commit();
    // Second moved down by 200px and starts where it was.
    expect(byId("second").style.transform).toMatch(/translate3d\(0px, -200px/);
  });

  test("layout nodes in other containers move with the page, without animating", async () => {
    const [tall, setTall] = createSignal(false);
    layoutOf = (el) => {
      const height = byId("grow")?.classList.contains("tall") ? 300 : 100;
      return el.dataset.id === "elsewhere"
        ? { x: 0, y: height + 50, width: 100, height: 100 }
        : { x: 0, y: 0, width: 100, height };
    };
    mount(() => (
      <>
        <section>
          <motion.div data-id="grow" layout class={{ tall: tall() }} transition={slow} />
        </section>
        <section>
          <motion.div data-id="elsewhere" layout transition={slow} />
        </section>
      </>
    ));
    await commit();
    setTall(true);
    await commit();
    expect(byId("grow").style.transform).toMatch(/scale/);
    expect(byId("elsewhere").style.transform).not.toMatch(/translate/);
  });

  test("layoutDependency limits updates to changes of the dependency", async () => {
    const [wide, setWide] = createSignal(false);
    const [dependency, setDependency] = createSignal(0);
    layoutOf = (el) => ({
      x: 0,
      y: 0,
      width: el.classList.contains("wide") ? 200 : 100,
      height: 100,
    });
    mount(() => (
      <motion.div
        data-id="box"
        layout
        layoutDependency={dependency()}
        class={{ wide: wide() }}
        transition={slow}
      />
    ));
    await commit();
    setWide(true);
    await commit();
    expect(byId("box").style.transform).not.toMatch(/scale/);

    setWide(false);
    setDependency(1);
    await commit();
    expect(byId("box").style.transform).toMatch(/scale\(2/);
  });

  test("LayoutGroup animates a reordered list", async () => {
    const [items, setItems] = createSignal(["a", "b"]);
    layoutOf = (el) => {
      const index = [...el.parentElement!.children].indexOf(el);
      return { x: 0, y: index * 100, width: 100, height: 100 };
    };
    mount(() => (
      <ul>
        <LayoutGroup>
          <For each={items()}>
            {(item) => <motion.li data-id={item} layout transition={slow} />}
          </For>
        </LayoutGroup>
      </ul>
    ));
    await commit();
    setItems(["b", "a"]);
    await commit();
    expect(byId("a").style.transform).toMatch(/translate3d\(0px, -100px/);
    expect(byId("b").style.transform).toMatch(/translate3d\(0px, 100px/);
  });

  test("a new layoutId element animates from the one it replaces", async () => {
    const [selected, setSelected] = createSignal("a");
    layoutOf = (el) => {
      const tab = el.closest<HTMLElement>("[data-tab]");
      return { x: tab?.dataset.tab === "b" ? 100 : 0, y: 0, width: 50, height: 10 };
    };
    mount(() => (
      <For each={["a", "b"]}>
        {(tab) => (
          <div data-tab={tab}>
            <Show when={selected() === tab}>
              <motion.span data-id={`underline-${tab}`} layoutId="underline" transition={slow} />
            </Show>
          </div>
        )}
      </For>
    ));
    await commit();
    setSelected("b");
    await commit();
    expect(document.querySelector("[data-id=underline-a]")).toBeNull();
    expect(byId("underline-b").style.transform).toMatch(/translate3d\(-100px, 0px/);
  });

  test("a layoutId element replaced deep inside AnimatePresence still hands over", async () => {
    const [selected, setSelected] = createSignal("a");
    const [opacity, setOpacity] = createSignal(1);
    layoutOf = (el) => {
      const tab = el.closest<HTMLElement>("[data-tab]");
      return { x: tab?.dataset.tab === "b" ? 100 : 0, y: 0, width: 50, height: 10 };
    };
    mount(() => (
      <AnimatePresence>
        <motion.nav animate={{ opacity: opacity() }}>
          <For each={["a", "b"]}>
            {(tab) => (
              <div data-tab={tab}>
                <Show when={selected() === tab}>
                  <motion.span
                    data-id={`underline-${tab}`}
                    layoutId="underline"
                    transition={slow}
                  />
                </Show>
              </div>
            )}
          </For>
        </motion.nav>
      </AnimatePresence>
    ));
    await commit();
    // An update earlier in the same tick queues motion-dom's microtask batch,
    // so the root updates before the removed element finalizes.
    setOpacity(0.5);
    flush();
    setSelected("b");
    flush();
    await commit();
    expect(document.querySelector("[data-id=underline-a]")).toBeNull();
    expect(byId("underline-b").style.transform).toMatch(/translate3d\(-100px, 0px/);
  });

  test("a second removal in the same tick animates nodes moved in by the first", async () => {
    const [showA, setShowA] = createSignal(true);
    const [showB, setShowB] = createSignal(true);
    const [inList, setInList] = createSignal(false);
    layoutOf = (el) => {
      const index = [...el.parentElement!.children].indexOf(el);
      const isList = el.parentElement!.dataset.id === "list";
      return { x: isList ? 0 : 500, y: index * 100, width: 100, height: 100 };
    };
    mount(() => {
      const moved = <motion.div data-id="moved" layout transition={slow} />;
      return (
        <>
          <div data-id="list">
            <Show when={showA()}>
              <motion.div data-id="a" layout transition={slow} />
            </Show>
            <Show when={showB()}>
              <motion.div data-id="b" layout transition={slow} />
            </Show>
            {inList() ? moved : null}
          </div>
          <div>{inList() ? null : moved}</div>
        </>
      );
    });
    await commit();
    setShowA(false);
    setInList(true);
    flush();
    // "moved" is now second in the list; removing "b" moves it up.
    setShowB(false);
    flush();
    await commit();
    expect(byId("moved").style.transform).toMatch(/translate3d\(0px, 100px/);
  });

  test('mode="popLayout" lets siblings move into an exiting element\'s space', async () => {
    const [items, setItems] = createSignal(["a", "b"]);
    layoutOf = (el) => {
      const flow = [...el.parentElement!.children].filter(
        (child) => (child as HTMLElement).style.position !== "absolute",
      );
      return { x: 0, y: flow.indexOf(el) * 100, width: 100, height: 100 };
    };
    mount(() => (
      <div>
        <AnimatePresence mode="popLayout">
          <For each={items()}>
            {(item) => (
              <motion.div
                data-id={item}
                layout
                exit={{ opacity: 0 }}
                transition={slow}
                style={{ width: "100px", height: "100px" }}
              />
            )}
          </For>
        </AnimatePresence>
      </div>
    ));
    await commit();
    setItems(["b"]);
    await commit();
    expect(byId("a").style.position).toBe("absolute");
    expect(byId("b").style.transform).toMatch(/translate3d\(0px, 100px/);
  });
});
