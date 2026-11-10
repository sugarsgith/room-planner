import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the same build works at
// https://sugarsgith.github.io/room-planner/ and at a Cloudflare Pages root.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifestFilename: "manifest.webmanifest",
      includeAssets: ["favicon-32.png", "apple-touch-icon.png", "icon.svg"],
      manifest: {
        name: "部屋プランナー",
        short_name: "部屋プランナー",
        description: "自分の部屋を実寸で再現して家具配置を検討するツール",
        start_url: "./",
        scope: "./",
        display: "standalone",
        lang: "ja",
        theme_color: "#f4f0e8",
        background_color: "#f4f0e8",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,ico}"],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: "index.html",
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
