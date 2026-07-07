import type { Tables, TablesInsert } from "@/db/database.types";

export type Holding = Tables<"holdings">;
export type HoldingInsert = TablesInsert<"holdings">;

export type PriceSnapshot = Tables<"price_snapshots">;
export type PriceSnapshotInsert = TablesInsert<"price_snapshots">;
