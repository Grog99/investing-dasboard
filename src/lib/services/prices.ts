import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { PriceQuote, PriceResult, PriceSnapshot } from "@/types";
import type { PriceProvider } from "./providers/types";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const SOURCE = "yahoo";

export interface CreatePriceServiceOptions {
  supabase: SupabaseClient<Database>;
  provider: PriceProvider;
  ttlMs?: number;
  now?: () => Date;
}

export interface PriceService {
  getQuotes(symbols: string[]): Promise<Map<string, PriceResult>>;
  getQuote(symbol: string): Promise<PriceResult>;
}

function toQuote(snapshot: PriceSnapshot, stale: boolean): PriceQuote {
  return {
    symbol: snapshot.symbol,
    price: snapshot.price,
    currency: snapshot.currency,
    asOf: new Date(snapshot.as_of),
    stale,
    source: snapshot.source,
  };
}

function isFresh(snapshot: PriceSnapshot, ttlMs: number, now: Date): boolean {
  return now.getTime() - new Date(snapshot.updated_at).getTime() <= ttlMs;
}

function degrade(symbol: string, snapshot: PriceSnapshot | undefined): PriceResult {
  return snapshot ? { status: "ok", quote: toQuote(snapshot, true) } : { status: "unavailable", symbol };
}

export function createPriceService({
  supabase,
  provider,
  ttlMs = DEFAULT_TTL_MS,
  now = () => new Date(),
}: CreatePriceServiceOptions): PriceService {
  async function getQuotes(symbols: string[]): Promise<Map<string, PriceResult>> {
    const results = new Map<string, PriceResult>();
    const uniqueSymbols = Array.from(new Set(symbols));
    if (uniqueSymbols.length === 0) {
      return results;
    }

    const nowValue = now();
    const { data: snapshots, error } = await supabase.from("price_snapshots").select("*").in("symbol", uniqueSymbols);
    if (error) {
      throw error;
    }

    const snapshotBySymbol = new Map<string, PriceSnapshot>(snapshots.map((snapshot) => [snapshot.symbol, snapshot]));
    const toFetch: string[] = [];

    for (const symbol of uniqueSymbols) {
      const snapshot = snapshotBySymbol.get(symbol);
      if (snapshot && isFresh(snapshot, ttlMs, nowValue)) {
        results.set(symbol, { status: "ok", quote: toQuote(snapshot, false) });
      } else {
        toFetch.push(symbol);
      }
    }

    if (toFetch.length === 0) {
      return results;
    }

    const outcomes = await Promise.allSettled(toFetch.map((symbol) => provider.fetchQuote(symbol)));

    await Promise.all(
      outcomes.map(async (outcome, index) => {
        const symbol = toFetch[index];

        if (outcome.status === "rejected") {
          results.set(symbol, degrade(symbol, snapshotBySymbol.get(symbol)));
          return;
        }

        const raw = outcome.value;
        const { data: upserted, error: upsertError } = await supabase
          .from("price_snapshots")
          .upsert(
            { symbol, price: raw.price, currency: raw.currency, as_of: raw.asOf.toISOString(), source: SOURCE },
            { onConflict: "symbol" },
          )
          .select()
          .single();

        if (upsertError) {
          results.set(symbol, degrade(symbol, snapshotBySymbol.get(symbol)));
          return;
        }

        results.set(symbol, { status: "ok", quote: toQuote(upserted, false) });
      }),
    );

    return results;
  }

  async function getQuote(symbol: string): Promise<PriceResult> {
    const results = await getQuotes([symbol]);
    return results.get(symbol) ?? { status: "unavailable", symbol };
  }

  return { getQuotes, getQuote };
}
