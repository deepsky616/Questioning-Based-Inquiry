"use client";

// shadcn/ui 패턴의 경량 토스트 스토어 (외부 의존 없음)
import * as React from "react";
import type { ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;

type ToasterToast = Omit<ToastProps, "title"> & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };
const listeners: ((state: State) => void)[] = [];
let memoryState: State = { toasts: [] };
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

function setState(next: State) {
  memoryState = next;
  listeners.forEach((l) => l(memoryState));
}

function scheduleRemove(id: string) {
  if (timeouts.has(id)) return;
  const t = setTimeout(() => {
    timeouts.delete(id);
    setState({ toasts: memoryState.toasts.filter((x) => x.id !== id) });
  }, TOAST_REMOVE_DELAY);
  timeouts.set(id, t);
}

export interface ToastInput {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastProps["variant"];
  duration?: number;
}

function toast(input: ToastInput) {
  const id = genId();
  const dismiss = () => setState({ toasts: memoryState.toasts.filter((x) => x.id !== id) });

  const t: ToasterToast = {
    ...input,
    id,
    open: true,
    onOpenChange: (open) => { if (!open) dismiss(); },
  };
  setState({ toasts: [t, ...memoryState.toasts].slice(0, TOAST_LIMIT) });
  scheduleRemove(id);
  return { id, dismiss };
}

function useToast() {
  const [state, setLocal] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setLocal);
    return () => {
      const i = listeners.indexOf(setLocal);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);
  return {
    toasts: state.toasts,
    toast,
    dismiss: (id: string) => setState({ toasts: memoryState.toasts.filter((x) => x.id !== id) }),
  };
}

export { useToast, toast };
