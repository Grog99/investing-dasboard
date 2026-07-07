import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { PriceSnapshot, PriceSnapshotInsert } from "@/types";
import type { PriceProvider, RawQuote } from "./providers/types";
import { createPriceService } from "./prices";

const TTL_MS = 15 * 60 * 1000;

class FakePriceStore {
  private readonly snapshots = new Map<string, PriceSnapshot>();

  constructor(
    private readonly now: () => Date,
    initial: PriceSnapshot[] = [],
    private readonly failSelect = false,
    private readonly failUpsert = false,
  ) {
    initial.forEach((snapshot) => this.snapshots.set(snapshot.symbol, snapshot));
  }

  from(_table: "price_snapshots") {
    return {
      select: (_columns: string) => ({
        in: (_column: string, values: string[]) => {
          if (this.failSelect) {
            return Promise.resolve({ data: null, error: new Error("connection reset") });
          }
          const data = values
            .map((symbol) => this.snapshots.get(symbol))
            .filter((snapshot): snapshot is PriceSnapshot => snapshot !== undefined);
          return Promise.resolve({ data, error: null });
        },
      }),
      upsert: (values: PriceSnapshotInsert, _options: { onConflict: string }) => ({
        select: () => ({
          single: () => {
            if (this.failUpsert) {
              return Promise.resolve({ data: null, error: new Error("connection reset") });
            }
            const existing = this.snapshots.get(values.symbol);
            const timestamp = this.now().toISOString();
            const row: PriceSnapshot = {
              symbol: values.symbol,
              price: values.price,
              currency: values.currency,
              as_of: values.as_of,
              source: values.source ?? "yahoo",
              created_at: existing?.created_at ?? timestamp,
              updated_at: timestamp,
            };
            this.snapshots.set(values.symbol, row);
            return Promise.resolve({ data: row, error: null });
          },
        }),
      }),
    };
  }
}

function asSupabase(store: FakePriceStore): SupabaseClient<Database> {
  return store as unknown as SupabaseClient<Database>;
}

function fakeProvider(handlers: Map<string, () => Promise<RawQuote>>): PriceProvider {
  return {
    fetchQuote: (symbol: string) => {
      const handler = handlers.get(symbol);
      return handler ? handler() : Promise.reject(new Error(`no handler for ${symbol}`));
    },
  };
}

