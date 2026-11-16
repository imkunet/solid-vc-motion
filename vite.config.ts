import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // Compiles the tests' JSX. The library itself is plain TypeScript.
  plugins: [solid()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  fmt: {
    ignorePatterns: [".reference/**", "dist/**", "**/node_modules/**"],
  },
  lint: {
    ignorePatterns: [".reference/**", "dist/**", "**/node_modules/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  pack: {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    platform: "neutral",
  },
});
