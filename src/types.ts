import type { Tables, TablesInsert } from "@/db/database.types";

export type Holding = Tables<"holdings">;
export type HoldingInsert = TablesInsert<"holdings">;

export type PriceSnapshot = Tables<"price_snapshots">;
export type PriceSnapshotInsert = TablesInsert<"price_snapshots">;

export interface PriceQuote {
  symbol: string;
  price: number;
  currency: string;
  asOf: Date; // provider market timestamp
  stale: boolean; // true when served past TTL / on source failure
  source: string; // e.g. "yahoo"
}

export type PriceResult = { status: "ok"; quote: PriceQuote } | { status: "unavailable"; symbol: string };
