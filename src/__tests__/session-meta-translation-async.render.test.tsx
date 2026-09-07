// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionMetaTranslation } from "@/components/shared/use-session-meta-translation";
import { CurrentUserIdentityProvider } from "@/components/shared/current-user-identity";

const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next-intl", () => ({ useLocale: () => state.locale, useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

function Probe({ topic = "날씨", name = "label" }: {topic?: string; name?: string}) {
  const session = {id:"s1",date:"2026-09-06",subject:"과학",topic};
  const text = useSessionMetaTranslation([session]);
  return <span data-testid={name}>{text.label(session)}</span>;
}

function response(topic = "Weather") {
  return {ok:true,json:async()=>({translations:{"SESSION_SUBJECT:s1":"Science","SESSION_TOPIC:s1":topic}})};
}
let client: QueryClient;
function wrap(children: React.ReactNode) {
  return <QueryClientProvider client={client}><CurrentUserIdentityProvider userId="translation-test">{children}</CurrentUserIdentityProvider></QueryClientProvider>;
}

afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
beforeEach(() => { state.locale="en"; client=new QueryClient({defaultOptions:{queries:{retry:false}}}); });

describe("수업 내용의 비동기 영어 번역", () => {
  it("응답을 기다리는 동안 화면이 다시 그려져도 중복 요청 없이 번역을 반영한다", async () => {
    let complete!: (value: ReturnType<typeof response>) => void;
    const fetchMock=vi.fn(()=>new Promise(resolve=>{complete=resolve;}));
    vi.stubGlobal("fetch",fetchMock);
    const view=render(wrap(<Probe/>));
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(wrap(<Probe/>));
    view.rerender(wrap(<Probe/>));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    complete(response());
    await expect(screen.findByText("2026-09-06 · Science · Weather")).resolves.toBeVisible();
  });

  it("여러 위치에서 같은 수업을 보여도 한 번만 번역한다", async () => {
    const fetchMock=vi.fn(async()=>response());
    vi.stubGlobal("fetch",fetchMock);
    render(wrap(<><Probe name="first"/><Probe name="second"/></>));
    await waitFor(()=>expect(screen.getByTestId("first")).toHaveTextContent("Weather"));
    expect(screen.getByTestId("second")).toHaveTextContent("Weather");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("같은 수업의 주제가 수정되면 이전 번역 대신 새 번역을 보여준다", async () => {
    const fetchMock=vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response("Water"));
    vi.stubGlobal("fetch",fetchMock);
    const view=render(wrap(<Probe/>));
    await screen.findByText("2026-09-06 · Science · Weather");
    view.rerender(wrap(<Probe topic="물"/>));
    await screen.findByText("2026-09-06 · Science · Water");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("영어 응답이 늦게 도착해도 한국어로 돌아온 화면에는 원문을 유지한다", async () => {
    let complete!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal("fetch",vi.fn(()=>new Promise(resolve=>{complete=resolve;})));
    const view=render(wrap(<Probe/>));
    await waitFor(()=>expect(complete).toBeDefined());
    state.locale="ko";
    view.rerender(wrap(<Probe/>));
    complete(response());
    await waitFor(()=>expect(screen.getByTestId("label")).toHaveTextContent("2026-09-06 · 과학 · 날씨"));
  });
});
