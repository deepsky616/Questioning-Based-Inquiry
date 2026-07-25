export class ClientFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ClientFetchError";
    this.status = status;
  }
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();

  if (!text.trim()) {
    throw new ClientFetchError(
      response.ok
        ? "응답 내용이 비어 있습니다."
        : `요청을 완료하지 못했습니다. (${response.status})`,
      response.status,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ClientFetchError(
      "응답 내용을 읽을 수 없습니다.",
      response.status,
    );
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `요청을 완료하지 못했습니다. (${response.status})`;
    throw new ClientFetchError(message, response.status);
  }

  return data as T;
}
