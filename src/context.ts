import type { NodeGroup, ReducedMotionConfig, Transition, VisualElement } from "motion-dom";
import type { TransformPoint } from "motion-utils";
import { createContext } from "solid-js";

/**
 * Links a motion component to its closest motion ancestor: the parent
 * VisualElement plus the variant labels children inherit.
 */
export interface MotionContextValue {
  visualElement?: VisualElement;
  initial?: false | string | string[];
  animate?: string | string[];
}

export const MotionContext = createContext<MotionContextValue>({});

export interface MotionConfigValue {
  /** Default transition for every motion component in the tree. */
  transition?: Transition;
  /** Respect the OS reduced-motion setting ("user"), or force it on/off. */
  reducedMotion?: ReducedMotionConfig;
  /** Jump every animation to its end. Useful for tests and screenshots. */
  skipAnimations?: boolean;
  transformPagePoint?: TransformPoint;
  /** Decides which props reach the DOM element. */
  isValidProp?: (key: string) => boolean;
}

export const MotionConfigContext = createContext<MotionConfigValue>({
  reducedMotion: "never",
});

export interface LayoutGroupValue {
  id?: string;
  group?: NodeGroup;
}

export const LayoutGroupContext = createContext<LayoutGroupValue>({});

/**
 * A motion component that rendered inside an AnimatePresence. The presence
 * claims it when the top-level child containing `element` is removed.
 */
export interface PresenceMember {
  readonly element: Element;
  readonly visualElement: VisualElement;
  /** The `key` prop: which entering element may take over from this one. */
  readonly key: unknown;
  /** Set once the presence has claimed this member for an exit. */
  exiting: boolean;
  /** Starts the exit; resolves once the element is safe to remove. */
  exit(): Promise<void>;
  /** Unmounts the member's VisualElement. */
  finalize(): void;
}

/** A motion component inside AnimatePresence that hasn't mounted yet. */
export interface PresenceEntrant {
  readonly element: Element;
  readonly key: unknown;
  /**
   * Takes over from an exiting element: start from its current values
   * rather than `initial`, as React re-enters an exiting element.
   */
  resumeFrom(source: VisualElement): void;
}

export interface PresenceController {
  /** `false` while AnimatePresence renders its first children with initial={false}. */
  initial(): false | undefined;
  /** The latest `custom` given to AnimatePresence, for exit variants. */
  custom(): unknown;
  register(member: PresenceMember): VoidFunction;
  /** Tracks a created, not yet mounted motion component. */
  enter(entrant: PresenceEntrant): VoidFunction;
  /**
   * Withheld children (mode="wait") are created before they're inserted.
   * Their mount runs once the presence inserts them. Returns a cancel.
   */
  deferMount(element: Element, mount: VoidFunction): VoidFunction;
}

export const PresenceContext = createContext<PresenceController | null>(null);
