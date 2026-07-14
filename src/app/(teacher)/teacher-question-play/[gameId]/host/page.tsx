"use client";

import { use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { QuestionGameRoomFlow } from "@/components/question-games/QuestionGameRoomFlow";
import {
  BUILT_IN_GAMES,
  localizeBuiltInGame,
} from "@/lib/question-games-data";

export default function TeacherQuestionGameHostPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const user = session?.user as { id?: string; role?: string } | undefined;
  const baseGame = BUILT_IN_GAMES.find(({ id }) => id === gameId);
  const game = baseGame ? localizeBuiltInGame(baseGame, locale) : null;
  const exit = () => router.push("/teacher-question-play");

  if (status === "loading") {
    return <p role="status" className="py-16 text-center text-sm text-muted-foreground">{t("creatingRoom")}</p>;
  }

  if (!game || user?.role !== "TEACHER" || !user.id) {
    return (
      <div className="mx-auto max-w-lg border-y border-border py-12 text-center">
        <p className="font-semibold text-foreground">{t("notFound")}</p>
        <button type="button" onClick={exit} className="mt-4 text-sm text-primary hover:underline">
          {t("backToList")}
        </button>
      </div>
    );
  }

  return (
    <QuestionGameRoomFlow
      game={game}
      myId={user.id}
      allowJoin={false}
      onExit={exit}
    />
  );
}
