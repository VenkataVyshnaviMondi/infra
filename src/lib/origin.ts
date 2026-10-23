export function allowedOrigin(
  origin: string | null,
  expected: string,
  development: boolean,
): boolean {
  if (!origin) return false;
  if (origin === expected) return true;
  if (!development) return false;
  try {
    const source = new URL(origin);
    const target = new URL(expected);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return (
      source.origin === origin &&
      loopback.has(source.hostname) &&
      loopback.has(target.hostname) &&
      source.protocol === target.protocol &&
      source.port === target.port
    );
  } catch {
    return false;
  }
}
