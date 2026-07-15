import type { FinancingProfile, PropertyInputs } from "./underwriting";
import type { DealStatus } from "@/db/schema";

export interface DealRow {
  id: string;
  address: string;
  nickname: string | null;
  status: DealStatus;
  inputs: PropertyInputs;
  profile: FinancingProfile;
  notes: string | null;
  createdAt: number | string;
  updatedAt: number | string;
}

export const STATUS_LABELS: Record<DealStatus, string> = {
  analyzing: "Analyzing",
  offer: "Offer",
  under_contract: "Under contract",
  owned: "Owned",
  passed: "Passed",
};
