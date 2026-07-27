"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock3,
  LoaderCircle,
  RotateCcw,
  ShieldX,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type LaunchState =
  | "loading"
  | "missing"
  | "expired"
  | "invalid"
  | "offline";

const stateContent = {
  loading: {
    title: "김질문 학생 화면을 준비하고 있어요",
    description: "잠시만 기다려 주세요.",
    icon: LoaderCircle,
  },
  missing: {
    title: "실행 권한을 확인할 수 없습니다",
    description: "USB의 program 폴더에 있는 index.html을 다시 열어 주세요.",
    icon: ShieldX,
  },
  expired: {
    title: "사용 기간이 끝났습니다",
    description: "새로 받은 질문연구소 실행 파일을 사용해 주세요.",
    icon: Clock3,
  },
  invalid: {
    title: "실행 권한을 확인할 수 없습니다",
    description: "제출용 실행 파일이 맞는지 확인한 뒤 다시 시도해 주세요.",
    icon: ShieldX,
  },
  offline: {
    title: "인터넷 연결을 확인해 주세요",
    description: "연결을 확인한 뒤 이 화면에서 다시 시도할 수 있어요.",
    icon: WifiOff,
  },
} satisfies Record<
  LaunchState,
  { title: string; description: string; icon: typeof LoaderCircle }
>;

function failureState(reason: unknown): LaunchState {
  if (reason === "expired") return "expired";
  if (reason === "missing") return "missing";
  return "invalid";
}

export function DemoLaunchClient() {
  const router = useRouter();
  const [state, setState] = useState<LaunchState>("loading");
  const ticketRef = useRef("");
  const startedRef = useRef(false);

  const launch = useCallback(async () => {
    const ticket = ticketRef.current;
    if (!ticket) {
      setState("missing");
      return;
    }

    setState("loading");
    try {
      const validationResponse = await fetch("/api/demo/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket }),
      });
      const validationBody = await validationResponse
        .json()
        .catch(() => null) as { ok?: boolean; reason?: string } | null;
      if (!validationResponse.ok || !validationBody?.ok) {
        setState(failureState(validationBody?.reason));
        return;
      }

      const result = await signIn("demo-launch", {
        ticket,
        redirect: false,
      });
      if (result?.error) {
        setState("invalid");
        return;
      }
      router.replace("/student-dashboard");
      router.refresh();
    } catch {
      setState("offline");
    }
  }, [router]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    ticketRef.current = params.get("ticket") ?? "";
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    void launch();
  }, [launch]);

  const content = stateContent[state];
  const StatusIcon = content.icon;
  const canRetry = state === "offline" || state === "invalid";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-5 py-10 text-white">
      <Image
        src="/login-inquiry-hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-45"
      />
      <div className="absolute inset-0 bg-black/45" aria-hidden />

      <section className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
        <p className="text-sm font-semibold text-violet-200">질문기반 탐구수업</p>
        <h1 className="mt-2 text-4xl font-bold tracking-normal sm:text-5xl">
          질문연구소
        </h1>

        <div
          role="status"
          aria-live="polite"
          className="mt-10 flex min-h-40 w-full flex-col items-center justify-center border-y border-white/25 py-7"
        >
          <StatusIcon
            className={`h-9 w-9 ${
              state === "loading" ? "animate-spin text-violet-200" : "text-white"
            }`}
            aria-hidden
          />
          <h2 className="mt-4 text-xl font-semibold sm:text-2xl">
            {content.title}
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-200 sm:text-base">
            {content.description}
          </p>
        </div>

        {canRetry && (
          <Button
            type="button"
            variant="secondary"
            className="mt-7 min-h-11 gap-2 px-5"
            onClick={() => void launch()}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            다시 시도
          </Button>
        )}
      </section>
    </main>
  );
}
