/**
 * The Solid playground's demos written against Motion for React, to compare
 * behaviour side by side. Same markup, classes and test ids.
 */
import {
  animate,
  AnimatePresence,
  LayoutGroup,
  LazyMotion,
  motion,
  MotionConfig,
  pinchFeatures,
  stagger,
  useAnimate,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../playground/styles.css";

function Basics() {
  const [moved, setMoved] = useState(false);
  return (
    <section data-demo="basics">
      <h2>Animate, gestures</h2>
      <div className="row">
        <motion.div
          className="box"
          data-testid="basic-box"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1, x: moved ? 200 : 0 }}
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
  const [open, setOpen] = useState(true);
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
      <motion.ul
        className="list"
        initial="closed"
        animate={open ? "open" : "closed"}
        variants={list}
      >
        {["One", "Two", "Three", "Four"].map((label) => (
          <motion.li key={label} variants={item}>
            {label}
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

function MotionValues() {
  const x = useMotionValue(0);
  const smoothX = useSpring(x, { stiffness: 200, damping: 20 });
  const rotate = useTransform(smoothX, [-150, 150], [-45, 45]);
  const background = useTransform(smoothX, [-150, 0, 150], ["#f43f5e", "#8b5cf6", "#10b981"]);
  const blur = useTransform(() => Math.abs(smoothX.get()) / 10);
  const shadow = useMotionTemplate`0 ${blur}px 20px rgba(0,0,0,0.3)`;
  const [readout, setReadout] = useState(0);
  useMotionValueEvent(smoothX, "change", (latest) => setReadout(Math.round(latest)));
  const [offset, setOffset] = useState(0);
  const followed = useSpring(offset);

  return (
    <section data-demo="values">
      <h2>Motion values</h2>
      <div
        className="track"
        data-testid="values-track"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          x.set(event.clientX - bounds.left - bounds.width / 2);
        }}
        onPointerLeave={() => x.set(0)}
      >
        <motion.div
          className="box small"
          data-testid="values-box"
          style={{ x: smoothX, rotate, background, boxShadow: shadow }}
        />
      </div>
      <p>
        x = <span data-testid="values-readout">{readout}</span>
      </p>
      <div className="row">
        <button data-testid="spring-signal" onClick={() => setOffset((o) => (o ? 0 : 150))}>
          Spring a value
        </button>
        <motion.div className="dot" data-testid="spring-dot" style={{ x: followed }} />
      </div>
    </section>
  );
}

function Presence() {
  const [visible, setVisible] = useState(true);
  return (
    <section data-demo="presence">
      <h2>AnimatePresence</h2>
      <button data-testid="presence-toggle" onClick={() => setVisible((v) => !v)}>
        Toggle
      </button>
      <div className="row stage">
        <AnimatePresence>
          {visible && (
            <motion.div
              className="box"
              data-testid="presence-box"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0, rotate: 90 }}
              transition={{ duration: 0.5 }}
            />
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

let nextId = 4;
function Notifications() {
  const [items, setItems] = useState([1, 2, 3]);
  return (
    <section data-demo="notifications">
      <h2>popLayout list</h2>
      <button data-testid="notify-add" onClick={() => setItems((list) => [nextId++, ...list])}>
        Add
      </button>
      <ul className="notifications">
        <AnimatePresence mode="popLayout">
          {items.map((id) => (
            <motion.li
              key={id}
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
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function Slideshow() {
  const colors = ["#f43f5e", "#8b5cf6", "#0ea5e9", "#10b981"];
  const [{ index, direction }, setState] = useState({ index: 0, direction: 1 });
  const paginate = (step: number) =>
    setState(({ index }) => ({
      index: (index + step + colors.length) % colors.length,
      direction: step,
    }));
  const slide = {
    enter: (direction: number) => ({ x: direction * 120, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction * -120, opacity: 0 }),
  };
  return (
    <section data-demo="slideshow">
      <h2>mode="wait" + custom</h2>
      <div className="row">
        <button data-testid="slide-prev" onClick={() => paginate(-1)}>
          ‹
        </button>
        <div className="slides">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={index}
              className="slide"
              data-testid={`slide-${index}`}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25 }}
              style={{ background: colors[index] }}
            >
              {index + 1}
            </motion.div>
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
  const [on, setOn] = useState(false);
  return (
    <section data-demo="switch">
      <h2>Layout: switch</h2>
      <div
        className={on ? "switch on" : "switch"}
        data-testid="switch"
        onClick={() => setOn((value) => !value)}
      >
        <motion.div
          className="knob"
          data-testid="switch-knob"
          layout
          transition={{ type: "spring", visualDuration: 0.3, bounce: 0.3 }}
        />
      </div>
    </section>
  );
}

function Accordion() {
  const [open, setOpen] = useState(false);
  return (
    <section data-demo="accordion">
      <h2>Layout: size + children</h2>
      <motion.div
        layout
        className="card"
        data-testid="accordion"
        style={{ borderRadius: 16 }}
        onClick={() => setOpen((value) => !value)}
      >
        <motion.h3 layout="position">Click to {open ? "collapse" : "expand"}</motion.h3>
        {open && (
          <motion.p layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            The card animates its size; its heading and text use layout="position" so they move
            without being stretched.
          </motion.p>
        )}
      </motion.div>
      <motion.div layout className="card muted" data-testid="accordion-sibling">
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
  const [items, setItems] = useState(["#f43f5e", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6"]);
  return (
    <section data-demo="shuffle">
      <h2>Layout: reorder</h2>
      <button data-testid="shuffle" onClick={() => setItems(shuffled)}>
        Shuffle
      </button>
      <ul className="shuffle">
        <LayoutGroup>
          {items.map((color) => (
            <motion.li
              key={color}
              layout
              data-testid={`shuffle-${color.slice(1)}`}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              style={{ background: color }}
            />
          ))}
        </LayoutGroup>
      </ul>
    </section>
  );
}

function Tabs() {
  const tabs = ["Home", "Docs", "Blog", "About"];
  const [selected, setSelected] = useState("Home");
  return (
    <section data-demo="tabs">
      <h2>Shared layout: tabs</h2>
      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={selected === tab ? "selected" : undefined}
            data-testid={`tab-${tab}`}
            onClick={() => setSelected(tab)}
          >
            {tab}
            {selected === tab && (
              <motion.div
                className="underline"
                data-testid="underline"
                layoutId="underline"
                transition={{ type: "spring", visualDuration: 0.35, bounce: 0.2 }}
              />
            )}
          </button>
        ))}
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
  const [selected, setSelected] = useState<string | null>(null);
  const card = cards.find((c) => c.id === selected);
  return (
    <section data-demo="gallery">
      <h2>Shared layout: card → modal</h2>
      <div className="gallery">
        {cards.map((item) => (
          <motion.div
            key={item.id}
            className="thumb"
            data-testid={`thumb-${item.id}`}
            layoutId={`card-${item.id}`}
            style={{ background: item.color, borderRadius: 12 }}
            onClick={() => setSelected(item.id)}
          >
            <motion.h3 layoutId={`title-${item.id}`}>{item.title}</motion.h3>
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {card && (
          <div className="overlay" key="overlay" onClick={() => setSelected(null)}>
            <motion.div
              className="modal"
              data-testid="modal"
              layoutId={`card-${card.id}`}
              style={{ background: card.color, borderRadius: 24 }}
            >
              <motion.h3 layoutId={`title-${card.id}`}>{card.title}</motion.h3>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Click anywhere to close.
              </motion.p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  return (
    <motion.div
      className="progress"
      data-testid="scroll-progress"
      style={{ scaleX: scrollYProgress }}
    />
  );
}

function InView() {
  const scroller = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    container: scroller,
    target,
    offset: ["start end", "end start"],
  });
  const rotate = useTransform(scrollYProgress, [0, 1], [-90, 90]);
  const [entered, setEntered] = useState(0);
  return (
    <section data-demo="in-view">
      <h2>In view, scroll-linked</h2>
      <p>
        Entered: <span data-testid="in-view-count">{entered}</span>
      </p>
      <div className="scroller" data-testid="in-view-scroller" ref={scroller}>
        {[1, 2, 3, 4].map((n) => (
          <motion.div
            key={n}
            className="card muted"
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ root: scroller, amount: 0.6 }}
            onViewportEnter={() => setEntered((count) => count + 1)}
          >
            Item {n}
          </motion.div>
        ))}
        <div className="row spin-row" ref={target}>
          <motion.div className="box small" data-testid="scroll-spin" style={{ rotate }} />
        </div>
        {[5, 6, 7, 8].map((n) => (
          <motion.div
            key={n}
            className="card muted"
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ root: scroller, amount: 0.6, once: true }}
          >
            Item {n} (once)
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function PanPinch() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [scale, setScale] = useState(1);
  return (
    <section data-demo="pan-pinch">
      <h2>Pan, pinch</h2>
      <div className="row stage">
        <motion.div
          className="box"
          data-testid="pan-box"
          style={{ x, y, touchAction: "none" }}
          onPan={(_event, info) => {
            x.set(info.offset.x);
            y.set(info.offset.y);
          }}
          onPanEnd={() => {
            animate(x, 0, { type: "spring" });
            animate(y, 0, { type: "spring" });
          }}
        />
        <LazyMotion features={pinchFeatures}>
          <motion.div
            className="box"
            data-testid="pinch-box"
            pinch={{
              scale: { min: 0.5, max: 3 },
              onMove: (_event, info) => setScale(info.scale),
            }}
            whilePinch={{ background: "#10b981" }}
          />
        </LazyMotion>
        <p>
          Pinch scale: <span data-testid="pinch-scale">{scale.toFixed(2)}</span>
        </p>
      </div>
    </section>
  );
}

function Sequence() {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const play = () =>
    animate([
      [".dot", { y: -40 }, { delay: stagger(0.08), duration: 0.2 }],
      [".dot", { y: 0 }, { delay: stagger(0.08), type: "spring", bounce: 0.5 }],
      ["button", { rotate: [0, -8, 8, 0] }, { duration: 0.3 }],
    ]);
  return (
    <section data-demo="sequence">
      <h2>useAnimate, sequences</h2>
      <div className="row stage" ref={scope}>
        <button data-testid="sequence-play" onClick={play}>
          Play
        </button>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="dot" />
        ))}
      </div>
    </section>
  );
}

function App() {
  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      <ScrollProgress />
      <main>
        <h1>Motion for React (comparison)</h1>
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
        <InView />
        <PanPinch />
        <Sequence />
      </main>
    </MotionConfig>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
