import { render, type JSX } from "@solidjs/web";
import { createContext, createRoot, createSignal, flush, For, Show, useContext } from "solid-js";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  AnimatePresence,
  createMotionValue,
  createTransform,
  fromMotionValue,
  motion,
  MotionConfig,
  type MotionValue,
} from "../src";

const disposers: VoidFunction[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function mount(view: () => any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  disposers.push(render(view, container));
  return container;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async () => {
  flush();
  await Promise.resolve();
  await Promise.resolve();
};

describe("motion components", () => {
  test("first render uses initial values, then animates to animate", async () => {
    const container = mount(() => (
      <motion.div
        data-testid="box"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.05 }}
      />
    ));
    const box = container.querySelector<HTMLElement>("[data-testid=box]")!;
    expect(box.style.opacity).toBe("0");
    expect(box.style.transform).toBe("translateX(10px)");

    await wait(150);
    expect(box.style.opacity).toBe("1");
    expect(box.style.transform).toBe("none");
  });

  test("forwards attributes and refs, keeps motion props off the DOM", async () => {
    let ref: HTMLButtonElement | undefined;
    const container = mount(() => (
      <motion.button
        ref={(el) => (ref = el)}
        class="cta"
        aria-label="go"
        whileHover={{ scale: 1.1 }}
        layout
      >
        Go
      </motion.button>
    ));
    const button = container.querySelector("button")!;
    expect(ref).toBe(button);
    expect(button.className).toBe("cta");
    expect(button.getAttribute("aria-label")).toBe("go");
    expect(button.hasAttribute("layout")).toBe(false);
    expect(button.hasAttribute("whilehover")).toBe(false);
    expect(button.textContent).toBe("Go");
  });

  test("re-animates when the animate prop changes", async () => {
    const [x, setX] = createSignal(0);
    const container = mount(() => (
      <motion.div animate={{ x: x() }} transition={{ duration: 0.05 }} />
    ));
    const box = container.firstElementChild as HTMLElement;
    await wait(20);
    setX(100);
    await wait(150);
    expect(box.style.transform).toBe("translateX(100px)");
  });

  test("parents animate their variant children on mount", async () => {
    const variants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
    const container = mount(() => (
      <motion.ul
        initial="hidden"
        animate="visible"
        variants={variants}
        transition={{ duration: 0.05 }}
      >
        <motion.li data-testid="item" variants={variants} transition={{ duration: 0.05 }} />
      </motion.ul>
    ));
    const item = container.querySelector<HTMLElement>("[data-testid=item]")!;
    expect(item.style.opacity).toBe("0");
    await wait(150);
    expect(item.style.opacity).toBe("1");
  });

  test("MotionConfig skipAnimations jumps straight to the target", async () => {
    const container = mount(() => (
      <MotionConfig skipAnimations>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} />
      </MotionConfig>
    ));
    const box = container.firstElementChild as HTMLElement;
    await settle();
    await nextFrame();
    expect(box.style.opacity).toBe("0.5");
  });

  test("svg elements render in the SVG namespace with initial attributes", () => {
    const container = mount(() => (
      <motion.svg viewBox="0 0 10 10">
        <motion.circle initial={{ cx: 5 }} r={2} />
      </motion.svg>
    ));
    const circle = container.querySelector("circle")!;
    expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(circle.getAttribute("cx")).toBe("5");
    expect(circle.getAttribute("r")).toBe("2");
  });

  test("motion.create children render inside the component's context", () => {
    const Theme = createContext("none");
    const Themed = (props: { ref?: (el: HTMLElement) => void; children?: JSX.Element }) => (
      <Theme value="dark">
        <section ref={props.ref}>{props.children}</section>
      </Theme>
    );
    const MotionThemed = motion.create(Themed);
    const Read = () => <span>{useContext(Theme)}</span>;
    const container = mount(() => (
      <MotionThemed animate={{ opacity: 1 }}>
        <Read />
      </MotionThemed>
    ));
    expect(container.querySelector("section > span")?.textContent).toBe("dark");
  });
});

