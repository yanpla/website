// @ts-check
import { defineConfig, envField, svgoOptimizer } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",

  env: {
    schema: {
      // A permissionless fine-grained PAT, required: it lifts the API rate
      // limit from 60/hour (shared per server IP) to 5000/hour
      GITHUB_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // Development API keys from developer.riotgames.com expire every 24h;
      // a personal/production key does not
      RIOT_API_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // Free key from https://steamcommunity.com/dev/apikey
      STEAM_API_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },

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
