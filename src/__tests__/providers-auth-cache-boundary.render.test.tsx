// @vitest-environment jsdom

import { useEffect, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  session: { user: { id: "teacher-1" } } as { user: { id: string } } | null,
  status: "authenticated" as "authenticated" | "unauthenticated" | "loading",
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ data: authState.session, status: authState.status }),
}));

vi.mock("@/components/shared/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));

import { Providers } from "@/components/shared/providers";

function QueryClientProbe({ onClient }: { onClient: (client: QueryClient) => void }) {
  const queryClient = useQueryClient();
  useEffect(() => onClient(queryClient), [onClient, queryClient]);
  return null;
}

function PrivateValueProbe() {
  const privateValueQuery = useQuery({
    queryKey: ["private-value"],
    queryFn: async () => authState.session?.user.id ?? "signed-out",
  });
  return <p>{privateValueQuery.data ?? "loading"}</p>;
}

describe("인증 사용자별 조회 캐시 경계", () => {
  beforeEach(() => {
    authState.session = { user: { id: "teacher-1" } };
    authState.status = "authenticated";
  });

  it("인증 사용자 식별값이 바뀌면 알림을 포함한 모든 기존 캐시를 비운다", async () => {
    let renderedClient: QueryClient | undefined;
    const captureClient = (queryClient: QueryClient) => {
      renderedClient = queryClient;
    };
    const view = render(
      <Providers>
        <QueryClientProbe onClient={captureClient} />
        <PrivateValueProbe />
      </Providers>,
    );

    await waitFor(() => expect(renderedClient).toBeDefined());
    expect(await screen.findByText("teacher-1")).toBeInTheDocument();
    act(() => {
      renderedClient?.setQueryData(["app-notifications", "teacher"], [{ id: "private-alert" }]);
      renderedClient?.setQueryData(["teacher-students", "directory"], [{ id: "private-student" }]);
    });

    authState.session = { user: { id: "teacher-2" } };
    view.rerender(
      <Providers>
        <QueryClientProbe onClient={captureClient} />
        <PrivateValueProbe />
      </Providers>,
    );

    expect(await screen.findByText("teacher-2")).toBeInTheDocument();
    expect(screen.queryByText("teacher-1")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(renderedClient?.getQueryData(["app-notifications", "teacher"])).toBeUndefined();
      expect(renderedClient?.getQueryData(["teacher-students", "directory"])).toBeUndefined();
    });
  });
});
