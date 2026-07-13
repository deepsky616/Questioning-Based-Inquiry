"use client";

import { useRef, useState } from "react";
import { Heart } from "lucide-react";

interface LikedByUser {
  id: string;
  name: string;
}

export function TeacherQuestionLikeCount({
  questionId,
  likeCount,
  initialLikedBy,
  likeCountLabel,
  likedByLabel,
}: {
  questionId: string;
  likeCount: number;
  initialLikedBy?: LikedByUser[];
  likeCountLabel: string;
  likedByLabel: string;
}) {
  const [likeList, setLikeList] = useState<{
    forCount: number | null;
    users: LikedByUser[];
  }>({
    forCount: initialLikedBy !== undefined || likeCount === 0 ? likeCount : null,
    users: initialLikedBy ?? [],
  });
  const loadingForCountRef = useRef<number | null>(null);
  const requestVersionRef = useRef(0);
  const listIsCurrent = likeList.forCount === likeCount;

  const loadLikedBy = async () => {
    const requestedLikeCount = likeCount;
    if (
      listIsCurrent ||
      loadingForCountRef.current === requestedLikeCount
    ) return;
    const requestVersion = ++requestVersionRef.current;
    loadingForCountRef.current = requestedLikeCount;
    try {
      const response = await fetch(`/api/questions/${questionId}/likes`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (requestVersionRef.current === requestVersion) {
        setLikeList({
          forCount: requestedLikeCount,
          users: Array.isArray(data?.likedBy) ? data.likedBy : [],
        });
      }
    } catch {
      if (requestVersionRef.current === requestVersion) {
        setLikeList({ forCount: null, users: [] });
      }
    } finally {
      if (loadingForCountRef.current === requestedLikeCount) {
        loadingForCountRef.current = null;
      }
    }
  };

  return (
    <div className="group relative inline-block">
      <button
        type="button"
        onFocus={() => void loadLikedBy()}
        onMouseEnter={() => void loadLikedBy()}
        aria-label={likeCountLabel}
        className="inline-flex items-center gap-1 text-sm font-medium text-rose-500"
      >
        <Heart className="h-4 w-4 fill-current" aria-hidden="true" />
        {likeCount}
      </button>
      {listIsCurrent && likeList.users.length > 0 && (
        <div className="absolute bottom-full left-1/2 z-10 mb-1 hidden w-36 -translate-x-1/2 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-focus-within:block group-hover:block">
          <p className="mb-1 font-semibold">{likedByLabel}</p>
          {likeList.users.map((user) => (
            <p key={user.id} className="truncate">{user.name}</p>
          ))}
        </div>
      )}
    </div>
  );
}