function snapshot(overrides: Partial<PriceSnapshot> = {}): PriceSnapshot {
  return {
    symbol: "AAPL",
    price: 100,
    currency: "USD",
    as_of: "2026-01-01T00:00:00.000Z",
    source: "yahoo",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("createPriceService", () => {
  let currentTime: Date;
  const now = () => currentTime;

  beforeEach(() => {
    currentTime = new Date("2026-01-01T00:10:00.000Z");
  });

  it("returns a fresh cache hit without calling the provider", async () => {
    const store = new FakePriceStore(now, [snapshot({ updated_at: currentTime.toISOString() })]);
    const provider = fakeProvider(new Map());
    const fetchQuote = vi.spyOn(provider, "fetchQuote");
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(fetchQuote).not.toHaveBeenCalled();
    expect(results.get("AAPL")).toEqual({
      status: "ok",
      quote: {
        symbol: "AAPL",
        price: 100,
        currency: "USD",
        asOf: new Date("2026-01-01T00:00:00.000Z"),
        stale: false,
        source: "yahoo",
      },
    });
  });

  it("fetches and upserts a stale snapshot, returning it fresh", async () => {
    const stale = snapshot({ updated_at: "2025-12-31T23:00:00.000Z" });
    const store = new FakePriceStore(now, [stale]);
    const provider = fakeProvider(
      new Map([
        ["AAPL", () => Promise.resolve({ price: 150, currency: "USD", asOf: new Date("2026-01-01T00:09:00.000Z") })],
      ]),
    );
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(results.get("AAPL")).toEqual({
      status: "ok",
      quote: {
        symbol: "AAPL",
        price: 150,
        currency: "USD",
        asOf: new Date("2026-01-01T00:09:00.000Z"),
        stale: false,
        source: "yahoo",
      },
    });
  });

  it("returns stale:true (never rejects) when the provider fails but a prior snapshot exists", async () => {
    const stale = snapshot({ updated_at: "2025-12-31T23:00:00.000Z" });
    const store = new FakePriceStore(now, [stale]);
    const provider = fakeProvider(new Map([["AAPL", () => Promise.reject(new Error("yahoo down"))]]));
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(results.get("AAPL")).toEqual({
      status: "ok",
      quote: {
        symbol: "AAPL",
        price: 100,
        currency: "USD",
        asOf: new Date("2026-01-01T00:00:00.000Z"),
        stale: true,
        source: "yahoo",
      },
    });
  });

  it("returns unavailable when the provider fails with no prior snapshot", async () => {
    const store = new FakePriceStore(now, []);
    const provider = fakeProvider(new Map([["AAPL", () => Promise.reject(new Error("yahoo down"))]]));
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(results.get("AAPL")).toEqual({ status: "unavailable", symbol: "AAPL" });
  });

  it("returns a mixed map for a batch with one success and one failure", async () => {
    const store = new FakePriceStore(now, []);
    const provider = fakeProvider(
      new Map([
        ["AAPL", () => Promise.resolve({ price: 150, currency: "USD", asOf: currentTime })],
        ["BAD", () => Promise.reject(new Error("no data"))],
      ]),
    );
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL", "BAD"]);

    expect(results.get("AAPL")?.status).toBe("ok");
    expect(results.get("BAD")).toEqual({ status: "unavailable", symbol: "BAD" });
  });

  it("treats a snapshot exactly at the TTL boundary as fresh", async () => {
    currentTime = new Date("2026-01-01T00:15:00.000Z");
    const boundary = snapshot({ updated_at: "2026-01-01T00:00:00.000Z" });
    const store = new FakePriceStore(now, [boundary]);
    const provider = fakeProvider(new Map());
    const fetchQuote = vi.spyOn(provider, "fetchQuote");
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(fetchQuote).not.toHaveBeenCalled();
    expect(results.get("AAPL")).toEqual({
      status: "ok",
      quote: {
        symbol: "AAPL",
        price: 100,
        currency: "USD",
        asOf: new Date("2026-01-01T00:00:00.000Z"),
        stale: false,
        source: "yahoo",
      },
    });
  });

  it("fetches a snapshot one millisecond past the TTL boundary", async () => {
    currentTime = new Date("2026-01-01T00:15:00.001Z");
    const pastBoundary = snapshot({ updated_at: "2026-01-01T00:00:00.000Z" });
    const store = new FakePriceStore(now, [pastBoundary]);
    const provider = fakeProvider(
      new Map([["AAPL", () => Promise.resolve({ price: 200, currency: "USD", asOf: currentTime })]]),
    );
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(results.get("AAPL")).toEqual({
      status: "ok",
      quote: {
        symbol: "AAPL",
        price: 200,
        currency: "USD",
        asOf: currentTime,
        stale: false,
        source: "yahoo",
      },
    });
  });

  it("degrades to a provider fetch instead of throwing when the cache read fails", async () => {
    const store = new FakePriceStore(now, [], true);
    const provider = fakeProvider(
      new Map([["AAPL", () => Promise.resolve({ price: 150, currency: "USD", asOf: currentTime })]]),
    );
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(results.get("AAPL")?.status).toBe("ok");
  });

  it("returns unavailable (never rejects) when the cache read fails and the provider also fails", async () => {
    const store = new FakePriceStore(now, [], true);
    const provider = fakeProvider(new Map([["AAPL", () => Promise.reject(new Error("yahoo down"))]]));
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(results.get("AAPL")).toEqual({ status: "unavailable", symbol: "AAPL" });
  });

  it("degrades to stale when the upsert after a successful fetch fails", async () => {
    const stale = snapshot({ updated_at: "2025-12-31T23:00:00.000Z" });
    const store = new FakePriceStore(now, [stale], false, true);
    const provider = fakeProvider(
      new Map([["AAPL", () => Promise.resolve({ price: 150, currency: "USD", asOf: currentTime })]]),
    );
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const results = await service.getQuotes(["AAPL"]);

    expect(results.get("AAPL")).toEqual({
      status: "ok",
      quote: {
        symbol: "AAPL",
        price: 100,
        currency: "USD",
        asOf: new Date("2026-01-01T00:00:00.000Z"),
        stale: true,
        source: "yahoo",
      },
    });
  });

  it("getQuote returns a single PriceResult narrowed on status", async () => {
    const store = new FakePriceStore(now, [snapshot({ updated_at: currentTime.toISOString() })]);
    const provider = fakeProvider(new Map());
    const service = createPriceService({ supabase: asSupabase(store), provider, ttlMs: TTL_MS, now });

    const result = await service.getQuote("AAPL");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.quote.symbol).toBe("AAPL");
    }
  });
});
