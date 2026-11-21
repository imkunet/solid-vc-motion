const motionPropNames = new Set([
  "animate",
  "exit",
  "variants",
  "initial",
  "style",
  "values",
  "transition",
  "transformTemplate",
  "custom",
  "inherit",
  "onBeforeLayoutMeasure",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onHoverStart",
  "onHoverEnd",
  "globalTapTarget",
  "onViewportEnter",
  "onViewportLeave",
  "tap",
  "propagate",
  "ignoreStrict",
  "viewport",
  "pinch",
]);

/** Whether a prop is consumed by Motion rather than the rendered element. */
export function isValidMotionProp(key: string) {
  return (
    key.startsWith("while") ||
    (key.startsWith("drag") && key !== "draggable") ||
    key.startsWith("layout") ||
    key.startsWith("onTap") ||
    key.startsWith("onPan") ||
    key.startsWith("onLayout") ||
    motionPropNames.has(key)
  );
}

const lowercaseSVGElements = new Set([
  "animate",
  "circle",
  "defs",
  "desc",
  "ellipse",
  "g",
  "image",
  "line",
  "filter",
  "marker",
  "mask",
  "metadata",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "rect",
  "stop",
  "switch",
  "symbol",
  "svg",
  "text",
  "tspan",
  "use",
  "view",
]);

export function isSVGComponent(component: unknown) {
  if (typeof component !== "string" || component.includes("-")) return false;
  return lowercaseSVGElements.has(component) || /[A-Z]/u.test(component);
}
