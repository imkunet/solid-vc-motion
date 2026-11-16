import { render } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";
import {
  AnimatePresence,
  createMotionTemplate,
  createMotionValue,
  createSpring,
  createTransform,
  fromMotionValue,
  LayoutGroup,
  motion,
  MotionConfig,
  stagger,
} from "../src";

function Basics() {
  const [moved, setMoved] = createSignal(false);
  return (
    <section data-demo="basics">
      <h2>Animate, gestures</h2>
      <div class="row">
        <motion.div
          class="box"
          data-testid="basic-box"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1, x: moved() ? 200 : 0 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9, rotate: 10 }}
          transition={{ type: "spring", bounce: 0.3 }}
        />
        <button data-testid="basic-move" onClick={() => setMoved((m) => !m)}>
          Move
        </button>
      </div>
    </section>
  );
}

function Variants() {
  const [open, setOpen] = createSignal(true);
  const list = {
    open: { transition: { delayChildren: stagger(0.07) } },
    closed: { transition: { delayChildren: stagger(0.04, { from: "last" }) } },
  };
  const item = {
    open: { opacity: 1, x: 0 },
    closed: { opacity: 0, x: -40 },
  };
  return (
    <section data-demo="variants">
      <h2>Variants</h2>
      <button data-testid="variants-toggle" onClick={() => setOpen((o) => !o)}>
        Toggle
      </button>
      <motion.ul class="list" initial="closed" animate={open() ? "open" : "closed"} variants={list}>
        <For each={["One", "Two", "Three", "Four"]}>
          {(label) => <motion.li variants={item}>{label}</motion.li>}
        </For>
      </motion.ul>
    </section>
  );
}

function MotionValues() {
  const x = createMotionValue(0);
  const smoothX = createSpring(x, { stiffness: 200, damping: 20 });
  const rotate = createTransform(smoothX, [-150, 150], [-45, 45]);
  const background = createTransform(smoothX, [-150, 0, 150], ["#f43f5e", "#8b5cf6", "#10b981"]);
  const shadow = createMotionTemplate`0 ${createTransform(() => Math.abs(smoothX.get()) / 10)}px 20px rgba(0,0,0,0.3)`;
  const readout = fromMotionValue(createTransform(() => Math.round(smoothX.get())));
  const [offset, setOffset] = createSignal(0);
  const followed = createSpring(() => offset());

  return (
    <section data-demo="values">
      <h2>Motion values</h2>
      <div
        class="track"
        data-testid="values-track"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          x.set(event.clientX - bounds.left - bounds.width / 2);
        }}
        onPointerLeave={() => x.set(0)}
      >
        <motion.div
          class="box small"
          data-testid="values-box"
          style={{ x: smoothX, rotate, background, "box-shadow": shadow }}
        />
      </div>
      <p>
        x = <span data-testid="values-readout">{readout()}</span>
      </p>
      <div class="row">
        <button data-testid="spring-signal" onClick={() => setOffset((o) => (o ? 0 : 150))}>
          Spring a signal
        </button>
        <motion.div class="dot" data-testid="spring-dot" style={{ x: followed }} />
      </div>
    </section>
  );
}

function Presence() {
  const [visible, setVisible] = createSignal(true);
  return (
    <section data-demo="presence">
      <h2>AnimatePresence</h2>
      <button data-testid="presence-toggle" onClick={() => setVisible((v) => !v)}>
        Toggle
      </button>
      <div class="row stage">
        <AnimatePresence>
          <Show when={visible()}>
            <motion.div
              class="box"
              data-testid="presence-box"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0, rotate: 90 }}
              transition={{ duration: 0.5 }}
            />
          </Show>
        </AnimatePresence>
      </div>
    </section>
  );
}

let nextId = 4;
function Notifications() {
  const [items, setItems] = createSignal([1, 2, 3]);
  return (
    <section data-demo="notifications">
      <h2>popLayout list</h2>
      <button data-testid="notify-add" onClick={() => setItems((list) => [nextId++, ...list])}>
        Add
      </button>
      <ul class="notifications">
        <AnimatePresence mode="popLayout">
          <For each={items()}>
            {(id) => (
              <motion.li
                layout
                data-testid={`notification-${id}`}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 80 }}
                transition={{ duration: 0.4 }}
                onClick={() => setItems((list) => list.filter((item) => item !== id))}
              >
                Notification {id} (click to dismiss)
              </motion.li>
            )}
          </For>
        </AnimatePresence>
      </ul>
    </section>
  );
}

function Slideshow() {
  const colors = ["#f43f5e", "#8b5cf6", "#0ea5e9", "#10b981"];
  const [state, setState] = createSignal({ index: 0, direction: 1 });
  const paginate = (direction: number) =>
    setState(({ index }) => ({
      index: (index + direction + colors.length) % colors.length,
      direction,
    }));
  const slide = {
    enter: (direction: number) => ({ x: direction * 120, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction * -120, opacity: 0 }),
  };
  return (
    <section data-demo="slideshow">
      <h2>mode="wait" + custom</h2>
      <div class="row">
        <button data-testid="slide-prev" onClick={() => paginate(-1)}>
          ‹
        </button>
        <div class="slides">
          <AnimatePresence mode="wait" custom={state().direction} initial={false}>
            <Show when={state().index + 1} keyed>
              {(page) => (
                <motion.div
                  class="slide"
                  data-testid={`slide-${page - 1}`}
                  custom={state().direction}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25 }}
                  style={{ background: colors[page - 1] }}
                >
                  {page}
                </motion.div>
              )}
            </Show>
          </AnimatePresence>
        </div>
        <button data-testid="slide-next" onClick={() => paginate(1)}>
          ›
        </button>
      </div>
    </section>
  );
}

