"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export default function DatePicker({ value, onChange, placeholder = "날짜 선택" }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = value ? new Date(value + "T00:00:00") : undefined;

  const displayLabel = selected
    ? `${selected.getFullYear()}년 ${selected.getMonth() + 1}월 ${selected.getDate()}일`
    : placeholder;

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
          className={`h-8 justify-start text-left text-sm font-normal ${!value ? "text-gray-400" : ""}`}
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
              className="text-xs text-gray-400 hover:text-gray-600"
              onClick={() => { onChange(""); setOpen(false); }}
            >
              선택 초기화
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
