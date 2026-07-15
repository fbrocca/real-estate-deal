import { describe, expect, it } from "vitest";
import {
  analyzeDeal,
  dscrVerdict,
  FinancingProfile,
  monthlyPI,
} from "@/lib/underwriting";
import { breakEvens, rentSweep } from "@/lib/sensitivity";

/**
 * Reference cases from prior manual underwriting. The engine must reproduce
 * these within rounding, or it is wrong.
 */

const BASE: FinancingProfile = {
  dscrRate: 0.065,
  ltv: 0.75,
  termYears: 30,
  dscrFloor: 1.0,
  helocRate: 0.0644,
  closingCostPct: 0.02,
  taxAssessmentRatio: 0.06,
  millage: 0.3,
  vacancyPct: 0.05,
  maintenanceMonthly: 200,
};

describe("monthlyPI", () => {
  it("matches Lansing Dr loan leg: $315K @ 6.5%/30yr ≈ $1,991", () => {
    expect(monthlyPI(315_000, 0.065, 30)).toBeCloseTo(1991, 0);
  });

  it("matches Mixson loan leg: $255K @ 6.5%/30yr ≈ $1,612", () => {
    expect(monthlyPI(255_000, 0.065, 30)).toBeCloseTo(1612, 0);
  });

  it("handles zero rate as straight-line", () => {
    expect(monthlyPI(120_000, 0, 30)).toBeCloseTo(120_000 / 360, 6);
  });
});

describe("936 Lansing Dr Unit D reference ($420K condo, Mt Pleasant)", () => {
  // The original analysis drew only the down payment on the HELOC ($105K),
  // so closing costs are zeroed here to match its carry figure exactly.
  const profile: FinancingProfile = { ...BASE, closingCostPct: 0 };
  const inputs = {
    price: 420_000,
    rent: 2_700,
    hoaMonthly: 380,
    insuranceMonthly: 220,
    taxesMonthly: 630,
    rehab: 0,
    listedTaxesAnnual: 388 * 12,
  };

  it("reproduces PITIA ≈ $3,221", () => {
    const a = analyzeDeal(inputs, profile);
    expect(a.pitia).toBeCloseTo(3221, 0);
  });

  it("reproduces DSCR 0.84 at $2,700 rent → FAIL", () => {
    const a = analyzeDeal(inputs, profile);
    expect(a.dscr).toBeCloseTo(0.84, 2);
    expect(a.dscrVerdict).toBe("FAIL");
  });

  it("reproduces DSCR 0.99 at $3,200 rent → still under the floor (MARGINAL)", () => {
    const a = analyzeDeal({ ...inputs, rent: 3_200 }, profile);
    expect(a.dscr).toBeCloseTo(0.99, 2);
    expect(a.dscrVerdict).toBe("MARGINAL");
  });

  it("reproduces HELOC: $105K draw → ~$563/mo IO, carry ≈ -$1,084", () => {
    const a = analyzeDeal(inputs, profile);
    expect(a.helocDraw).toBeCloseTo(105_000, 0);
    expect(a.helocIO).toBeCloseTo(563.5, 1);
    // Reference figure was quoted from rounded components; allow ±$5.
    expect(a.monthlyCarry).toBeCloseTo(-1084, -1);
  });

  it("reproduces GRM 13.0", () => {
    const a = analyzeDeal(inputs, profile);
    expect(a.grm).toBeCloseTo(13.0, 1);
  });

  it("flags the $388/mo listing tax figure as owner-occupied", () => {
    // Computed taxes (no override): 420K x 6% x 0.30 = $7,560/yr = $630/mo
    const a = analyzeDeal({ ...inputs, taxesMonthly: undefined }, profile);
    expect(a.taxesMonthly).toBeCloseTo(630, 0);
    expect(a.ownerOccTaxWarning).toBe(true);
  });
});

