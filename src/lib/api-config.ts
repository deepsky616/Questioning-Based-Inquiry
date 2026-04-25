export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length < 12) return "*".repeat(key.length);
  return key.slice(0, 4) + "*".repeat(key.length - 8) + key.slice(-4);
}

export function resolveApiKey(
  requestKey: string | undefined,
  serverKey: string | undefined
): string | null {
  if (requestKey && requestKey.length > 0) return requestKey;
  if (serverKey && serverKey.length > 0) return serverKey;
  return null;
}
