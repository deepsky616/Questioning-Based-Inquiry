import type { Metadata } from "next";
import { DemoLaunchClient } from "./DemoLaunchClient";

export const metadata: Metadata = {
  title: "질문연구소 시연 실행",
  description: "학생1의 질문연구소 시연 화면을 엽니다.",
};

export default function DemoLaunchPage() {
  return <DemoLaunchClient />;
}
