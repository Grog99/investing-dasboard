import { afterEach, describe, expect, it, vi } from "vitest";
import { createYahooProvider, YahooProviderError } from "./yahoo";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("yahooProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a valid chart payload and sends a browser User-Agent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        chart: {
          result: [{ meta: { regularMarketPrice: 123.45, currency: "USD", regularMarketTime: 1700000000 } }],
          error: null,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createYahooProvider("https://example.test");
    const quote = await provider.fetchQuote("AAPL");

    expect(quote).toEqual({ price: 123.45, currency: "USD", asOf: new Date(1700000000 * 1000) });
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers["User-Agent"]).toMatch(/Mozilla/);
  });

  it("throws a YahooProviderError on a non-200 status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const provider = createYahooProvider("https://example.test");

    await expect(provider.fetchQuote("AAPL")).rejects.toThrow(YahooProviderError);
  });

  it("throws a YahooProviderError when chart.error is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ chart: { result: null, error: { code: "Not Found", description: "No data found" } } }),
        ),
    );

    const provider = createYahooProvider("https://example.test");

    await expect(provider.fetchQuote("BADSYMBOL")).rejects.toThrow(YahooProviderError);
  });

  it("throws a YahooProviderError when regularMarketPrice is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          chart: { result: [{ meta: { currency: "USD", regularMarketTime: 1700000000 } }], error: null },
        }),
      ),
    );

    const provider = createYahooProvider("https://example.test");

    await expect(provider.fetchQuote("AAPL")).rejects.toThrow(YahooProviderError);
  });
});