function Switch() {
  const [on, setOn] = createSignal(false);
  return (
    <section data-demo="switch">
      <h2>Layout: switch</h2>
      <div
        class={["switch", { on: on() }]}
        data-testid="switch"
        onClick={() => setOn((value) => !value)}
      >
        <motion.div
          class="knob"
          data-testid="switch-knob"
          layout
          layoutDependency={on()}
          transition={{ type: "spring", visualDuration: 0.3, bounce: 0.3 }}
        />
      </div>
    </section>
  );
}

function Accordion() {
  const [open, setOpen] = createSignal(false);
  return (
    <section data-demo="accordion">
      <h2>Layout: size + children</h2>
      <motion.div
        layout
        class="card"
        data-testid="accordion"
        style={{ "border-radius": "16px" }}
        onClick={() => setOpen((value) => !value)}
      >
        <motion.h3 layout="position">Click to {open() ? "collapse" : "expand"}</motion.h3>
        <Show when={open()}>
          <motion.p layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            The card animates its size; its heading and text use layout="position" so they move
            without being stretched.
          </motion.p>
        </Show>
      </motion.div>
      <motion.div layout class="card muted" data-testid="accordion-sibling">
        A sibling that's pushed down animates too.
      </motion.div>
    </section>
  );
}

/** Fisher-Yates, retried until the order actually changes. */
function shuffled<T>(list: T[]): T[] {
  const next = [...list];
  do {
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
  } while (next.every((item, i) => item === list[i]));
  return next;
}

function Shuffle() {
  const [items, setItems] = createSignal(["#f43f5e", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6"]);
  const shuffle = () => setItems((list) => shuffled(list));
  return (
    <section data-demo="shuffle">
      <h2>Layout: reorder</h2>
      <button data-testid="shuffle" onClick={shuffle}>
        Shuffle
      </button>
      <ul class="shuffle">
        <LayoutGroup>
          <For each={items()}>
            {(color) => (
              <motion.li
                layout
                data-testid={`shuffle-${color.slice(1)}`}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                style={{ background: color }}
              />
            )}
          </For>
        </LayoutGroup>
      </ul>
    </section>
  );
}

function Tabs() {
  const tabs = ["Home", "Docs", "Blog", "About"];
  const [selected, setSelected] = createSignal("Home");
  return (
    <section data-demo="tabs">
      <h2>Shared layout: tabs</h2>
      <nav class="tabs">
        <For each={tabs}>
          {(tab) => (
            <button
              class={{ selected: selected() === tab }}
              data-testid={`tab-${tab}`}
              onClick={() => setSelected(tab)}
            >
              {tab}
              <Show when={selected() === tab}>
                <motion.div
                  class="underline"
                  data-testid="underline"
                  layoutId="underline"
                  transition={{ type: "spring", visualDuration: 0.35, bounce: 0.2 }}
                />
              </Show>
            </button>
          )}
        </For>
      </nav>
    </section>
  );
}

function Gallery() {
  const cards = [
    { id: "a", title: "Aurora", color: "#8b5cf6" },
    { id: "b", title: "Bloom", color: "#f43f5e" },
    { id: "c", title: "Cascade", color: "#0ea5e9" },
  ];
  const [selected, setSelected] = createSignal<string | null>(null);
  const card = () => cards.find((c) => c.id === selected());
  return (
    <section data-demo="gallery">
      <h2>Shared layout: card → modal</h2>
      <div class="gallery">
        <For each={cards}>
          {(item) => (
            <motion.div
              class="thumb"
              data-testid={`thumb-${item.id}`}
              layoutId={`card-${item.id}`}
              style={{ background: item.color, "border-radius": "12px" }}
              onClick={() => setSelected(item.id)}
            >
              <motion.h3 layoutId={`title-${item.id}`}>{item.title}</motion.h3>
            </motion.div>
          )}
        </For>
      </div>
      <AnimatePresence>
        <Show when={card()}>
          {(current) => (
            <div class="overlay" onClick={() => setSelected(null)}>
              <motion.div
                class="modal"
                data-testid="modal"
                layoutId={`card-${current().id}`}
                style={{ background: current().color, "border-radius": "24px" }}
              >
                <motion.h3 layoutId={`title-${current().id}`}>{current().title}</motion.h3>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Click anywhere to close.
                </motion.p>
              </motion.div>
            </div>
          )}
        </Show>
      </AnimatePresence>
    </section>
  );
}

function App() {
  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      <main>
        <h1>solid-vc-motion</h1>
        <Basics />
        <Variants />
        <MotionValues />
        <Presence />
        <Notifications />
        <Slideshow />
        <Switch />
        <Accordion />
        <Shuffle />
        <Tabs />
        <Gallery />
      </main>
    </MotionConfig>
  );
}

render(() => <App />, document.getElementById("root")!);
