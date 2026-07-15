"use client";

import { DealAnalysis, FinancingProfile, PropertyInputs } from "@/lib/underwriting";
import { breakEvens } from "@/lib/sensitivity";
import { money, num, pct, signedMoney } from "@/lib/format";
import { Card, Stat } from "./ui";

export function DscrBadge({ analysis }: { analysis: DealAnalysis }) {
  const { dscr, dscrVerdict } = analysis;
  const cls =
    dscrVerdict === "PASS"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
      : dscrVerdict === "MARGINAL"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
        : "bg-rose-500/15 text-rose-400 border-rose-500/40";
  return (
    <div className={`flex items-center justify-between rounded-xl border px-5 py-4 ${cls}`}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
          DSCR
        </div>
        <div className="text-3xl font-bold tabular-nums">{num(dscr, 2)}</div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold">{dscrVerdict}</div>
        <div className="text-xs opacity-80">
          {dscrVerdict === "PASS"
            ? "clears the lender floor"
            : dscrVerdict === "MARGINAL"
              ? "under the floor — won't clear as-is"
              : "below the lender floor"}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  toneCls = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  toneCls?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-1 ${
        strong ? "border-t border-slate-700 pt-2 font-semibold" : ""
      }`}
    >
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm tabular-nums ${toneCls || "text-slate-100"}`}>{value}</span>
    </div>
  );
}

export function ResultsPanel({
  inputs,
  profile,
  analysis,
}: {
  inputs: PropertyInputs;
  profile: FinancingProfile;
  analysis: DealAnalysis;
}) {
  const a = analysis;
  const be = breakEvens(inputs, profile);
  const carryTone = (v: number) => (v >= 0 ? "text-emerald-400" : "text-rose-400");

  return (
    <div className="space-y-4">
      <DscrBadge analysis={a} />

      {a.ownerOccTaxWarning ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          The listing&apos;s tax figure ({money((inputs.listedTaxesAnnual ?? 0) / 12)}/mo)
          looks like the 4% owner-occupied rate. Underwriting uses the 6% investment
          rate: {money(a.taxesMonthly)}/mo.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`PITIA — DSCR loan leg (${pct(profile.ltv, 0)} LTV @ ${pct(profile.dscrRate, 2)})`}>
          <Row label={`Loan amount`} value={money(a.loanAmount)} />
          <Row label={`P&I (${profile.termYears}yr)`} value={`${money(a.monthlyPI)}/mo`} />
          <Row
            label={`Taxes ${a.taxesComputed ? "(6% investment ratio)" : "(manual)"}`}
            value={`${money(a.taxesMonthly)}/mo`}
          />
          <Row label="Insurance" value={`${money(a.insuranceMonthly)}/mo`} />
          <Row label="HOA" value={`${money(a.hoaMonthly)}/mo`} />
          <Row label="PITIA" value={`${money(a.pitia)}/mo`} strong />
          <Row label="Rent" value={`${money(inputs.rent)}/mo`} />
        </Card>

        <Card title={`HELOC leg (${pct(profile.helocRate, 2)} interest-only)`}>
          <Row label="Down payment" value={money(a.downPayment)} />
          <Row label="Closing costs" value={money(a.closingCosts)} />
          <Row label="Rehab budget" value={money(inputs.rehab)} />
          <Row label="Total HELOC draw" value={money(a.helocDraw)} strong />
          <Row label="HELOC payment" value={`${money(a.helocIO)}/mo`} />
          <div className="mt-2 text-xs text-slate-500">
            The HELOC payment never enters the lender&apos;s DSCR — but it&apos;s real
            money out the door every month, so it counts in carry below.
          </div>
        </Card>
      </div>

      <Card title="Monthly cash flow">
        <Row label="Rent" value={signedMoney(inputs.rent)} />
        <Row label="PITIA" value={signedMoney(-a.pitia)} />
        <Row label="HELOC interest" value={signedMoney(-a.helocIO)} />
        <Row
          label="Carry (before reserves)"
          value={`${signedMoney(a.monthlyCarry)}/mo`}
          strong
          toneCls={carryTone(a.monthlyCarry)}
        />
        <Row
          label={`Vacancy reserve (${pct(profile.vacancyPct, 0)})`}
          value={signedMoney(-a.vacancyMonthly)}
        />
        <Row label="Maintenance reserve" value={signedMoney(-a.maintenanceMonthly)} />
        <Row
          label="All-in carry"
          value={`${signedMoney(a.allInCarry)}/mo  (${signedMoney(a.annualCarry)}/yr)`}
          strong
          toneCls={carryTone(a.allInCarry)}
        />
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="GRM" value={num(a.grm, 1)} sub="price ÷ annual rent" />
        <Stat label="Cap rate" value={pct(a.capRate, 2)} sub="NOI ÷ all-in basis" />
        <Stat label="All-in basis" value={money(a.allInBasis)} sub="price + rehab" />
        <Stat label="NOI" value={`${money(a.noiAnnual)}/yr`} />
      </div>

      <Card title="Break-evens">
        <Row
          label={`Rent for DSCR ${num(profile.dscrFloor, 2)}`}
          value={`${money(be.rentForDscrFloor)}/mo`}
          toneCls={inputs.rent >= be.rentForDscrFloor ? "text-emerald-400" : "text-rose-400"}
        />
        <Row
          label="Rent for zero carry (before reserves)"
          value={`${money(be.rentForZeroCarry)}/mo`}
          toneCls={inputs.rent >= be.rentForZeroCarry ? "text-emerald-400" : "text-rose-400"}
        />
        <Row
          label="Rent for zero all-in carry"
          value={`${money(be.rentForZeroAllInCarry)}/mo`}
          toneCls={
            inputs.rent >= be.rentForZeroAllInCarry ? "text-emerald-400" : "text-rose-400"
          }
        />
        {be.maxPriceForDscrFloor !== null ? (
          <Row
            label={`Max price at ${money(inputs.rent)}/mo rent (DSCR ${num(profile.dscrFloor, 2)})`}
            value={money(be.maxPriceForDscrFloor)}
            toneCls={
              inputs.price <= be.maxPriceForDscrFloor ? "text-emerald-400" : "text-rose-400"
            }
          />
        ) : (
          <div className="pt-1 text-xs text-slate-500">
            Max price needs taxes in auto mode (they scale with price).
          </div>
        )}
      </Card>
    </div>
  );
}
