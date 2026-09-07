import type { TranslatableItem } from "@/components/shared/use-content-translation";

export class ContentTranslationError extends Error {
  constructor(public readonly status = 0) {
    super("Content translation failed");
  }
}

type PendingItem = {
  item: TranslatableItem;
  resolve: (text: string) => void;
  reject: (error: ContentTranslationError) => void;
};

type BatchQueue = { pending: PendingItem[]; running: boolean };
const scopes = new WeakMap<object, Map<string, BatchQueue>>();
const keyOf = (item: TranslatableItem) => `${item.type}:${item.id}`;

/** 같은 사용자·언어의 화면 요청을 모아 서버 한도인 40개씩 처리한다. 결과 캐시는 호출자의 쿼리 캐시가 관리한다. */
export async function requestContentTranslations(
  scope: object,
  userId: string,
  locale: string,
  items: TranslatableItem[],
): Promise<Record<string, string>> {
  let queues = scopes.get(scope);
  if (!queues) { queues = new Map(); scopes.set(scope, queues); }
  const scopeKey = JSON.stringify([userId, locale]);
  let queue = queues.get(scopeKey);
  if (!queue) { queue = { pending: [], running: false }; queues.set(scopeKey, queue); }
  const current = queue;
  const values = items.map(item => new Promise<string>((resolve, reject) => {
    current.pending.push({ item, resolve, reject });
  }));

  if (!current.running) {
    current.running = true;
    // 같은 화면의 여러 행·선택창이 함께 요청할 수 있도록 한 번에 모은다.
    setTimeout(() => {
      void flush(current).finally(() => {
        if (!current.running && current.pending.length === 0) queues.delete(scopeKey);
      });
    }, 20);
  }
  const translated = await Promise.all(values);
  return Object.fromEntries(items.map((item, index) => [keyOf(item), translated[index]]));
}

async function flush(queue: BatchQueue) {
  while (queue.pending.length) {
    const keys = new Set<string>();
    const batch: PendingItem[] = [];
    queue.pending = queue.pending.filter(entry => {
      const key = keyOf(entry.item);
      if (keys.has(key) || keys.size < 40) {
        keys.add(key);
        batch.push(entry);
        return false;
      }
      return true;
    });
    const items = Array.from(new Map(batch.map(entry => [keyOf(entry.item), entry.item])).values());
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new ContentTranslationError(response.status);
      const payload = await response.json();
      const missing = new ContentTranslationError();
      for (const entry of batch) {
        const text: unknown = payload?.translations?.[keyOf(entry.item)];
        if (typeof text === "string" && text.trim()) entry.resolve(text);
        else entry.reject(missing);
      }
    } catch (error) {
      const failure = error instanceof ContentTranslationError ? error : new ContentTranslationError();
      // 한도 초과·설정 오류가 발생하면 대기 중인 요청을 계속 보내지 않는다.
      for (const entry of [...batch, ...queue.pending]) entry.reject(failure);
      queue.pending = [];
    }
  }
  queue.running = false;
}
