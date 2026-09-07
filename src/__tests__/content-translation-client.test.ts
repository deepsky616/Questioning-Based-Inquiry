import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentTranslationError, requestContentTranslations } from "@/lib/content-translation-client";

afterEach(()=>vi.unstubAllGlobals());

describe("번역 요청 묶음 처리", () => {
  it("여러 화면의 요청을 합치고 40개 한도를 지킨다", async () => {
    const sizes: number[]=[];
    const fetchMock=vi.fn(async (_url: string, init: RequestInit)=>{
      const {items}=JSON.parse(init.body as string) as {items:{type:string;id:string}[]};
      sizes.push(items.length);
      return {ok:true,json:async()=>({translations:Object.fromEntries(items.map(item=>[`${item.type}:${item.id}`,`Translated ${item.id}`]))})};
    });
    vi.stubGlobal("fetch",fetchMock);
    const scope={};
    const items=Array.from({length:83},(_,index)=>({type:"SESSION_TOPIC" as const,id:`s${index}`}));
    const results=await Promise.all(items.map(item=>requestContentTranslations(scope,"u1","en",[item])));
    expect(sizes).toEqual([40,40,3]);
    expect(results[82]).toEqual({"SESSION_TOPIC:s82":"Translated s82"});
  });

  it("한도 오류가 나면 나머지를 계속 요청하지 않고 재시도할 수 있다", async () => {
    const fetchMock=vi.fn().mockResolvedValue({ok:false,status:429});
    vi.stubGlobal("fetch",fetchMock);
    const scope={};
    const items=Array.from({length:41},(_,index)=>({type:"SESSION_TOPIC" as const,id:`s${index}`}));
    await expect(requestContentTranslations(scope,"u1","en",items)).rejects.toBeInstanceOf(ContentTranslationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue({ok:true,json:async()=>({translations:{"SESSION_TOPIC:s0":"Weather"}})});
    await expect(requestContentTranslations(scope,"u1","en",[items[0]])).resolves.toEqual({"SESSION_TOPIC:s0":"Weather"});
  });

  it("서로 다른 사용자의 요청을 합치지 않는다", async () => {
    const fetchMock=vi.fn(async()=>({ok:true,json:async()=>({translations:{"SESSION_TOPIC:s1":"Weather"}})}));
    vi.stubGlobal("fetch",fetchMock);
    const scope={};
    const items=[{type:"SESSION_TOPIC" as const,id:"s1"}];
    await Promise.all([requestContentTranslations(scope,"u1","en",items),requestContentTranslations(scope,"u2","en",items)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