describe("motion values", () => {
  test("style motion values render without re-running Solid", async () => {
    let x!: ReturnType<typeof createMotionValue<number>>;
    let renders = 0;
    const container = mount(() => {
      x = createMotionValue(0);
      const opacity = createTransform(x, [0, 100], [1, 0]);
      return <motion.div style={{ x, opacity }}>{(renders++, "box")}</motion.div>;
    });
    const box = container.firstElementChild as HTMLElement;
    x.set(50);
    await nextFrame();
    await nextFrame();
    expect(box.style.transform).toBe("translateX(50px)");
    expect(box.style.opacity).toBe("0.5");
    expect(renders).toBe(1);
  });

  test("motion value children render as text", async () => {
    let count!: ReturnType<typeof createMotionValue<number>>;
    const container = mount(() => {
      count = createMotionValue(1);
      return <motion.span>{count}</motion.span>;
    });
    expect(container.textContent).toBe("1");
    count.set(2);
    expect(container.textContent).toBe("2");
  });

  test("kebab-case style keys get Motion's units and scale correction", async () => {
    let radius!: MotionValue<number>;
    const container = mount(() => {
      radius = createMotionValue(16);
      return (
        <>
          <motion.div data-id="value" style={{ "border-radius": radius }} />
          <motion.div data-id="layout" layout style={{ "border-top-left-radius": 8 }} />
        </>
      );
    });
    const value = container.querySelector<HTMLElement>("[data-id=value]")!;
    const layout = container.querySelector<HTMLElement>("[data-id=layout]")!;
    expect(value.style.borderRadius).toBe("16px");
    // A layout node's radius is Motion's to render (scale-corrected).
    expect(layout.style.borderTopLeftRadius).toBe("8px");
    radius.set(20);
    await nextFrame();
    expect(value.style.borderRadius).toBe("20px");
  });

  test("fromMotionValue tracks changes in Solid", async () => {
    createRoot((dispose) => {
      disposers.push(dispose);
      const value = createMotionValue(1);
      const read = fromMotionValue(value);
      const doubled = createTransform(() => value.get() * 2);
      expect(read()).toBe(1);
      value.set(3);
      flush();
      expect(read()).toBe(3);
      expect(doubled.get()).toBe(2); // updates on the next frame
    });
  });
});

