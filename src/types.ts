import type { Tables, TablesInsert } from "@/db/database.types";

export type Holding = Tables<"holdings">;
export type HoldingInsert = TablesInsert<"holdings">;
