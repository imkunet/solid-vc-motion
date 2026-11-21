import { render } from "@solidjs/web";
import { createSignal, flush, onSettled, Show } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createAnimate, createScroll, motion, MotionConfig } from "../src";

const disposers: VoidFunction[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount(view: () => any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  disposers.push(render(view, container));
  return container;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** A controllable IntersectionObserver, as jsdom has none. */
function stubIntersectionObserver() {
  const observers: Array<{
    callback: IntersectionObserverCallback;
    options?: IntersectionObserverInit;
    targets: Set<Element>;
  }> = [];
  class StubObserver {
    targets = new Set<Element>();
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      observers.push({ callback, options, targets: this.targets });
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
  }
  vi.stubGlobal("IntersectionObserver", StubObserver);
  return {
    observers,
    intersect(target: Element, isIntersecting: boolean) {
      for (const { callback, targets } of observers) {
        if (!targets.has(target)) continue;
        callback(
          [{ target, isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }
    },
  };
}

function pointer(type: string, target: EventTarget, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      isPrimary: true,
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
    }),
  );
}

describe("whileInView", () => {
  test("animates while in view and fires the viewport callbacks", async () => {
    const io = stubIntersectionObserver();
    const onViewportEnter = vi.fn();
    const onViewportLeave = vi.fn();
    const container = mount(() => (
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ amount: "all", margin: "10px" }}
        onViewportEnter={onViewportEnter}
        onViewportLeave={onViewportLeave}
        transition={{ duration: 0.02 }}
      />
    ));
    const box = container.firstElementChild as HTMLElement;
    await wait(0);
    expect(box.hasAttribute("viewport")).toBe(false);
    expect(io.observers.at(-1)?.options).toMatchObject({ threshold: 1, rootMargin: "10px" });

    io.intersect(box, true);
    await wait(80);
    expect(box.style.opacity).toBe("1");
    expect(onViewportEnter).toHaveBeenCalledTimes(1);

    io.intersect(box, false);
    await wait(80);
    expect(box.style.opacity).toBe("0");
    expect(onViewportLeave).toHaveBeenCalledTimes(1);
  });

  test("viewport.once keeps the in-view state after leaving", async () => {
    const io = stubIntersectionObserver();
    const container = mount(() => (
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.02 }}
      />
    ));
    const box = container.firstElementChild as HTMLElement;
    await wait(0);
    io.intersect(box, true);
    await wait(80);
    io.intersect(box, false);
    await wait(80);
    expect(box.style.opacity).toBe("1");
  });

  test("re-observes when viewport.root changes", async () => {
    const io = stubIntersectionObserver();
    const [root, setRoot] = createSignal<Element>();
    // A margin no other test uses, as observers are pooled per root and options.
    const container = mount(() => (
      <motion.div whileInView={{ opacity: 1 }} viewport={{ root: root(), margin: "7px" }} />
    ));
    const box = container.firstElementChild as HTMLElement;
    await wait(0);
    const [pageObserver] = io.observers;
    expect(pageObserver.options?.root).toBeUndefined();
    expect(pageObserver.targets.has(box)).toBe(true);

    const scroller = document.createElement("div");
    setRoot(scroller);
    flush();
    await wait(0);
    expect(pageObserver.targets.has(box)).toBe(false);
    const rootObserver = io.observers.find((observer) => observer.options?.root === scroller);
    expect(rootObserver?.targets.has(box)).toBe(true);
  });
});

describe("pan", () => {
  test("fires pan session start, start, move and end", async () => {
    const onPanSessionStart = vi.fn();
    const onPanStart = vi.fn();
    const onPan = vi.fn();
    const onPanEnd = vi.fn();
    const container = mount(() => (
      <motion.div
        onPanSessionStart={onPanSessionStart}
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
      />
    ));
    const box = container.firstElementChild as HTMLElement;
    await wait(0);

    // Forwarded `on*` props would bind DOM listeners for these events.
    for (const type of ["pan", "panstart", "panend", "pansessionstart"]) {
      box.dispatchEvent(new Event(type));
    }
    await nextFrame();
    expect(
      [onPanSessionStart, onPanStart, onPan, onPanEnd].some((fn) => fn.mock.calls.length),
    ).toBe(false);

    pointer("pointerdown", box, 0, 0);
    pointer("pointermove", window, 20, 0);
    await nextFrame();
    await nextFrame();
    pointer("pointermove", window, 40, 10);
    await nextFrame();
    await nextFrame();
    pointer("pointerup", window, 40, 10);
    await nextFrame();
    await nextFrame();

    expect(onPanSessionStart).toHaveBeenCalledTimes(1);
    expect(onPanStart).toHaveBeenCalledTimes(1);
    expect(onPan).toHaveBeenCalled();
    expect(onPanEnd).toHaveBeenCalledTimes(1);
    expect(onPanEnd.mock.calls[0][1].offset).toEqual({ x: 40, y: 10 });
  });
});

