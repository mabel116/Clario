import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.agents/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
