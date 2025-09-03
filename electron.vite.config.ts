import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@": resolve("src/renderer/src"),
        "@/shared": resolve("src/renderer/src/shared"),
        "@/entities": resolve("src/renderer/src/entities"),
        "@/features": resolve("src/renderer/src/features"),
        "@/app": resolve("src/renderer/src/app"),
      },
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => ["r-grid", "r-cell"].includes(tag),
          },
        },
      }),
    ],
  },
});