describe("Mixson reference ($340K + $20K rehab, rent $2,400)", () => {
  const inputs = {
    price: 340_000,
    rent: 2_400,
    hoaMonthly: 0,
    insuranceMonthly: 250,
    taxesMonthly: 490,
    rehab: 20_000,
  };
  const profile: FinancingProfile = { ...BASE, maintenanceMonthly: 400 };

  it("reproduces DSCR ≈ 1.02 (PASS) on PITIA ≈ $2,352", () => {
    const a = analyzeDeal(inputs, profile);
    expect(a.pitia).toBeCloseTo(2352, 0);
    expect(a.dscr).toBeCloseTo(1.02, 2);
    expect(a.dscrVerdict).toBe("PASS");
  });

  it("reproduces HELOC draw $85K + ~$7K closing + $20K rehab ≈ $112K → ~$601/mo", () => {
    const a = analyzeDeal(inputs, profile);
    expect(a.downPayment).toBeCloseTo(85_000, 0);
    expect(a.closingCosts).toBeCloseTo(6_800, 0);
    expect(a.helocDraw).toBeCloseTo(111_800, 0);
    expect(a.helocIO).toBeCloseTo(600, 0);
  });

  it("reproduces carry ≈ -$553 and all-in ≈ -$1,073 (w/ $400 maint + 5% vacancy)", () => {
    const a = analyzeDeal(inputs, profile);
    // Reference figures were quoted from rounded components; allow ±$5.
    expect(a.monthlyCarry).toBeCloseTo(-553, -1);
    expect(a.vacancyMonthly).toBeCloseTo(120, 0);
    expect(a.allInCarry).toBeCloseTo(-1073, -1);
  });

  it("all-in basis is price + rehab = $360K", () => {
    const a = analyzeDeal(inputs, profile);
    expect(a.allInBasis).toBe(360_000);
  });
});

describe("dscrVerdict", () => {
  it("PASS at/above floor, MARGINAL within 0.05, FAIL below", () => {
    expect(dscrVerdict(1.0, 1.0)).toBe("PASS");
    expect(dscrVerdict(0.96, 1.0)).toBe("MARGINAL");
    expect(dscrVerdict(0.94, 1.0)).toBe("FAIL");
  });
});

describe("break-evens", () => {
  const inputs = {
    price: 420_000,
    rent: 2_700,
    hoaMonthly: 380,
    insuranceMonthly: 220,
    taxesMonthly: 630,
    rehab: 0,
  };
  const profile: FinancingProfile = { ...BASE, closingCostPct: 0 };

  it("rent for DSCR floor equals PITIA at floor 1.0", () => {
    const be = breakEvens(inputs, profile);
    expect(be.rentForDscrFloor).toBeCloseTo(3221, 0);
  });

  it("rent for zero pre-reserve carry = PITIA + HELOC IO", () => {
    const be = breakEvens(inputs, profile);
    expect(be.rentForZeroCarry).toBeCloseTo(3221 + 563, -1);
  });

  it("max price honors the DSCR floor when taxes scale with price", () => {
    const be = breakEvens({ ...inputs, taxesMonthly: undefined }, profile);
    expect(be.maxPriceForDscrFloor).not.toBeNull();
    const a = analyzeDeal(
      { ...inputs, taxesMonthly: undefined, price: be.maxPriceForDscrFloor! },
      profile,
    );
    expect(a.dscr).toBeCloseTo(1.0, 4);
  });

  it("max price is null when taxes are a fixed override", () => {
    const be = breakEvens(inputs, profile);
    expect(be.maxPriceForDscrFloor).toBeNull();
  });
});

describe("sweeps", () => {
  it("rent sweep spans ±20% and DSCR moves linearly with rent", () => {
    const inputs = {
      price: 420_000,
      rent: 2_700,
      hoaMonthly: 380,
      insuranceMonthly: 220,
      taxesMonthly: 630,
      rehab: 0,
    };
    const pts = rentSweep(inputs, BASE, 9);
    expect(pts).toHaveLength(9);
    expect(pts[0].value).toBeCloseTo(2_160, 0);
    expect(pts[8].value).toBeCloseTo(3_240, 0);
    expect(pts[8].dscr).toBeGreaterThan(pts[0].dscr);
  });
});
