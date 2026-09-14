"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PresentationHeader({ title, description, closeLabel }: { title: ReactNode; description: ReactNode; closeLabel: string }) {
  return (
    <DialogHeader className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 space-y-0 text-left">
      <DialogTitle className="min-w-0 text-lg leading-snug sm:text-xl">{title}</DialogTitle>
      <DialogClose asChild>
        <Button type="button" variant="outline" className="min-h-11 whitespace-nowrap">{closeLabel}</Button>
      </DialogClose>
      <DialogDescription className="col-span-2">{description}</DialogDescription>
    </DialogHeader>
  );
}