describe("pinch", () => {
  test("sets touch-action while enabled, deferring to style", async () => {
    const [pinch, setPinch] = createSignal(true);
    const [touchAction, setTouchAction] = createSignal<string>();
    const [initialTouchAction, setInitialTouchAction] = createSignal<string | undefined>("pan-y");
    const container = mount(() => (
      <>
        <motion.div pinch={pinch()} />
        <motion.div pinch={pinch()} style={{ "touch-action": touchAction() }} />
        <motion.div pinch={pinch()} style={{ "touch-action": initialTouchAction() }} />
      </>
    ));
    const [box, styled, initiallyStyled] = [...container.children] as HTMLElement[];
    await wait(0);
    expect(box.hasAttribute("pinch")).toBe(false);
    expect(box.style.touchAction).toBe("none");
    expect(initiallyStyled.style.touchAction).toBe("pan-y");

    setTouchAction("pan-y");
    flush();
    await wait(0);
    expect(styled.style.touchAction).toBe("pan-y");

    setPinch(false);
    setTouchAction("pan-x");
    setInitialTouchAction(undefined);
    flush();
    await wait(0);
    expect(box.style.touchAction).toBe("");
    expect(styled.style.touchAction).toBe("pan-x");
    expect(initiallyStyled.style.touchAction).toBe("");
  });

  test("a trackpad pinch scales the element and toggles whilePinch", async () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const container = mount(() => (
      <motion.div
        pinch={{ onStart, onEnd, rotate: false, pan: false }}
        whilePinch={{ opacity: 0.5 }}
        transition={{ duration: 0.01 }}
      />
    ));
    const box = container.firstElementChild as HTMLElement;
    await wait(0);

    box.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -20 }),
    );
    await wait(50);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(box.style.transform).toMatch(/scale\(1\.\d+\)/u);
    expect(box.style.opacity).toBe("0.5");

    // A trackpad pinch ends once its wheel events stop.
    await wait(400);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(box.style.opacity).toBe("1");
  });
});

describe("createAnimate", () => {
  test("resolves selectors in its scope and stops on dispose", async () => {
    let animate!: ReturnType<typeof createAnimate>[1];
    const container = mount(() => {
      const [scope, scopedAnimate] = createAnimate<HTMLUListElement>();
      animate = scopedAnimate;
      onSettled(() => {
        void animate("li", { opacity: 0.5 }, { duration: 0.02 });
      });
      return (
        <ul ref={scope}>
          <li />
          <li />
        </ul>
      );
    });
    const outside = document.createElement("li");
    document.body.appendChild(outside);
    await wait(80);
    const items = [...container.querySelectorAll("li")];
    expect(items.map((item) => item.style.opacity)).toEqual(["0.5", "0.5"]);
    expect(outside.style.opacity).toBe("");

    const running = animate(items[0], { opacity: 1 }, { duration: 10 });
    expect(running.state).toBe("running");
    disposers.splice(0).forEach((dispose) => dispose());
    expect(running.state).not.toBe("running");
  });

  test("follows MotionConfig skipAnimations", async () => {
    let animate!: ReturnType<typeof createAnimate>[1];
    const container = mount(() => (
      <MotionConfig skipAnimations>
        {(() => {
          const [scope, scopedAnimate] = createAnimate<HTMLDivElement>();
          animate = scopedAnimate;
          return (
            <div ref={scope}>
              <span />
            </div>
          );
        })()}
      </MotionConfig>
    ));
    await animate("span", { opacity: 0.3 }, { duration: 10 });
    expect(container.querySelector("span")!.style.opacity).toBe("0.3");
  });
});

describe("createScroll", () => {
  function stubLayout(element: HTMLElement, layout: Record<string, unknown>) {
    Object.defineProperties(
      element,
      Object.fromEntries(Object.entries(layout).map(([key, value]) => [key, { value }])),
    );
  }

  async function scrollTo(element: HTMLElement, top: number) {
    element.scrollTop = top;
    element.dispatchEvent(new Event("scroll"));
    await nextFrame();
    await nextFrame();
  }

  test("starts once a late container mounts, and stops on dispose", async () => {
    let values!: ReturnType<typeof createScroll>;
    let element!: HTMLDivElement;
    const [shown, setShown] = createSignal(false);
    mount(() => {
      const [scroller, setScroller] = createSignal<HTMLDivElement>();
      values = createScroll({ container: scroller });
      return (
        <Show when={shown()}>
          <div
            ref={(el) => {
              element = el;
              stubLayout(el, { scrollHeight: 300, clientHeight: 100 });
              setScroller(el);
            }}
          />
        </Show>
      );
    });
    await wait(0);
    expect(element).toBeUndefined();

    setShown(true);
    flush();
    await wait(0);
    await scrollTo(element, 50);
    expect(values.scrollY.get()).toBe(50);
    expect(values.scrollYLength.get()).toBe(200);
    expect(values.scrollYProgress.get()).toBe(0.25);

    disposers.splice(0).forEach((dispose) => dispose());
    await scrollTo(element, 150);
    expect(values.scrollY.get()).toBe(50);
  });

  test("measures a target's progress through the container by offset", async () => {
    let values!: ReturnType<typeof createScroll>;
    let scroller!: HTMLDivElement;
    mount(() => {
      const [container, setContainer] = createSignal<HTMLDivElement>();
      const [target, setTarget] = createSignal<HTMLDivElement>();
      values = createScroll({ container, target, offset: ["start end", "end start"] });
      return (
        <div
          ref={(el) => {
            scroller = el;
            stubLayout(el, { scrollHeight: 1000, clientHeight: 100 });
            setContainer(el);
          }}
        >
          <div
            ref={(el) => {
              stubLayout(el, { offsetTop: 300, offsetParent: scroller, clientHeight: 100 });
              setTarget(el);
            }}
          />
        </div>
      );
    });
    await wait(0);

    // The target enters at 200 (its start meets the container's end) and
    // leaves at 400 (its end meets the container's start).
    await scrollTo(scroller, 300);
    expect(values.scrollYProgress.get()).toBe(0.5);
    await scrollTo(scroller, 400);
    expect(values.scrollYProgress.get()).toBe(1);
  });
});
