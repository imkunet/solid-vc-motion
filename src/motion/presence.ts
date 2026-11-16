import type { PresenceContextProps } from "motion-dom";
import type { PresenceController } from "../context";

let presenceId = 0;

/**
 * The presence one motion component hands its VisualElement. React gives
 * every AnimatePresence child its own PresenceContext; in Solid the
 * AnimatePresence context is shared, so each motion component tracks the
 * exits it waits on (the exit animation, a layout handoff) itself.
 */
export function createPresenceState(controller: PresenceController) {
  const id = `presence-${presenceId++}`;
  const initial = controller.initial();
  const blockers = new Map<string | number, boolean>();
  let onExitDone: VoidFunction | undefined;

  const checkDone = () => {
    if (!onExitDone) return;
    for (const isDone of blockers.values()) if (!isDone) return;
    const done = onExitDone;
    onExitDone = undefined;
    done();
  };

  const create = (isPresent: boolean): PresenceContextProps => ({
    id,
    isPresent,
    initial,
    get custom() {
      return controller.custom();
    },
    register(blockerId) {
      blockers.set(blockerId, false);
      return () => {
        blockers.delete(blockerId);
        checkDone();
      };
    },
    onExitComplete(blockerId) {
      blockers.set(blockerId, true);
      checkDone();
    },
  });

  const present = create(true);

  return {
    present,
    /**
     * Switches to a non-present context. `apply` hands it to the
     * VisualElement (and starts the layout exit) and may register more
     * blockers; the promise resolves once every blocker completes.
     */
    exit(apply: (absent: PresenceContextProps) => void) {
      for (const key of blockers.keys()) blockers.set(key, false);
      const absent = create(false);
      const { promise, resolve } = Promise.withResolvers<void>();
      onExitDone = resolve;
      apply(absent);
      checkDone();
      return promise;
    },
  };
}
