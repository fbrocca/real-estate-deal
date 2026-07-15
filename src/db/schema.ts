import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { FinancingProfile, PropertyInputs } from "@/lib/underwriting";

export type DealStatus =
  | "analyzing"
  | "offer"
  | "under_contract"
  | "owned"
  | "passed";

export const deals = sqliteTable("deals", {
  id: text("id").primaryKey(),
  address: text("address").notNull(),
  nickname: text("nickname"),
  status: text("status").$type<DealStatus>().notNull().default("analyzing"),
  inputs: text("inputs", { mode: "json" }).$type<PropertyInputs>().notNull(),
  // Snapshot of the financing profile the deal was analyzed with, so a later
  // settings change doesn't silently rewrite saved underwriting.
  profile: text("profile", { mode: "json" }).$type<FinancingProfile>().notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(), // single row: "default"
  profile: text("profile", { mode: "json" }).$type<FinancingProfile>().notNull(),
});

export const lookups = sqliteTable("lookups", {
  /** Normalized (lowercased, squashed whitespace) address */
  address: text("address").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});