describe("AnimatePresence", () => {
  test("keeps an exiting child until its exit animation finishes", async () => {
    const [show, setShow] = createSignal(true);
    let completed = 0;
    const container = mount(() => (
      <AnimatePresence onExitComplete={() => completed++}>
        <Show when={show()}>
          <motion.div data-testid="box" exit={{ opacity: 0 }} transition={{ duration: 0.1 }} />
        </Show>
      </AnimatePresence>
    ));
    await settle();
    setShow(false);
    await settle();
    const box = container.querySelector<HTMLElement>("[data-testid=box]");
    expect(box).not.toBeNull();
    await wait(50);
    expect(Number(box!.style.opacity)).toBeLessThan(1);
    expect(box!.isConnected).toBe(true);
    await wait(200);
    expect(box!.isConnected).toBe(false);
    expect(completed).toBe(1);
  });

  test("a child shown again mid-exit takes over from the exiting one", async () => {
    const [show, setShow] = createSignal(true);
    let completed = 0;
    const container = mount(() => (
      <AnimatePresence onExitComplete={() => completed++}>
        <Show when={show()}>
          <motion.div
            data-testid="box"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.2, ease: "linear" }}
          />
        </Show>
      </AnimatePresence>
    ));
    await wait(300);
    setShow(false);
    await wait(100);
    const exiting = container.querySelector<HTMLElement>("[data-testid=box]")!;
    const opacity = Number(exiting.style.opacity);
    expect(opacity).toBeGreaterThan(0.2);
    expect(opacity).toBeLessThan(0.8);

    setShow(true);
    await settle();
    await nextFrame();
    const boxes = container.querySelectorAll<HTMLElement>("[data-testid=box]");
    expect(boxes).toHaveLength(1);
    // Continues from the exit, not from initial={{ opacity: 0 }}.
    expect(Number(boxes[0].style.opacity)).toBeGreaterThan(opacity - 0.2);
    expect(boxes[0].style.transform).toMatch(/translateX/);

    await wait(400);
    expect(boxes[0].style.opacity).toBe("1");
    expect(boxes[0].style.transform).toBe("none");
    expect(completed).toBe(0);
  });

  test.each([
    { pairing: "in order", keyed: false, back: ["a", "b", "c", "d"] },
    { pairing: "by key", keyed: true, back: ["a", "c", "b", "d"] },
  ])("children shown again together mid-exit take over $pairing", async ({ keyed, back }) => {
    const [items, setItems] = createSignal(["a", "b", "c", "d"]);
    const container = mount(() => (
      <AnimatePresence>
        <For each={items()}>
          {(item) => (
            <motion.p
              key={keyed ? item : undefined}
              data-item={item}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: item === "b" ? 100 : -100 }}
              transition={{ duration: 0.2, ease: "linear" }}
            >
              {item}
            </motion.p>
          )}
        </For>
      </AnimatePresence>
    ));
    await wait(300);
    setItems(["a", "d"]);
    await wait(100);

    setItems(back);
    await settle();
    await nextFrame();
    expect(container.textContent).toBe(back.join(""));
    // Each continues from its own exit: b moved right, c left.
    const transformOf = (item: string) =>
      container.querySelector<HTMLElement>(`[data-item=${item}]`)!.style.transform;
    expect(transformOf("b")).toMatch(/translateX\(\d/);
    expect(transformOf("c")).toMatch(/translateX\(-/);
  });

  test("removes children without exit work immediately", async () => {
    const [show, setShow] = createSignal(true);
    const container = mount(() => (
      <AnimatePresence>
        <Show when={show()}>
          <motion.div data-testid="box" />
        </Show>
      </AnimatePresence>
    ));
    await settle();
    setShow(false);
    await settle();
    await settle();
    expect(container.querySelector("[data-testid=box]")).toBeNull();
  });

  test("exiting children keep their position in a list", async () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const container = mount(() => (
      <AnimatePresence>
        <For each={items()}>
          {(item) => (
            <motion.p exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
              {item}
            </motion.p>
          )}
        </For>
      </AnimatePresence>
    ));
    await settle();
    setItems(["a", "c", "d"]);
    await settle();
    expect(container.textContent).toBe("abcd");
    await wait(250);
    expect(container.textContent).toBe("acd");
  });

  test("initial={false} skips the first enter, not later ones", async () => {
    const [show, setShow] = createSignal(true);
    const container = mount(() => (
      <AnimatePresence initial={false}>
        <Show when={show()}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
        </Show>
      </AnimatePresence>
    ));
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe("1");
    setShow(false);
    await settle();
    setShow(true);
    await settle();
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe("0");
  });

  test('mode="wait" mounts the entering child after the exit', async () => {
    const [key, setKey] = createSignal("a");
    const container = mount(() => (
      <AnimatePresence mode="wait">
        <Show when={key()} keyed>
          {(current) => (
            <motion.div
              data-key={current}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            />
          )}
        </Show>
      </AnimatePresence>
    ));
    await wait(150);
    setKey("b");
    await settle();
    expect(container.querySelector("[data-key=b]")).toBeNull();
    expect(container.querySelector("[data-key=a]")).not.toBeNull();
    await wait(200);
    const entered = container.querySelector<HTMLElement>("[data-key=b]")!;
    expect(container.querySelector("[data-key=a]")).toBeNull();
    await wait(200);
    expect(entered.style.opacity).toBe("1");
  });

  test("works in a container outside the document", async () => {
    const [key, setKey] = createSignal("a");
    const container = document.createElement("div");
    disposers.push(
      render(
        () => (
          <AnimatePresence mode="wait">
            <Show when={key()} keyed>
              {(current) => (
                <motion.div
                  data-key={current}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                />
              )}
            </Show>
          </AnimatePresence>
        ),
        container,
      ),
    );
    await wait(150);
    const exiting = container.querySelector<HTMLElement>("[data-key=a]")!;
    expect(exiting.style.opacity).toBe("1");

    setKey("b");
    await settle();
    expect(container.querySelector("[data-key=b]")).toBeNull();
    await wait(50);
    expect(Number(exiting.style.opacity)).toBeLessThan(1);
    await wait(150);
    const entered = container.querySelector<HTMLElement>("[data-key=b]")!;
    expect(container.contains(exiting)).toBe(false);
    await wait(200);
    expect(entered.style.opacity).toBe("1");
  });

  test('a nested AnimatePresence mounts its children once mode="wait" inserts them', async () => {
    const [key, setKey] = createSignal("a");
    const items: Record<string, HTMLElement> = {};
    mount(() => (
      <AnimatePresence mode="wait">
        <Show when={key()} keyed>
          {(current) => (
            <motion.section exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
              <AnimatePresence>
                <motion.p
                  ref={(el) => (items[current] = el)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.1 }}
                />
              </AnimatePresence>
            </motion.section>
          )}
        </Show>
      </AnimatePresence>
    ));
    await wait(150);
    setKey("b");
    await settle();
    await wait(50);
    // Withheld while the outer exit runs: not mounted, so not animating.
    expect(items.b.style.opacity).toBe("0");
    await wait(400);
    expect(items.b.style.opacity).toBe("1");
  });

  test("a child an inner presence releases into a subtree an outer one withholds mounts once inserted", async () => {
    const [showFirst, setShowFirst] = createSignal(true);
    const [inner, setInner] = createSignal("x");
    const items: Record<string, HTMLElement> = {};
    mount(() => (
      <AnimatePresence mode="wait">
        <Show when={showFirst()}>
          <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
        </Show>
        <section>
          <AnimatePresence mode="wait">
            <Show when={inner()} keyed>
              {(current) => (
                <motion.p
                  ref={(el) => (items[current] = el)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                />
              )}
            </Show>
          </AnimatePresence>
        </section>
      </AnimatePresence>
    ));
    await wait(150);
    // y waits for x's exit; then the outer exit withholds the whole section.
    setInner("y");
    await settle();
    setShowFirst(false);
    await settle();
    await wait(200);
    // x has left, but the section is still out of the DOM.
    expect(items.y.style.opacity).toBe("0");
    await wait(400);
    expect(items.y.style.opacity).toBe("1");
  });
});
