import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  // Shares the Solid playground's stylesheet.
  server: { port: 5174, fs: { allow: [".."] } },
});
