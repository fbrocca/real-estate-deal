import { FinancingProfile } from "./underwriting";

/**
 * Default financing profile — HELOC-funded down payment + DSCR loan,
 * Charleston SC investment property assumptions.
 */
export const DEFAULT_PROFILE: FinancingProfile = {
  dscrRate: 0.065,
  ltv: 0.75,
  termYears: 30,
  dscrFloor: 1.0,
  helocRate: 0.0644,
  closingCostPct: 0.02,
  taxAssessmentRatio: 0.06,
  // ~300 effective mills on assessed value ≈ 1.8% of price/yr for investment
  // property with full school millage in the Charleston area. Editable.
  millage: 0.3,
  vacancyPct: 0.05,
  maintenanceMonthly: 200,
};
