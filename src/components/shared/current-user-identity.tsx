"use client";

import { createContext, useContext, type ReactNode } from "react";

const CurrentUserIdentityContext = createContext<string | null>(null);

export function CurrentUserIdentityProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  return (
    <CurrentUserIdentityContext.Provider value={userId}>
      {children}
    </CurrentUserIdentityContext.Provider>
  );
}

export function useCurrentUserIdentity(): string | null {
  return useContext(CurrentUserIdentityContext);
}
