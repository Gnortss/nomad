import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "client",
    include: ["test/client/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
  },
});
