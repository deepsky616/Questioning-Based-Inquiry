"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuestionGrowthEditor, type GrowthProtection } from "./QuestionGrowthEditor";

export function QuestionGrowthDialog({ questionId, onClose }: { questionId: string | null; onClose: () => void }) {
  const t = useTranslations("growth");
  const [protection, setProtection] = useState<GrowthProtection>({ dirty: false, protected: false, saving: false });
  return <Dialog open={Boolean(questionId)} onOpenChange={open => {
    if (open || protection.saving) return;
    if (protection.dirty && !protection.protected && !window.confirm(t("draftLeave"))) return;
    onClose();
  }}>
    <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-3xl">
      <DialogHeader><DialogTitle>{t("title")}</DialogTitle><DialogDescription>{t("editorDescription")}</DialogDescription></DialogHeader>
      {questionId && <QuestionGrowthEditor key={questionId} questionId={questionId} onProtectionChange={setProtection} />}
    </DialogContent>
  </Dialog>;
}
