import type { PriceProvider, RawQuote } from "./types";

const DEFAULT_BASE_URL = "https://query1.finance.yahoo.com";

// Yahoo rejects requests with an empty/bot User-Agent.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class YahooProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YahooProviderError";
  }
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  currency?: string;
  regularMarketTime?: number;
}

interface YahooChartResponse {
  chart: {
    result: { meta: YahooChartMeta }[] | null;
    error: { code: string; description: string } | null;
  };
}

export function createYahooProvider(baseUrl: string = DEFAULT_BASE_URL): PriceProvider {
  return {
    async fetchQuote(providerSymbol: string): Promise<RawQuote> {
      const url = `${baseUrl}/v8/finance/chart/${encodeURIComponent(providerSymbol)}?interval=1d&range=1d`;
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!response.ok) {
        throw new YahooProviderError(
          `Yahoo chart request for "${providerSymbol}" failed with status ${response.status}`,
        );
      }

      const data = (await response.json()) as YahooChartResponse;

      if (data.chart.error) {
        throw new YahooProviderError(`Yahoo chart error for "${providerSymbol}": ${data.chart.error.description}`);
      }

      const meta = data.chart.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== "number" || !meta.currency || !meta.regularMarketTime) {
        throw new YahooProviderError(`Yahoo chart response missing required fields for "${providerSymbol}"`);
      }

      return {
        price: meta.regularMarketPrice,
        currency: meta.currency,
        asOf: new Date(meta.regularMarketTime * 1000),
      };
    },
  };
}

export const yahooProvider: PriceProvider = createYahooProvider();
