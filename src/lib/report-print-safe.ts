export function printTextOf(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value.map(printTextOf).filter(Boolean).join("\n");
    return text || undefined;
  }
  if (typeof value === "object") {
    const text = Object.values(value as Record<string, unknown>).map(printTextOf).filter(Boolean).join("\n");
    return text || undefined;
  }
  return String(value);
}
