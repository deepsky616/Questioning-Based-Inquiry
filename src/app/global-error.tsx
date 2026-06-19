"use client";

// 루트 레이아웃에서 발생한 예외 경계 — 자체 html/body를 렌더해야 한다.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", textAlign: "center", padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontSize: "3rem" }}>😵</div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>문제가 발생했어요</h2>
          <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>잠시 후 다시 시도해 주세요.</p>
          <button
            onClick={() => reset()}
            style={{ borderRadius: "0.375rem", background: "#4f46e5", color: "white", padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 600 }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
