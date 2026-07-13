// @ts-check
import { defineConfig, svgoOptimizer } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",

  vite: {
    plugins: [tailwindcss()],
  },

  experimental: {
    svgOptimizer: svgoOptimizer(),
  },

  adapter: node({
    mode: "standalone",
  }),
});