/**
 * Underwriting engine — pure functions, no I/O.
 *
 * Model notes (these are load-bearing, do not "simplify" them away):
 * - Property taxes for investment property in SC use the 6% assessment ratio
 *   with full school millage. Listing sites usually show the 4% owner-occupied
 *   figure, which materially understates the real bill.
 * - DSCR is computed on the PITIA of the DSCR loan leg ONLY. The HELOC payment
 *   that funds the down payment never enters the lender's ratio, but it does
 *   hit true cash flow, so it appears in carry.
 * - HELOC draw = down payment + closing costs + rehab, interest-only.
 */

export interface FinancingProfile {
  /** DSCR loan annual note rate, e.g. 0.065 */
  dscrRate: number;
  /** Loan-to-value, e.g. 0.75 */
  ltv: number;
  /** Amortization term in years */
  termYears: number;
  /** Lender minimum DSCR, typically 1.0 */
  dscrFloor: number;
  /** HELOC annual rate (interest-only), e.g. 0.0644 */
  helocRate: number;
  /** Closing costs as a fraction of purchase price, e.g. 0.02 */
  closingCostPct: number;
  /** SC assessment ratio for investment property: 0.06 (owner-occ is 0.04) */
  taxAssessmentRatio: number;
  /** Effective millage applied to assessed value, e.g. 0.30 = 300 mills */
  millage: number;
  /** Vacancy reserve as a fraction of rent, e.g. 0.05 */
  vacancyPct: number;
  /** Monthly maintenance/capex reserve in dollars */
  maintenanceMonthly: number;
}

export interface PropertyInputs {
  price: number;
  /** Monthly market rent */
  rent: number;
  hoaMonthly: number;
  insuranceMonthly: number;
  /**
   * Monthly tax override. When set, it is used as-is; when undefined, taxes
   * are computed from price x assessment ratio x millage.
   */
  taxesMonthly?: number;
  /** Rehab budget — goes on the HELOC and into all-in basis, never into DSCR */
  rehab: number;
  /** Annual tax figure shown on the listing, used only for the owner-occ warning */
  listedTaxesAnnual?: number;
}

export type DscrVerdict = "PASS" | "MARGINAL" | "FAIL";

export interface DealAnalysis {
  loanAmount: number;
  downPayment: number;
  monthlyPI: number;
  taxesMonthly: number;
  taxesComputed: boolean;
  insuranceMonthly: number;
  hoaMonthly: number;
  pitia: number;
  dscr: number;
  dscrVerdict: DscrVerdict;
  closingCosts: number;
  helocDraw: number;
  helocIO: number;
  /** rent - PITIA - HELOC interest (before reserves) */
  monthlyCarry: number;
  vacancyMonthly: number;
  maintenanceMonthly: number;
  /** monthlyCarry - vacancy - maintenance */
  allInCarry: number;
  annualCarry: number;
  grm: number;
  noiAnnual: number;
  capRate: number;
  allInBasis: number;
  /** True when the listing's tax figure looks like the 4% owner-occupied rate */
  ownerOccTaxWarning: boolean;
}

/** Standard amortized payment for a fixed-rate loan. */
export function monthlyPI(loan: number, annualRate: number, years: number): number {
  const n = years * 12;
  if (loan <= 0 || n <= 0) return 0;
  if (annualRate === 0) return loan / n;
  const r = annualRate / 12;
  const f = Math.pow(1 + r, n);
  return (loan * r * f) / (f - 1);
}

/** Annual SC property tax at the investment assessment ratio. */
export function scPropertyTaxAnnual(
  price: number,
  assessmentRatio: number,
  millage: number,
): number {
  return price * assessmentRatio * millage;
}

export function dscrVerdict(dscr: number, floor: number): DscrVerdict {
  if (dscr >= floor) return "PASS";
  if (dscr >= floor - 0.05) return "MARGINAL";
  return "FAIL";
}

export function analyzeDeal(p: PropertyInputs, f: FinancingProfile): DealAnalysis {
  const loanAmount = p.price * f.ltv;
  const downPayment = p.price - loanAmount;
  const pi = monthlyPI(loanAmount, f.dscrRate, f.termYears);

  const taxesComputed = p.taxesMonthly === undefined;
  const taxesMonthly = taxesComputed
    ? scPropertyTaxAnnual(p.price, f.taxAssessmentRatio, f.millage) / 12
    : (p.taxesMonthly as number);

  const pitia = pi + taxesMonthly + p.insuranceMonthly + p.hoaMonthly;
  const dscr = pitia > 0 ? p.rent / pitia : 0;

  const closingCosts = p.price * f.closingCostPct;
  const helocDraw = downPayment + closingCosts + p.rehab;
  const helocIO = (helocDraw * f.helocRate) / 12;

  const monthlyCarry = p.rent - pitia - helocIO;
  const vacancyMonthly = p.rent * f.vacancyPct;
  const allInCarry = monthlyCarry - vacancyMonthly - f.maintenanceMonthly;

  const annualRent = p.rent * 12;
  const noiAnnual =
    annualRent -
    (taxesMonthly + p.insuranceMonthly + p.hoaMonthly + vacancyMonthly + f.maintenanceMonthly) * 12;
  const allInBasis = p.price + p.rehab;

  // A listing tax figure at least 25% under the computed investment-rate bill
  // is almost certainly the 4% owner-occupied number.
  const ownerOccTaxWarning =
    p.listedTaxesAnnual !== undefined &&
    taxesComputed &&
    p.listedTaxesAnnual < taxesMonthly * 12 * 0.75;

  return {
    loanAmount,
    downPayment,
    monthlyPI: pi,
    taxesMonthly,
    taxesComputed,
    insuranceMonthly: p.insuranceMonthly,
    hoaMonthly: p.hoaMonthly,
    pitia,
    dscr,
    dscrVerdict: dscrVerdict(dscr, f.dscrFloor),
    closingCosts,
    helocDraw,
    helocIO,
    monthlyCarry,
    vacancyMonthly,
    maintenanceMonthly: f.maintenanceMonthly,
    allInCarry,
    annualCarry: allInCarry * 12,
    grm: annualRent > 0 ? p.price / annualRent : 0,
    noiAnnual,
    capRate: allInBasis > 0 ? noiAnnual / allInBasis : 0,
    allInBasis,
    ownerOccTaxWarning,
  };
}
