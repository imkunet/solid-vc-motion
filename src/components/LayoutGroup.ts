import type { JSX } from "@solidjs/web";
import { nodeGroup } from "motion-dom";
import { children, createComponent, createEffect, untrack, useContext } from "solid-js";
import { LayoutGroupContext, type LayoutGroupValue } from "../context";
import { commitLayout } from "../motion/layout";

export interface LayoutGroupProps {
  /** Namespaces the `layoutId`s inside, so separate groups can reuse ids. */
  id?: string;
  /**
   * `true` (default): join the parent group and prefix its id.
   * `"id"`: only prefix the parent's id. `false`: stand alone.
   */
  inherit?: boolean | "id";
  children?: JSX.Element;
}

/**
 * Groups layout nodes that affect each other: when one of them updates, they
 * all measure, so all of them animate.
 *
 * In Solid a list reorder doesn't touch the props of its items, so the group
 * also treats any change to its direct children (added, removed or moved,
 * e.g. by a `<For>`) as an update of its members.
 */
export function LayoutGroup(props: LayoutGroupProps): JSX.Element {
  const parent = useContext(LayoutGroupContext);
  const value = untrack((): LayoutGroupValue => {
    const inherit = props.inherit ?? true;
    let id = props.id;
    if ((inherit === true || inherit === "id") && parent.id) {
      id = id ? `${parent.id}-${id}` : parent.id;
    }
    return {
      id,
      group: inherit === true ? (parent.group ?? nodeGroup()) : nodeGroup(),
    };
  });

  const GroupChildren = () => {
    const resolved = children(() => props.children);
    createEffect(
      (previous?: unknown[]) => {
        const nodes = resolved.toArray();
        // Before Solid moves the children: measure every member.
        if (previous) untrack(() => value.group!.dirty());
        return nodes;
      },
      (_nodes, previous) => {
        if (previous) commitLayout();
      },
    );
    // An accessor child stays reactive, as `<>{resolved()}</>` would.
    return resolved as unknown as JSX.Element;
  };

  return createComponent(LayoutGroupContext, {
    value,
    get children() {
      return createComponent(GroupChildren, {});
    },
  });
}
