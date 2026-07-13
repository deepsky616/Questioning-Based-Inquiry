"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmProvider } from "@/components/shared/confirm-dialog";

function AuthQueryCacheBoundary({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const resolvedUserId = status === "loading"
    ? undefined
    : status === "authenticated"
      ? session?.user?.id ?? null
      : null;
  const [cacheUserId, setCacheUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (resolvedUserId === undefined) return;
    if (cacheUserId !== undefined && cacheUserId !== resolvedUserId) {
      queryClient.clear();
    }
    if (cacheUserId !== resolvedUserId) setCacheUserId(resolvedUserId);
  }, [cacheUserId, queryClient, resolvedUserId]);

  if (
    resolvedUserId !== undefined &&
    cacheUserId !== undefined &&
    resolvedUserId !== cacheUserId
  ) {
    return null;
  }

  return children;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <AuthQueryCacheBoundary>
            <ConfirmProvider>
              {children}
              <Toaster />
            </ConfirmProvider>
          </AuthQueryCacheBoundary>
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
