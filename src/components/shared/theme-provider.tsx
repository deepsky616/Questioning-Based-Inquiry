"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "question-lab-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* 저장소가 제한된 브라우저에서도 기본 테마로 화면을 연다. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark = theme === "dark";
  if (root.classList.contains("dark") === dark) return;
  // 글씨와 배경의 전환 속도가 달라 잠시 대비가 사라지는 것을 방지한다.
  root.classList.add("theme-changing");
  root.classList.toggle("dark", dark);
  void root.offsetHeight;
  root.classList.remove("theme-changing");
}

function isThemeDisabledPath(pathname: string | null) {
  return pathname === "/login";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const initialTheme = getInitialTheme();
    setThemeState(initialTheme);
    applyTheme(isThemeDisabledPath(pathname) ? "light" : initialTheme);
  }, [pathname]);

  useEffect(() => {
    applyTheme(isThemeDisabledPath(pathname) ? "light" : theme);
  }, [pathname, theme]);

  useEffect(() => {
    return () => {
      applyTheme("light");
    };
  }, []);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    try { window.localStorage.setItem(STORAGE_KEY, nextTheme); } catch { /* 저장 실패와 관계없이 테마를 적용한다. */ }
    applyTheme(nextTheme);
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
