import { describe, expect, it } from "vitest";
import { allowedOrigin } from "../src/lib/origin";

describe("request origins", () => {
  const expected = "http://localhost:3000";
  it("allows both local development addresses", () => {
    expect(allowedOrigin("http://127.0.0.1:3000", expected, true)).toBe(true);
    expect(allowedOrigin(expected, "http://127.0.0.1:3000", true)).toBe(true);
  });
  it("keeps production restricted to the configured origin", () => {
    expect(allowedOrigin(expected, expected, false)).toBe(true);
    expect(allowedOrigin("http://127.0.0.1:3000", expected, false)).toBe(false);
  });
  it("rejects missing, external, malformed and different-port origins", () => {
    for (const origin of [null, "null", "http://evil.test:3000", "http://localhost.evil.test:3000", "http://localhost:3001", "https://localhost:3000", "http://localhost:3000/path"]) {
      expect(allowedOrigin(origin, expected, true)).toBe(false);
    }
  });
});
