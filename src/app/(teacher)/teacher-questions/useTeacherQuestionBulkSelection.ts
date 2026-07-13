"use client";

import { useCallback, useRef, useState } from "react";

export function useTeacherQuestionBulkSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionRevisionRef = useRef(0);

  const clearSelectedIds = useCallback(() => {
    selectionRevisionRef.current += 1;
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    selectionRevisionRef.current += 1;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((items: Array<{ id: string }>) => {
    selectionRevisionRef.current += 1;
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, []);

  return { clearSelectedIds, selectedIds, selectionRevisionRef, selectAll, toggleSelect };
}
