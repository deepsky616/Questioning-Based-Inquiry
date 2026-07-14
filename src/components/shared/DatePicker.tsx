"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatDateOnly } from "@/lib/datetime";

export default function DatePicker({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useTranslations("chrome");
  const [open, setOpen] = useState(false);

  const selected = value ? new Date(value + "T00:00:00") : undefined;

  const displayLabel = selected
    ? formatDateOnly(selected)
    : (placeholder ?? t("pickDate"));

  const handleSelect = (date: Date | undefined) => {
    if (!date) { onChange(""); setOpen(false); return; }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-8 w-full justify-start text-left text-sm font-normal ${!value ? "text-muted-foreground" : ""}`}
        >
          📅 {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected ?? new Date()}
        />
        {value && (
          <div className="border-t px-3 py-2">
            <button
              className="text-xs text-muted-foreground hover:text-muted-foreground"
              onClick={() => { onChange(""); setOpen(false); }}
            >
              {t("clearDate")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
