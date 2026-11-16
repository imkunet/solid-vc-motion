import { memo, type JSX } from "@solidjs/web";
import {
  children,
  createComponent,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
  type ResolvedElement,
} from "solid-js";
import {
  MotionContext,
  PresenceContext,
  type PresenceController,
  type PresenceEntrant,
  type PresenceMember,
} from "../context";
import { commitLayout, layoutScope, snapshotLayout } from "../motion/layout";

export interface AnimatePresenceProps {
  children?: JSX.Element;
  /** `false` skips the enter animation of the children present on first render. */
  initial?: boolean;
  /** Passed to dynamic `exit` variants, read when the exit starts. */
  custom?: unknown;
  /**
   * - "sync": children enter and exit at the same time.
   * - "wait": entering children wait until exiting ones have left.
   * - "popLayout": exiting children are taken out of the layout
   *   (position: absolute), so siblings with `layout` animate into their space.
   */
  mode?: "sync" | "wait" | "popLayout";
  /** Fires once every exiting child has been removed. */
  onExitComplete?: VoidFunction;
  /** Whether presence changes trigger layout animations of `layout` nodes. Default true. */
  presenceAffectsLayout?: boolean;
}

interface PopBox {
  width: number;
  height: number;
  top: number;
  left: number;
  /** Viewport position before popping, to correct for margins after. */
  rect: DOMRect;
}

interface ExitRecord {
  members: PresenceMember[];
  /**
   * Removed in a pass that added nothing, so a child entering later in its
   * place is the same child coming back (React: the same key returning).
   */
  replaceable: boolean;
  pop?: PopBox;
  started: boolean;
  done: boolean;
}

interface PresenceFrame {
  rendered: ResolvedElement[];
  removedMembers: PresenceMember[];
  /** Whether an exit finished (rather than only being taken over). */
  hasCompletedExit: boolean;
}

/** Measured before the exiting element moves, like React's PopChild. */
function measurePop(node: Element): PopBox | undefined {
  if (!(node instanceof HTMLElement)) return;
  const style = getComputedStyle(node);
  return {
    width: parseFloat(style.width),
    height: parseFloat(style.height),
    top: node.offsetTop,
    left: node.offsetLeft,
    rect: node.getBoundingClientRect(),
  };
}

/** Takes the element out of the layout, where it was. */
function applyPop(node: Element, box: PopBox) {
  if (!(node instanceof HTMLElement) || !box.width || !box.height) return;
  const { style } = node;
  const place = (top: number, left: number) => {
    style.setProperty("top", `${top}px`, "important");
    style.setProperty("left", `${left}px`, "important");
  };
  style.setProperty("position", "absolute", "important");
  style.setProperty("width", `${box.width}px`, "important");
  style.setProperty("height", `${box.height}px`, "important");
  place(box.top, box.left);

  // offsetTop/Left exclude margins, which still apply once absolute.
  const rect = node.getBoundingClientRect();
  const dx = box.rect.left - rect.left;
  const dy = box.rect.top - rect.top;
  if (dx || dy) place(box.top + dy, box.left + dx);
}

const inDocumentOrder = <T extends { element: Element }>(list: T[]) =>
  list.sort((a, b) =>
    a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );

/**
 * Lets `entering` take over from the exiting `node`, as React re-enters an
 * element whose key comes back mid-exit. Solid always creates a new element,
 * so the new one continues from the exiting one's values instead. Requires
 * the same element structure and keys, and either matching keys or a
 * removal that nothing replaced.
 */
function handOff(
  node: ResolvedElement,
  record: ExitRecord,
  entering: ResolvedElement,
  entrants: Set<PresenceEntrant>,
) {
  if (
    record.done ||
    !(node instanceof Element) ||
    !(entering instanceof Element) ||
    node.tagName !== entering.tagName
  ) {
    return false;
  }

  const from = inDocumentOrder([...record.members]);
  const to = inDocumentOrder(
    [...entrants].filter(({ element }) => element === entering || entering.contains(element)),
  );
  if (!to.length || to.length !== from.length) return false;
  const isSameStructure = to.every(
    (entrant, i) =>
      entrant.element.tagName === from[i].element.tagName && entrant.key === from[i].key,
  );
  if (!isSameStructure || (!record.replaceable && from[0].key === undefined)) {
    return false;
  }

  to.forEach((entrant, i) => entrant.resumeFrom(from[i].visualElement));
  return true;
}

/**
 * Keeps removed children in the DOM while the motion components inside them
 * play their `exit` animation.
 *
 * Solid disposes a removed child (and the motion components in it) before
 * it leaves the DOM. A disposed motion component inside AnimatePresence
 * doesn't unmount right away: if its top-level child is the one being
 * removed, AnimatePresence claims it, keeps that child rendered, runs the
 * exits and removes the child once they've all finished.
 */
