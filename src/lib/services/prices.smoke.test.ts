import { describe, expect, it } from "vitest";
import { yahooProvider } from "./providers/yahoo";

describe("yahooProvider (live smoke)", () => {
  it("returns a positive price and currency for a GPW symbol", async () => {
    const quote = await yahooProvider.fetchQuote("CDR.WA");

    expect(quote.price).toBeGreaterThan(0);
    expect(quote.currency).not.toHaveLength(0);
  });

  it("returns a positive price and currency for a US symbol", async () => {
    const quote = await yahooProvider.fetchQuote("AAPL");

    expect(quote.price).toBeGreaterThan(0);
    expect(quote.currency).not.toHaveLength(0);
  });
});
