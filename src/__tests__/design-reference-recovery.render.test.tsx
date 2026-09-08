// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { DesignReferenceView } from "@/components/shared/DesignReferenceView";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("원문과 같은 쉬운 설명은 반복하지 않고 서로 다른 설명은 보존한다", () => {
  render(<NextIntlClientProvider locale="ko" messages={ko}><DesignReferenceView data={{ coreIdea: "자료를 비교해요.", coreSentences: ["여러 유물을 살펴봐요."], learningGuides: { coreIdea: { explanation: "자료를 비교해요.", lifeConnection: "박물관을 떠올려요.", keywords: [] }, coreSentences: [{ index: 0, explanation: "물건 여러 개를 나란히 보고 다른 점을 찾아요." }], essentialQuestions: [] } }} /></NextIntlClientProvider>);
  expect(screen.getAllByText("자료를 비교해요.")).toHaveLength(1);
  expect(screen.getByText("박물관을 떠올려요.")).toBeInTheDocument();
  expect(screen.getByText("물건 여러 개를 나란히 보고 다른 점을 찾아요.")).toBeInTheDocument();
});
it("참고 자료 번역 실패 시 원문을 유지하며 재시도로 번역을 복구한다", async () => {
  let failed = true;
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(failed ? {} : { context: { coreIdea: "Compare the evidence." } }), { status: failed ? 503 : 200 }));
  render(<NextIntlClientProvider locale="en" messages={en}><DesignReferenceView sourceSessionId="s1" data={{ coreIdea: "자료를 비교해요." }} /></NextIntlClientProvider>);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByText("자료를 비교해요.")).toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: en.translate.retry }));
  expect(await screen.findByText("Compare the evidence.")).toBeInTheDocument();
});
