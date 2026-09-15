"use client";

import { useLocale } from "next-intl";
import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AiEthicsPromises } from "@/components/shared/AiEthicsLearning";
import { aiEthicsContentForLocale, type AiEthicsContext } from "@/lib/ai-ethics-content";

export function AiEthicsReminder({ context }: { context: AiEthicsContext }) {
  const content = aiEthicsContentForLocale(useLocale());
  return <aside className="my-3 rounded-lg border bg-muted/30 px-3 py-2">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="flex min-w-0 flex-1 basis-52 items-start gap-2 text-sm leading-relaxed text-muted-foreground"><HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />{content.reminders[context]}</p>
      <Dialog>
        <DialogTrigger asChild><Button type="button" variant="link" className="h-auto min-h-11 shrink-0 px-1 text-sm underline underline-offset-4">{content.view}</Button></DialogTrigger>
        <DialogContent showCloseButton={false} className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl p-0">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
            <DialogTitle className="leading-relaxed">{content.reminderTitle}</DialogTitle>
            <DialogClose asChild><Button type="button" variant="outline" className="min-h-11 shrink-0">{content.close}</Button></DialogClose>
          </div>
          <div className="min-h-0 space-y-4 overflow-y-auto p-4">
            <DialogDescription className="text-base leading-relaxed">{content.intro}</DialogDescription>
            <AiEthicsPromises />
          </div>
        </DialogContent>
      </Dialog>
    </div>
    {context === "growth" && <div className="mt-2 space-y-2 border-t pt-3 text-sm leading-relaxed"><p>{content.reflection}</p><p className="text-muted-foreground">{content.reflectionHelp}</p></div>}
  </aside>;
}
