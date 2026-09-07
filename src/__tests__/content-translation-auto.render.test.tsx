// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { CurrentUserIdentityProvider } from "@/components/shared/current-user-identity";

const state=vi.hoisted(()=>({locale:"en"}));
vi.mock("next-intl",()=>({useLocale:()=>state.locale,useTranslations:()=>(key:string)=>key}));
vi.mock("@/components/ui/use-toast",()=>({toast:vi.fn()}));
let client: QueryClient;
function Probe({content="왜 구름이 생길까요?"}:{content?:string}) {
  const item={type:"QUESTION" as const,id:"q1",original:content};
  const ct=useContentTranslation([item]);
  return <><p>{ct.text(item,content)}</p><button onClick={()=>void ct.toggle(item)}>원문 전환</button><button onClick={ct.showAllOriginal}>모두 원문</button><button onClick={()=>void ct.translateAll([item])}>모두 번역</button></>;
}
function wrap(children:React.ReactNode,userId="u1") {
  return <QueryClientProvider client={client}><CurrentUserIdentityProvider userId={userId}>{children}</CurrentUserIdentityProvider></QueryClientProvider>;
}
beforeEach(()=>{state.locale="en";client=new QueryClient({defaultOptions:{queries:{retry:false}}});});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();});
const response=(text:string)=>({ok:true,json:async()=>({translations:{"QUESTION:q1":text}})});

describe("질문·댓글의 자동 번역과 원문 선택",()=>{
  it("영어 화면에서 자동 번역하고 원문 보기 선택을 다시 그린 뒤에도 유지한다",async()=>{
    const fetchMock=vi.fn(async()=>response("Why do clouds form?"));vi.stubGlobal("fetch",fetchMock);
    const view=render(wrap(<Probe/>));
    await screen.findByText("Why do clouds form?");
    fireEvent.click(screen.getByText("원문 전환"));
    expect(screen.getByText("왜 구름이 생길까요?")).toBeVisible();
    view.rerender(wrap(<Probe/>));
    expect(screen.getByText("왜 구름이 생길까요?")).toBeVisible();
    fireEvent.click(screen.getByText("모두 번역"));
    await screen.findByText("Why do clouds form?");
    fireEvent.click(screen.getByText("모두 원문"));
    expect(screen.getByText("왜 구름이 생길까요?")).toBeVisible();
    fireEvent.click(screen.getByText("원문 전환"));
    await screen.findByText("Why do clouds form?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("질문을 수정하거나 사용자가 바뀌면 기존 번역을 그대로 재사용하지 않는다",async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce(response("Why do clouds form?")).mockResolvedValueOnce(response("Why does it rain?")).mockResolvedValueOnce(response("New user's translation"));
    vi.stubGlobal("fetch",fetchMock);
    const view=render(wrap(<Probe/>));
    await screen.findByText("Why do clouds form?");
    view.rerender(wrap(<Probe content="왜 비가 내릴까요?"/>));
    await screen.findByText("Why does it rain?");
    view.rerender(wrap(<Probe content="왜 비가 내릴까요?"/>,"u2"));
    await screen.findByText("New user's translation");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("한국어에서는 번역 요청 없이 원문을 표시한다",async()=>{
    state.locale="ko";
    const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
    render(wrap(<Probe/>));
    fireEvent.click(screen.getByText("모두 번역"));
    await waitFor(()=>expect(screen.getByText("왜 구름이 생길까요?")).toBeVisible());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("번역 실패 후 모두 번역을 누르면 다시 시도한다",async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce({ok:false,status:503}).mockResolvedValueOnce(response("Why do clouds form?"));
    vi.stubGlobal("fetch",fetchMock);
    render(wrap(<Probe/>));
    await waitFor(()=>expect(client.getQueryCache().getAll()[0]?.state.status).toBe("error"));
    fireEvent.click(screen.getByText("모두 번역"));
    await screen.findByText("Why do clouds form?");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
