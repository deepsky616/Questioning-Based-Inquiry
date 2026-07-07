import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // 렌더 테스트(*.render.test.tsx)의 JSX 변환
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    exclude: ["node_modules", "e2e/**"],
    // 컴포넌트 렌더 테스트는 파일 상단의 `// @vitest-environment jsdom` 지시어로 jsdom에서 실행
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
