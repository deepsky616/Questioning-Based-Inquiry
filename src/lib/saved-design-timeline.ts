export type SavedDesignTimelineKind = "saved" | "updated" | "deployed";

export interface SavedDesignTimelineInput {
  createdAt?: string | null;
  updatedAt?: string | null;
  lastDeployedAt?: string | null;
}

export interface SavedDesignTimelineItem {
  kind: SavedDesignTimelineKind;
  at: string;
}

const isAfter = (a?: string | null, b?: string | null) => {
  if (!a || !b) return false;
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return left > right + 1000;
};

export function getSavedDesignTimeline(design: SavedDesignTimelineInput): {
  primary: SavedDesignTimelineItem | null;
  history: SavedDesignTimelineItem[];
} {
  const history: SavedDesignTimelineItem[] = [];
  if (design.createdAt) history.push({ kind: "saved", at: design.createdAt });
  if (design.updatedAt && design.updatedAt !== design.createdAt) history.push({ kind: "updated", at: design.updatedAt });
  if (design.lastDeployedAt) history.push({ kind: "deployed", at: design.lastDeployedAt });

  if (design.lastDeployedAt && isAfter(design.updatedAt, design.lastDeployedAt) && design.updatedAt) {
    return { primary: { kind: "updated", at: design.updatedAt }, history };
  }
  if (design.lastDeployedAt) {
    return { primary: { kind: "deployed", at: design.lastDeployedAt }, history };
  }
  if (design.updatedAt) {
    return { primary: { kind: "saved", at: design.updatedAt }, history };
  }
  if (design.createdAt) {
    return { primary: { kind: "saved", at: design.createdAt }, history };
  }
  return { primary: null, history };
}
