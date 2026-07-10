import { useTranslations } from "next-intl";

/**
 * 라우트 전환 로딩 공통 표시.
 * (student)·(teacher) 그룹의 loading.tsx가 이걸 렌더링해야
 * 메뉴 클릭 즉시 피드백이 뜬다(없으면 서버 응답까지 이전 화면이 멈춘 듯 보임).
 */
export function RouteLoading() {
  const t = useTranslations("appShell");
  return (
    <div className="min-h-[50vh] flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="text-sm">{t("loading")}</span>
      </div>
    </div>
  );
}
