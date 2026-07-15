import {
  analyzeDeal,
  DealAnalysis,
  FinancingProfile,
  PropertyInputs,
} from "./underwriting";

export interface BreakEvens {
  /** Rent needed for DSCR to hit the lender floor */
  rentForDscrFloor: number;
  /** Rent where rent - PITIA - HELOC interest = 0 */
  rentForZeroCarry: number;
  /** Rent where all-in carry (incl. vacancy % and maintenance) = 0 */
  rentForZeroAllInCarry: number;
  /** Max purchase price at the current rent where DSCR still meets the floor (null if taxes are overridden per-price) */
  maxPriceForDscrFloor: number | null;
}

export function breakEvens(p: PropertyInputs, f: FinancingProfile): BreakEvens {
  const a = analyzeDeal(p, f);

  const rentForDscrFloor = a.pitia * f.dscrFloor;
  const rentForZeroCarry = a.pitia + a.helocIO;
  // rent - pitia - helocIO - rent*vacancy - maintenance = 0
  const rentForZeroAllInCarry =
    f.vacancyPct < 1
      ? (a.pitia + a.helocIO + f.maintenanceMonthly) / (1 - f.vacancyPct)
      : Infinity;

  // PITIA(price) = price*(ltv*pmtFactor + taxFactor) + insurance + hoa,
  // solve for PITIA = rent / floor. Only valid when taxes scale with price.
  let maxPriceForDscrFloor: number | null = null;
  if (p.taxesMonthly === undefined && f.dscrFloor > 0) {
    const perDollarPI = monthlyPIFactor(f.dscrRate, f.termYears) * f.ltv;
    const perDollarTax = (f.taxAssessmentRatio * f.millage) / 12;
    const target = p.rent / f.dscrFloor - p.insuranceMonthly - p.hoaMonthly;
    const denom = perDollarPI + perDollarTax;
    maxPriceForDscrFloor = denom > 0 && target > 0 ? target / denom : 0;
  }

  return { rentForDscrFloor, rentForZeroCarry, rentForZeroAllInCarry, maxPriceForDscrFloor };
}

/** Monthly P&I per dollar of loan. */
export function monthlyPIFactor(annualRate: number, years: number): number {
  const n = years * 12;
  if (n <= 0) return 0;
  if (annualRate === 0) return 1 / n;
  const r = annualRate / 12;
  const f = Math.pow(1 + r, n);
  return (r * f) / (f - 1);
}

export interface SweepPoint {
  /** The swept variable's value at this point */
  value: number;
  dscr: number;
  monthlyCarry: number;
  allInCarry: number;
  analysis: DealAnalysis;
}

function sweep(
  values: number[],
  build: (v: number) => [PropertyInputs, FinancingProfile],
): SweepPoint[] {
  return values.map((value) => {
    const [p, f] = build(value);
    const a = analyzeDeal(p, f);
    return { value, dscr: a.dscr, monthlyCarry: a.monthlyCarry, allInCarry: a.allInCarry, analysis: a };
  });
}

export function range(from: number, to: number, steps: number): number[] {
  if (steps <= 1) return [from];
  const out: number[] = [];
  for (let i = 0; i < steps; i++) out.push(from + ((to - from) * i) / (steps - 1));
  return out;
}

export function rentSweep(p: PropertyInputs, f: FinancingProfile, steps = 9): SweepPoint[] {
  return sweep(range(p.rent * 0.8, p.rent * 1.2, steps), (rent) => [{ ...p, rent }, f]);
}

export function rateSweep(p: PropertyInputs, f: FinancingProfile, steps = 11): SweepPoint[] {
  return sweep(range(0.055, 0.08, steps), (dscrRate) => [p, { ...f, dscrRate }]);
}

export function priceSweep(p: PropertyInputs, f: FinancingProfile, steps = 9): SweepPoint[] {
  return sweep(range(p.price * 0.85, p.price * 1.15, steps), (price) => [{ ...p, price }, f]);
}

export function vacancySweep(p: PropertyInputs, f: FinancingProfile, steps = 6): SweepPoint[] {
  return sweep(range(0, 0.1, steps), (vacancyPct) => [p, { ...f, vacancyPct }]);
}
