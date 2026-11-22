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
  node: HTMLElement;
  width: number;
  height: number;
  top: number;
  left: number;
  /** Viewport position before popping, to correct for margins after. */
  rect: DOMRect;
}

interface ExitRecord {
  /** In document order. */
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

/** A motion component's mount, waiting for its element to be inserted. */
interface PendingMount {
  mount: VoidFunction;
  /** Cancels it with whichever presence holds it now. */
  cancel: VoidFunction;
}

/** Measured before the exiting element moves, like React's PopChild. */
function measurePop(node: Element): PopBox | undefined {
  if (!(node instanceof HTMLElement)) return;
  const style = getComputedStyle(node);
  const width = parseFloat(style.width);
  const height = parseFloat(style.height);
  if (!width || !height) return;
  return {
    node,
    width,
    height,
    top: node.offsetTop,
    left: node.offsetLeft,
    rect: node.getBoundingClientRect(),
  };
}

/**
 * Takes exiting elements out of the layout, where they were. All writes,
 * then all reads, so popping N elements together forces one layout, not N.
 */
function applyPops(pops: PopBox[]) {
  const place = ({ style }: HTMLElement, top: number, left: number) => {
    style.setProperty("top", `${top}px`, "important");
    style.setProperty("left", `${left}px`, "important");
  };
  for (const { node, width, height, top, left } of pops) {
    node.style.setProperty("position", "absolute", "important");
    node.style.setProperty("width", `${width}px`, "important");
    node.style.setProperty("height", `${height}px`, "important");
    place(node, top, left);
  }

  // offsetTop/Left exclude margins, which still apply once absolute.
  const rects = pops.map(({ node }) => node.getBoundingClientRect());
  pops.forEach(({ node, top, left, rect }, i) => {
    const dx = rect.left - rects[i].left;
    const dy = rect.top - rects[i].top;
    if (dx || dy) place(node, top + dy, left + dx);
  });
}

const inDocumentOrder = <T extends { element: Element }>(list: T[]) =>
  list.sort((a, b) =>
    a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );

/**
 * Whether `entering`, with the not yet mounted motion components `to` in it
 * (in document order), can take over from the exiting `node`, as React
 * re-enters an element whose key comes back mid-exit. Solid always creates
 * a new element, so the new one continues from the exiting one's values
 * instead. Requires the same element structure and keys, and either
 * matching keys or a removal that nothing replaced.
 */
function canHandOff(
  node: ResolvedElement,
  record: ExitRecord,
  entering: ResolvedElement,
  to: PresenceEntrant[],
) {
  const from = record.members;
  return (
    !record.done &&
    node instanceof Element &&
    entering instanceof Element &&
    node.tagName === entering.tagName &&
    to.length > 0 &&
    to.length === from.length &&
    (record.replaceable || from[0].key !== undefined) &&
    to.every(
      (entrant, i) =>
        entrant.element.tagName === from[i].element.tagName && entrant.key === from[i].key,
    )
  );
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
  const parentPresence = useContext(PresenceContext);
  const members = new Set<PresenceMember>();
  const entrants = new Set<PresenceEntrant>();
  const exiting = new Map<ResolvedElement, ExitRecord>();
  const deferredMounts = new Map<Element, PendingMount>();
  const [completedExits, setCompletedExits] = createSignal(0);
  let isInitialRender = true;
  /** Present children that mode="wait" keeps out until the exits finish. */
  let withheld: ResolvedElement[] = [];
  const holds = (element: Element) =>
    withheld.some((node) => node instanceof Node && node.contains(element));

  /**
   * Mounts once no presence withholds `element`. Outer presences go first,
   * as they insert the subtree; either may withhold it again before the
   * other releases it, so it moves between them and `cancel` follows.
   */
  const hold = (element: Element, pending: PendingMount) => {
    if (parentPresence?.isWithheld(element)) {
      pending.cancel = parentPresence.deferMount(element, () => hold(element, pending));
    } else if (holds(element)) {
      deferredMounts.set(element, pending);
      pending.cancel = () =>
        deferredMounts.get(element) === pending && deferredMounts.delete(element);
    } else {
      pending.mount();
    }
  };

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
    isWithheld: (element) => holds(element) || !!parentPresence?.isWithheld(element),
    deferMount(element, mount) {
      const pending: PendingMount = { mount, cancel: () => {} };
      hold(element, pending);
      return () => pending.cancel();
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

  /** The not yet mounted motion components in each of `nodes`, in document order. */
  const entrantsIn = (nodes: ResolvedElement[]) => {
    const found = new Map<ResolvedElement, PresenceEntrant[]>(nodes.map((node) => [node, []]));
    for (const entrant of entrants) {
      let element: Element | null = entrant.element;
      while (element && !found.has(element)) element = element.parentElement;
      if (element) found.get(element)!.push(entrant);
    }
    found.forEach((list) => inDocumentOrder(list));
    return found;
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
          members: inDocumentOrder(claimed),
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

      // Children entering right where others are exiting may be them coming
      // back: a run of exiting children pairs up, in order (or by key), with
      // the run of entering ones right after it.
      for (let i = 0; i < rendered.length;) {
        let j = i;
        while (j < rendered.length && exiting.has(rendered[j])) j++;
        let k = j;
        while (k < rendered.length && !previousNodes.has(rendered[k])) k++;
        if (j === i || k === j) {
          i = Math.max(k, i + 1);
          continue;
        }

        const entering = entrantsIn(rendered.slice(j, k));
        const staying = rendered.slice(i, j).filter((node) => {
          const record = exiting.get(node)!;
          for (const [next, to] of entering) {
            if (!canHandOff(node, record, next, to)) continue;
            entering.delete(next);
            to.forEach((entrant, n) => entrant.resumeFrom(record.members[n].visualElement));
            exiting.delete(node);
            removedMembers.push(...record.members);
            exitingNodes.splice(exitingNodes.indexOf(node), 1);
            return false;
          }
          return true;
        });
        rendered.splice(i, j - i, ...staying);
        i += staying.length + (k - j);
      }
      withheld = mode() === "wait" && exitingNodes.length ? presentNodes : [];
      if (withheld.length) rendered = exitingNodes;

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

      const starting = [...exiting].filter(([, record]) => !record.started);
      applyPops(starting.flatMap(([, record]) => record.pop ?? []));
      for (const [node, record] of starting) {
        record.started = true;
        void Promise.all(record.members.map((member) => member.exit())).then(() => {
          if (exiting.get(node) !== record) return;
          record.done = true;
          setCompletedExits((count) => count + 1);
        });
      }

      for (const member of removedMembers) member.finalize();

      for (const [element, pending] of deferredMounts) {
        if (holds(element)) continue;
        deferredMounts.delete(element);
        hold(element, pending);
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
