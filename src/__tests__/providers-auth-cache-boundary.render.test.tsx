// @vitest-environment jsdom

import { useEffect, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  pathname: "/teacher-dashboard",
  providerMount: vi.fn(),
  session: { user: { id: "teacher-1" } } as { user: { id: string } } | null,
  status: "authenticated" as "authenticated" | "unauthenticated" | "loading",
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => {
    authState.providerMount();
    return children;
  },
  useSession: () => ({ data: authState.session, status: authState.status }),
}));

vi.mock("next/navigation", () => ({ usePathname: () => authState.pathname }));

vi.mock("@/components/shared/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
  PublicThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));

import { Providers } from "@/components/shared/providers";
import { useCurrentUserIdentity } from "@/components/shared/current-user-identity";

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

function CurrentUserIdentityProbe() {
  const userId = useCurrentUserIdentity();
  return <p data-testid="current-user-identity">{userId ?? "none"}</p>;
}

describe("인증 사용자별 조회 캐시 경계", () => {
  beforeEach(() => {
    authState.pathname = "/teacher-dashboard";
    authState.providerMount.mockClear();
    authState.session = { user: { id: "teacher-1" } };
    authState.status = "authenticated";
  });

  it.each(["/login", "/register", "/forgot-password", "/reset-password"])(
    "renders %s without mounting the session provider", (pathname) => {
      authState.pathname = pathname;
      const view = render(<Providers><p>Public screen</p></Providers>);
      expect(view.getByText("Public screen")).toBeInTheDocument();
      expect(authState.providerMount).not.toHaveBeenCalled();
      view.unmount();
    },
  );

  it.each(["/teacher-dashboard", "/student-dashboard", "/demo/launch"])(
    "mounts session support on %s", (pathname) => {
      authState.pathname = pathname;
      const view = render(<Providers><CurrentUserIdentityProbe /></Providers>);
      expect(authState.providerMount).toHaveBeenCalled();
      expect(view.getByTestId("current-user-identity")).toHaveTextContent("teacher-1");
      view.unmount();
    },
  );

  it("discards private caches across a login page transition", async () => {
    let client: QueryClient | undefined;
    const capture = (value: QueryClient) => { client = value; };
    const view = render(<Providers><QueryClientProbe onClient={capture} /></Providers>);
    await waitFor(() => expect(client).toBeDefined());
    const oldClient = client!;
    oldClient.setQueryData(["private"], "teacher-1-data");

    authState.pathname = "/login";
    view.rerender(<Providers><p>Login</p></Providers>);
    authState.pathname = "/student-dashboard";
    authState.session = { user: { id: "student-2" } };
    view.rerender(<Providers><QueryClientProbe onClient={capture} /><CurrentUserIdentityProbe /></Providers>);

    await waitFor(() => expect(client).not.toBe(oldClient));
    expect(client?.getQueryData(["private"])).toBeUndefined();
    expect(view.getByTestId("current-user-identity")).toHaveTextContent("student-2");
    view.unmount();
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
        <CurrentUserIdentityProbe />
      </Providers>,
    );

    await waitFor(() => expect(renderedClient).toBeDefined());
    expect(await screen.findByText("teacher-1")).toBeInTheDocument();
    expect(screen.getByTestId("current-user-identity")).toHaveTextContent("teacher-1");
    act(() => {
      renderedClient?.setQueryData(["app-notifications", "teacher"], [{ id: "private-alert" }]);
      renderedClient?.setQueryData(["teacher-students", "directory"], [{ id: "private-student" }]);
    });

    authState.session = { user: { id: "teacher-2" } };
    view.rerender(
      <Providers>
        <QueryClientProbe onClient={captureClient} />
        <PrivateValueProbe />
        <CurrentUserIdentityProbe />
      </Providers>,
    );

    expect(await screen.findByText("teacher-2")).toBeInTheDocument();
    expect(screen.getByTestId("current-user-identity")).toHaveTextContent("teacher-2");
    expect(screen.queryByText("teacher-1")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(renderedClient?.getQueryData(["app-notifications", "teacher"])).toBeUndefined();
      expect(renderedClient?.getQueryData(["teacher-students", "directory"])).toBeUndefined();
    });
  });
});
