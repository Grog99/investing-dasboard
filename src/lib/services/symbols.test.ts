import { describe, expect, it } from "vitest";
import { toYahooSymbol } from "./symbols";

describe("toYahooSymbol", () => {
  it("appends .WA and uppercases the ticker for GPW", () => {
    expect(toYahooSymbol("cdr", "GPW")).toBe("CDR.WA");
  });

  it("returns the bare uppercased ticker for US", () => {
    expect(toYahooSymbol("aapl", "US")).toBe("AAPL");
  });
});
