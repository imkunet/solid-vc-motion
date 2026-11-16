import {
  frame,
  globalProjectionState,
  microtask,
  rootProjectionNode,
  visualElementStore,
  type IProjectionNode,
  type MotionNodeOptions,
  type NodeGroup,
} from "motion-dom";

/**
 * Layout animations in Solid.
 *
 * React measures layouts in `getSnapshotBeforeUpdate` and animates in
 * `componentDidUpdate`, so a node snapshots whenever its component
 * re-renders. Solid components never re-render, but Solid 2 runs every
 * computation (component bodies, effect computes, disposal) in a pure phase
 * before it writes to the DOM, and effect callbacks after. So:
 *
 * - before: a layout node snapshots its layout scope when it's created, when
 *   it's disposed, and when its props or children change (or only its
 *   `layoutDependency`, if it has one);
 * - after: once Solid has committed the DOM, the root measures again and
 *   animates every node whose layout changed.
 *
 * React's equivalent of the scope is the subtree that re-rendered: siblings
 * rendered by the same component animate, layout nodes elsewhere on the page
 * jump along with the rest of the document. Here the scope is the element
 * containing the change: the trigger's parent element, widened to the
 * parent of any `layout` ancestor (whose size it may change). Wider
 * coordination goes through LayoutGroup, as in React.
 */

/** Until a snapshot exists, mounting nodes needn't trigger a layout update. */
let hasTakenAnySnapshot = false;

export const isLayoutNode = (props: MotionNodeOptions) => Boolean(props.layout || props.layoutId);

/**
 * The element whose descendants may move when the layout at `element`
 * changes: `element` itself, or the parent of its outermost layout ancestor.
 */
export function layoutScope(element: Element): Element {
  let scope = element;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const projection = visualElementStore.get(node)?.projection;
    if (projection && isLayoutNode(projection.options)) {
      scope = node.parentElement ?? node;
    }
  }
  return scope;
}

/**
 * Snapshots the layout nodes inside `scope`, plus `trigger` (and, through
 * its willUpdate, its LayoutGroup), before a DOM change. Pair with
 * `commitLayout()` after the change.
 */
export function snapshotLayout(scope: Element | null | undefined, trigger?: IProjectionNode) {
  const root = rootProjectionNode.current;
  if (!root) return;

  hasTakenAnySnapshot = true;
  if (scope) {
    // The root's FlatTree is typed by depth only; it holds projection nodes.
    root.nodes!.forEach((entry) => {
      const node = entry as IProjectionNode;
      const { layout, layoutId, visualElement } = node.options;
      if (
        node.instance &&
        (layout || layoutId) &&
        visualElement?.getProps().layoutDependency === undefined &&
        scope.contains(node.instance as Element)
      ) {
        node.willUpdate();
      }
    });
  }
  trigger?.willUpdate();
}

/** The layout scope of a mounted node's own change. */
export const scopeOf = (projection: IProjectionNode) => {
  const parent = (projection.instance as Element | undefined)?.parentElement;
  return parent && layoutScope(parent);
};

/** Measures and animates every layout node snapshotted before the DOM change. */
export function commitLayout() {
  rootProjectionNode.current?.didUpdate();
}

/** The projection node is created with the first props, so keep these in sync. */
const layoutOptions = ({ layout, layoutDependency, layoutAnchor }: MotionNodeOptions) => ({
  layout,
  layoutDependency,
  layoutAnchor,
  animationType: typeof layout === "string" ? layout : ("both" as const),
});

/**
 * Moves a mounted node to its new layoutId's stack, as an unmount and remount
 * would. Returns a takeover to run once the DOM has updated.
 */
function switchLayoutId(projection: IProjectionNode, layoutId?: string) {
  const { snapshot } = projection;
  const stack = projection.getStack();
  stack?.remove(projection);

  const lead = stack?.lead;
  if (stack?.prevLead === projection && lead!.resumeFrom === projection) {
    lead!.resumeFrom = lead!.currentAnimation = projection.resumingFrom = undefined;
  }
  projection.options.layoutId = layoutId;

  if (!layoutId) {
    projection.needsShow = true;
    return;
  }
  projection.root!.registerSharedNode(layoutId, projection);

  return () => {
    const { resumeFrom } = projection;
    if (resumeFrom?.isPresent !== false && projection.getStack()!.members.includes(resumeFrom!)) {
      resumeFrom!.hide();
      projection.resumeFrom = undefined;
      projection.snapshot = snapshot;
    }
  };
}

/**
 * The layout lifecycle of one motion component; a port of Motion for React's
 * MeasureLayout with the before/after hooks driven by the component.
 */
export class LayoutController {
  isMounted = false;
  private takeOver?: VoidFunction;
  private prevLayoutId?: string;
  private prevDependency: unknown;
  private safeToRemove: VoidFunction = () => {};

  constructor(
    readonly projection: IProjectionNode,
    private readonly group?: NodeGroup,
  ) {}

  /** After the element is in the DOM. */
  mount(props: MotionNodeOptions) {
    const { projection, group } = this;
    this.isMounted = true;

    group?.add(projection);
    if (hasTakenAnySnapshot) projection.root!.didUpdate();

    if (projection.options.layoutId !== props.layoutId) {
      switchLayoutId(projection, props.layoutId)?.();
    }

    projection.addEventListener("animationComplete", () => this.safeToRemove());
    projection.setOptions({
      ...projection.options,
      ...layoutOptions(props),
      onExitComplete: () => this.safeToRemove(),
    });
    globalProjectionState.hasEverUpdated = true;

    this.prevLayoutId = props.layoutId;
    this.prevDependency = props.layoutDependency;
  }

  /** Before Solid writes changed props or children to the DOM. */
  willUpdate(props: MotionNodeOptions) {
    if (!this.isMounted) return;
    const { projection } = this;

    projection.isPresent = true;
    if (this.prevLayoutId !== props.layoutId) {
      projection.willUpdate();
      this.takeOver = switchLayoutId(projection, props.layoutId);
    }
    projection.setOptions({ ...projection.options, ...layoutOptions(props) });

    const { layoutDependency } = props;
    if (layoutDependency === undefined || layoutDependency !== this.prevDependency) {
      snapshotLayout(scopeOf(projection), projection);
    }

    this.prevLayoutId = props.layoutId;
    this.prevDependency = layoutDependency;
  }

  /** After Solid has written to the DOM. */
  didUpdate() {
    if (!this.isMounted) return;
    this.takeOver?.();
    this.takeOver = undefined;
    this.projection.root!.didUpdate();
  }

  /**
   * The element is exiting inside AnimatePresence. `safeToRemove` fires
   * once any layout animation it's part of (e.g. a shared layout handoff)
   * no longer needs it.
   */
  exit(safeToRemove: VoidFunction) {
    const { projection } = this;
    this.safeToRemove = safeToRemove;

    projection.isPresent = false;
    projection.willUpdate();
    if (!projection.relegate()) {
      // A stack member taking over is in charge of the exit; else we are.
      frame.postRender(() => {
        if (!projection.getStack()?.members.length) this.safeToRemove();
      });
    }
    projection.root!.didUpdate();
    microtask.postRender(() => {
      if (!projection.currentAnimation && projection.isLead()) {
        this.safeToRemove();
      }
    });
  }

  unmount() {
    if (!this.isMounted) return;
    hasTakenAnySnapshot = true;
    this.projection.scheduleCheckAfterUnmount();
    this.group?.remove(this.projection);
  }
}
