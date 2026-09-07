"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/shared/theme-provider";

export function ThemeToggle() {
  const t = useTranslations("chrome");
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      aria-label={isDark ? t("themeLightAria") : t("themeDarkAria")}
      title={isDark ? t("themeLight") : t("themeDark")}
      className="gap-2 text-base font-medium"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden sm:inline">{isDark ? t("themeLight") : t("themeDark")}</span>
    </Button>
  );
}
