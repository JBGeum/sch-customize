/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// 빌드 결과 dist/ 는 자기완결 Foundry 모듈이다.
// - src/module.ts → dist/module.js (ESM 번들, jszip 포함)
// - src/styles/main.scss → dist/module.css
// - public/ 전체(module.json, languages, template, packs)는 그대로 dist/ 로 복사
export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: "src/module.ts",
      formats: ["es"],
      fileName: () => "module.js",
    },
    rollupOptions: {
      output: { assetFileNames: "module.css" },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
});