export function AnimatePresence(props: AnimatePresenceProps): JSX.Element {
  const motionParent = useContext(MotionContext);
  const members = new Set<PresenceMember>();
  const entrants = new Set<PresenceEntrant>();
  const exiting = new Map<ResolvedElement, ExitRecord>();
  const deferredMounts = new Map<Element, VoidFunction>();
  const [completedExits, setCompletedExits] = createSignal(0);
  let isInitialRender = true;

  const mode = () => untrack(() => props.mode) ?? "sync";
  const affectsLayout = () => untrack(() => props.presenceAffectsLayout) !== false;

  const controller: PresenceController = {
    initial: () => (isInitialRender && untrack(() => props.initial) === false ? false : undefined),
    custom: () => untrack(() => props.custom),
    register(member) {
      members.add(member);
      return () => members.delete(member);
    },
    enter(entrant) {
      entrants.add(entrant);
      return () => entrants.delete(entrant);
    },
    deferMount(element, mount) {
      deferredMounts.set(element, mount);
      return () => {
        if (deferredMounts.get(element) === mount) {
          deferredMounts.delete(element);
        }
      };
    },
  };

  const claimMembers = (node: ResolvedElement) => {
    if (!(node instanceof Element)) return [];
    const claimed: PresenceMember[] = [];
    for (const member of members) {
      if (!member.exiting && (member.element === node || node.contains(member.element))) {
        member.exiting = true;
        claimed.push(member);
      }
    }
    return claimed;
  };

  /** Rendered inside the PresenceContext so children are created under it. */
  const PresenceChildren = () => {
    const present = children(() => props.children);

    const frame = createMemo<PresenceFrame>((prev) => {
      completedExits();
      const presentNodes = present.toArray();
      const presentIndex = new Map(presentNodes.map((node, i) => [node, i]));
      const previous = prev?.rendered ?? presentNodes;
      const previousNodes = new Set(previous);
      const isAdding = presentNodes.some((node) => !previousNodes.has(node));
      const removedMembers: PresenceMember[] = [];

      // Children that just left: keep those with motion components to exit.
      for (const node of previous) {
        if (presentIndex.has(node) || exiting.has(node)) continue;
        const claimed = claimMembers(node);
        if (!claimed.length) continue;
        exiting.set(node, {
          members: claimed,
          replaceable: !isAdding,
          pop: mode() === "popLayout" ? measurePop(node as Element) : undefined,
          started: false,
          done: false,
        });
      }

      let hasCompletedExit = false;
      for (const [node, record] of exiting) {
        if (!record.done) continue;
        exiting.delete(node);
        removedMembers.push(...record.members);
        hasCompletedExit = true;
      }

      // Exiting children keep their place among the present ones.
      let rendered = [...presentNodes];
      const exitingNodes: ResolvedElement[] = [];
      let insertionIndex = 0;
      for (const node of previous) {
        const index = presentIndex.get(node);
        if (index !== undefined) {
          insertionIndex = index + exitingNodes.length + 1;
        } else if (exiting.has(node)) {
          rendered.splice(insertionIndex++, 0, node);
          exitingNodes.push(node);
        }
      }

      // A child entering right where one is exiting may be it coming back.
      for (let i = 0; i < rendered.length - 1; i++) {
        const node = rendered[i];
        const record = exiting.get(node);
        const next = rendered[i + 1];
        if (!record || previousNodes.has(next) || !handOff(node, record, next, entrants)) {
          continue;
        }
        exiting.delete(node);
        removedMembers.push(...record.members);
        rendered.splice(i, 1);
        exitingNodes.splice(exitingNodes.indexOf(node), 1);
      }
      if (mode() === "wait" && exitingNodes.length) rendered = exitingNodes;

      // The DOM is about to change: snapshot layout nodes first.
      if (prev && affectsLayout()) {
        // Where the children are, or else the closest motion parent.
        const sibling = previous.find(
          (node): node is Node => node instanceof Node && !!node.parentElement,
        );
        const parentElement = motionParent.visualElement?.current;
        const container =
          sibling?.parentElement ?? (parentElement instanceof Element ? parentElement : undefined);
        snapshotLayout(container && layoutScope(container));
      }

      return { rendered, removedMembers, hasCompletedExit };
    });

    createEffect(frame, ({ removedMembers, hasCompletedExit }) => {
      isInitialRender = false;

      for (const [node, record] of exiting) {
        if (record.started) continue;
        record.started = true;
        if (record.pop) applyPop(node as Element, record.pop);
        void Promise.all(record.members.map((member) => member.exit())).then(() => {
          if (exiting.get(node) !== record) return;
          record.done = true;
          setCompletedExits((count) => count + 1);
        });
      }

      for (const member of removedMembers) member.finalize();

      for (const [element, mount] of deferredMounts) {
        if (!element.isConnected) continue;
        deferredMounts.delete(element);
        mount();
      }

      if (hasCompletedExit && !exiting.size) {
        untrack(() => props.onExitComplete)?.();
      }

      if (affectsLayout()) commitLayout();
    });

    onCleanup(() => {
      for (const record of exiting.values()) {
        for (const member of record.members) member.finalize();
      }
      exiting.clear();
      deferredMounts.clear();
    });

    // An accessor child stays reactive, as `<>{frame().rendered}</>` would.
    return memo(() => frame().rendered) as unknown as JSX.Element;
  };

  return createComponent(PresenceContext, {
    value: controller,
    get children() {
      return createComponent(PresenceChildren, {});
    },
  });
}
