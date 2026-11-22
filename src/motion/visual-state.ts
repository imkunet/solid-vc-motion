import {
  buildHTMLStyles,
  buildSVGAttrs,
  camelCaseAttributes,
  camelToDash,
  isAnimationControls,
  isControllingVariants,
  isForcedMotionValue,
  isMotionValue,
  isSVGTag,
  isVariantNode,
  resolveMotionValue,
  resolveVariantFromProps,
  scrapeHTMLMotionValuesFromProps,
  scrapeSVGMotionValuesFromProps,
  type AnyResolvedKeyframe,
  type HTMLRenderState,
  type MotionNodeOptions,
  type PresenceContextProps,
  type ResolvedValues,
  type SVGRenderState,
} from "motion-dom";
import type { MotionContextValue } from "../context";

export interface VisualState<RenderState> {
  latestValues: ResolvedValues;
  renderState: RenderState;
}

const createHTMLRenderState = (): HTMLRenderState => ({
  style: {},
  transform: {},
  transformOrigin: {},
  vars: {},
});

const createSVGRenderState = (): SVGRenderState => ({
  ...createHTMLRenderState(),
  attrs: {},
});

/**
 * The values an element first renders with: motion values from `style`, then
 * `initial` (or `animate`, when the initial animation is blocked).
 */
function makeLatestValues(
  props: MotionNodeOptions,
  context: MotionContextValue,
  presence: PresenceContextProps | null,
  isSVG: boolean,
) {
  const values: ResolvedValues = {};
  const scrape = isSVG ? scrapeSVGMotionValuesFromProps : scrapeHTMLMotionValuesFromProps;
  const motionValues = scrape(props, {});
  for (const key in motionValues) {
    values[key] = resolveMotionValue(motionValues[key]);
  }

  let { initial, animate } = props;
  if (isVariantNode(props) && !isControllingVariants(props) && props.inherit !== false) {
    if (initial === undefined) initial = context.initial;
    if (animate === undefined) animate = context.animate;
  }

  const isInitialAnimationBlocked = presence?.initial === false || initial === false;
  const variantToSet = isInitialAnimationBlocked ? animate : initial;

  if (!variantToSet || typeof variantToSet === "boolean" || isAnimationControls(variantToSet)) {
    return values;
  }

  const list = Array.isArray(variantToSet) ? variantToSet : [variantToSet];
  for (const definition of list) {
    const resolved = resolveVariantFromProps(props, definition);
    if (!resolved) continue;

    const { transitionEnd, transition: _transition, ...target } = resolved;
    for (const key in target) {
      const valueTarget = target[key as keyof typeof target];
      // A blocked initial animation starts where it would have ended.
      const value = Array.isArray(valueTarget)
        ? valueTarget[isInitialAnimationBlocked ? valueTarget.length - 1 : 0]
        : valueTarget;
      if (value !== null) {
        values[key] = value as AnyResolvedKeyframe;
      }
    }
    for (const key in transitionEnd) {
      values[key] = transitionEnd[key as keyof typeof transitionEnd] as AnyResolvedKeyframe;
    }
  }

  return values;
}

export function makeVisualState(
  props: MotionNodeOptions,
  context: MotionContextValue,
  presence: PresenceContextProps | null,
  isSVG: boolean,
): VisualState<HTMLRenderState | SVGRenderState> {
  return {
    latestValues: makeLatestValues(props, context, presence, isSVG),
    renderState: isSVG ? createSVGRenderState() : createHTMLRenderState(),
  };
}

type StyleRecord = Record<string, string | number>;

/** Solid writes styles with `setProperty`, which only accepts kebab-case. */
const toCSSPropertyName = (key: string) => (key.startsWith("--") ? key : camelToDash(key));

const isKebabCase = (key: string) => key.includes("-") && !key.startsWith("--");

/**
 * `style` with kebab-case keys in camelCase, the form motion-dom keys
 * everything by (value types, scale correctors, forced motion values).
 * `-webkit-x` becomes `WebkitX`, which `camelToDash` turns back. Returns
 * `style` itself when no key needs it.
 */
export function camelCaseStyle(style: unknown) {
  if (!style || typeof style !== "object") return style;
  const record = style as Record<string, unknown>;
  if (!Object.keys(record).some(isKebabCase)) return style;
  const output: Record<string, unknown> = {};
  for (const key in record) {
    const name = isKebabCase(key)
      ? key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
      : key;
    output[name] = record[key];
  }
  return output;
}

/**
 * Plain (non motion value) entries of the camelCase `style` prop. Motion
 * owns the values it renders itself (motion values, transforms and, with
 * layout, scale-corrected styles), so those are left out.
 */
export function rawStyles(props: MotionNodeOptions & { style?: unknown }) {
  const style = props.style as Record<string, unknown> | undefined;
  const output: StyleRecord = {};
  if (!style) return output;

  for (const key in style) {
    const value = style[key];
    if (value == null || isMotionValue(value)) continue;
    if (isForcedMotionValue(key, props)) continue;
    output[toCSSPropertyName(key)] = value as string | number;
  }
  return output;
}

/**
 * The first render's styles (and SVG attributes), built from the initial
 * latest values. Motion renders every later change to the element directly.
 */
export function buildInitialRender(
  latestValues: ResolvedValues,
  props: MotionNodeOptions & { style?: unknown },
  component: unknown,
  isSVG: boolean,
) {
  const style: StyleRecord = {};
  const attrs: Record<string, string | number> = {};

  if (isSVG) {
    const state = createSVGRenderState();
    buildSVGAttrs(
      state,
      latestValues,
      isSVGTag(component),
      props.transformTemplate,
      props.style as never,
    );
    for (const key in state.attrs) {
      const name = camelCaseAttributes.has(key) ? key : camelToDash(key);
      attrs[name] = state.attrs[key] as string | number;
    }
    for (const key in state.style) {
      style[toCSSPropertyName(key)] = state.style[key] as string | number;
    }
  } else {
    const state = createHTMLRenderState();
    buildHTMLStyles(state, latestValues, props.transformTemplate);
    for (const key in state.style) {
      style[toCSSPropertyName(key)] = state.style[key] as string | number;
    }
    Object.assign(style, state.vars);
  }

  return { style, attrs };
}
