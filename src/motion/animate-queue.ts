import type { VisualElement } from "motion-dom";

/**
 * React runs effects children-first, so by the time a parent animates its
 * variants every child has mounted and joined its `variantChildren`. Solid
 * runs effects in creation order (parents first), so animation starts are
 * batched to the end of the flush and run deepest-first, as React would.
 */
const pending = new Set<VisualElement>();
let isScheduled = false;

export function scheduleAnimateChanges(visualElement: VisualElement) {
  pending.add(visualElement);
  if (isScheduled) return;
  isScheduled = true;
  queueMicrotask(flushAnimateChanges);
}

function flushAnimateChanges() {
  isScheduled = false;
  const batch = [...pending].sort((a, b) => b.depth - a.depth);
  pending.clear();

  for (const visualElement of batch) {
    if (visualElement.current) void visualElement.animationState?.animateChanges();
  }

  /**
   * Entering children stagger against their siblings that entered in the
   * same batch. A parent's effect clears this set in React; a Solid parent
   * doesn't re-run when children mount, so clear it here.
   */
  for (const visualElement of batch) {
    visualElement.enteringChildren = undefined;
    if (visualElement.parent) visualElement.parent.enteringChildren = undefined;
  }
}
