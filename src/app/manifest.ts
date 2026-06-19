import type { MetadataRoute } from "next";

// PWA 매니페스트 — 태블릿/모바일에서 홈 화면 설치 및 앱처럼 실행
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Question Lab - 질문기반 탐구수업",
    short_name: "Question Lab",
    description: "학생들의 질문을 분석하고 효과적인 질문 작성 능력을 길러주는 웹앱",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7C3AED",
    lang: "ko",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
