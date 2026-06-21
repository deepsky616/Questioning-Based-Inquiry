import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// 404 — 존재하지 않는 경로 안내
export default function NotFound() {
  const t = useTranslations("appShell");
  const tc = useTranslations("common");
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-background">
      <div className="text-6xl font-black text-primary">404</div>
      <div>
        <h2 className="text-xl font-bold text-foreground">{t("notFoundTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("notFoundDesc")}</p>
      </div>
      <Link href="/">
        <Button>{tc("home")}</Button>
      </Link>
    </div>
  );
}
