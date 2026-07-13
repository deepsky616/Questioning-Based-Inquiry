export type CreatedQuestionClass = Record<string, unknown> & {
  id: string;
  createdAt?: string;
};

interface IdentifiedDesign {
  id: string;
}

export interface PendingQuestionClassDesign<
  TDesign extends IdentifiedDesign = IdentifiedDesign,
> {
  inputSignature: string;
  design: TDesign;
}

type InquiryQuestionClassCreationResult<TDesign extends IdentifiedDesign> =
  | {
      status: "success";
      pendingDesign: null;
      createdSession: CreatedQuestionClass;
    }
  | {
      status: "design-failed" | "session-failed";
      pendingDesign: PendingQuestionClassDesign<TDesign> | null;
      error?: unknown;
    };

type SavedDesignQuestionClassResult =
  | { status: "success"; createdSession: CreatedQuestionClass }
  | { status: "update-failed" | "session-failed"; error?: unknown };

function isCreatedQuestionClass(value: unknown): value is CreatedQuestionClass {
  if (!value || typeof value !== "object") return false;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && Boolean(id.trim());
}

function responseErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export async function postInquiryDesign<TDesign extends IdentifiedDesign>({
  payload,
  fallbackError,
  fetcher = fetch,
}: {
  payload: unknown;
  fallbackError: string;
  fetcher?: typeof fetch;
}): Promise<TDesign> {
  const response = await fetcher("/api/unit-design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(responseErrorMessage(body, fallbackError));

  const result = body as { designId?: unknown; design?: unknown } | null;
  const design = result?.design as TDesign | undefined;
  if (
    typeof result?.designId !== "string" ||
    !result.designId.trim() ||
    !design?.id?.trim() ||
    design.id !== result.designId
  ) {
    throw new Error(fallbackError);
  }
  return design;
}

export async function postQuestionClassFromDesign({
  designId,
  payload,
  fallbackError,
  fetcher = fetch,
}: {
  designId: string;
  payload: unknown;
  fallbackError: string;
  fetcher?: typeof fetch;
}): Promise<unknown> {
  const response = await fetcher(`/api/unit-design/${designId}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(responseErrorMessage(body, fallbackError));
  return body;
}

export async function runInquiryQuestionClassCreation<TDesign extends IdentifiedDesign>({
  inputSignature,
  pendingDesign,
  saveDesign,
  createSession,
  onSuccess,
}: {
  inputSignature: string;
  pendingDesign: PendingQuestionClassDesign<TDesign> | null;
  saveDesign: () => Promise<TDesign | null>;
  createSession: (design: TDesign) => Promise<unknown>;
  onSuccess: (createdSession: CreatedQuestionClass) => void | Promise<void>;
}): Promise<InquiryQuestionClassCreationResult<TDesign>> {
  let design =
    pendingDesign?.inputSignature === inputSignature && pendingDesign.design.id.trim()
      ? pendingDesign.design
      : null;

  if (!design) {
    try {
      design = await saveDesign();
    } catch (error) {
      return { status: "design-failed", pendingDesign, error };
    }
    if (!design?.id?.trim()) {
      return { status: "design-failed", pendingDesign };
    }
  }

  const reusableDesign = { inputSignature, design };
  let createdSession: unknown;
  try {
    createdSession = await createSession(design);
  } catch (error) {
    return { status: "session-failed", pendingDesign: reusableDesign, error };
  }

  if (!isCreatedQuestionClass(createdSession)) {
    return { status: "session-failed", pendingDesign: reusableDesign };
  }

  await onSuccess(createdSession);
  return { status: "success", pendingDesign: null, createdSession };
}

export async function runSavedDesignQuestionClassCreation({
  updateDesign,
  createSession,
  refreshDesigns,
  onSuccess,
}: {
  updateDesign: () => Promise<boolean>;
  createSession: () => Promise<unknown>;
  refreshDesigns: () => void | Promise<unknown>;
  onSuccess: (createdSession: CreatedQuestionClass) => void | Promise<void>;
}): Promise<SavedDesignQuestionClassResult> {
  let updated = false;
  try {
    updated = await updateDesign();
  } catch (error) {
    return { status: "update-failed", error };
  }
  if (!updated) return { status: "update-failed" };

  let createdSession: unknown;
  let createError: unknown;
  try {
    createdSession = await createSession();
  } catch (error) {
    createError = error;
  }

  try {
    await refreshDesigns();
  } catch {
    // 서버 저장은 끝났으므로 목록 재조회 실패가 생성 결과를 바꾸지는 않는다.
  }

  if (createError || !isCreatedQuestionClass(createdSession)) {
    return { status: "session-failed", error: createError };
  }

  await onSuccess(createdSession);
  return { status: "success", createdSession };
}
