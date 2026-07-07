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
    // 커버리지 게이트(--coverage 실행 시) — 실측치 아래로 후퇴하면 실패
    coverage: {
      provider: "v8",
      // 게이트 대상: 단위 테스트가 실질 커버하는 로직 계층(lib + API 라우트)
      include: ["src/lib/**", "src/app/api/**"],
      thresholds: { lines: 40, statements: 40, functions: 45, branches: 35 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
