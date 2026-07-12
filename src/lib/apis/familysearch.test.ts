import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkTreeCollision } from "./familysearch";

describe("checkTreeCollision", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns hit: false and confidence: 0 if FAMILYSEARCH_APP_KEY is missing", async () => {
    delete process.env.FAMILYSEARCH_APP_KEY;
    const res = await checkTreeCollision("John", "Doe", 1880, 1940);
    expect(res.hit).toBe(false);
    expect(res.confidence).toBe(0);
    expect(res.url).toContain("q.givenName=John");
  });

  it("returns hit: false if token exchange fails", async () => {
    process.env.FAMILYSEARCH_APP_KEY = "test-app-key";
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const res = await checkTreeCollision("John", "Doe", 1880, 1940);
    expect(res.hit).toBe(false);
    expect(res.confidence).toBe(0);
  });

  it("performs query and returns hit: true on high-confidence match", async () => {
    process.env.FAMILYSEARCH_APP_KEY = "test-app-key";

    // 1. Mock token fetch success
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "mock-token" }),
    } as Response);

    // 2. Mock search query success with a strong match
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: [
          {
            content: {
              gedcomx: {
                persons: [
                  {
                    id: "K123-ABC",
                    names: [{ nameForms: [{ fullText: "John Doe" }] }],
                    facts: [
                      {
                        type: "http://gedcomx.org/Birth",
                        date: { original: "15 April 1880" },
                      },
                      {
                        type: "http://gedcomx.org/Death",
                        date: { original: "1940" },
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      }),
    } as Response);

    const res = await checkTreeCollision("John", "Doe", 1880, 1940);
    expect(res.hit).toBe(true);
    expect(res.pid).toBe("K123-ABC");
    expect(res.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("returns hit: false on low-confidence match (wrong birth year)", async () => {
    process.env.FAMILYSEARCH_APP_KEY = "test-app-key";

    // 1. Mock token fetch success
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "mock-token" }),
    } as Response);

    // 2. Mock search query success with a weak match (birth year is off by 10 years)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: [
          {
            content: {
              gedcomx: {
                persons: [
                  {
                    id: "K123-XYZ",
                    names: [{ nameForms: [{ fullText: "John Doe" }] }],
                    facts: [
                      {
                        type: "http://gedcomx.org/Birth",
                        date: { original: "1890" },
                      },
                      {
                        type: "http://gedcomx.org/Death",
                        date: { original: "1950" },
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      }),
    } as Response);

    const res = await checkTreeCollision("John", "Doe", 1880, 1940);
    expect(res.hit).toBe(false);
    expect(res.confidence).toBeLessThan(0.7);
  });
});
