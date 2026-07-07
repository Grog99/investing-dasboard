export type Market = "GPW" | "US";

// S-01 owns capturing which market a ticker belongs to; this only owns the ticker->symbol mapping.
export function toYahooSymbol(ticker: string, market: Market): string {
  const base = ticker.trim().toUpperCase();
  return market === "GPW" ? `${base}.WA` : base;
}
