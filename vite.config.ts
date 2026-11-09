import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Relative base so the same build works at
// https://sugarsgith.github.io/room-planner/ and at a Cloudflare Pages root.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
