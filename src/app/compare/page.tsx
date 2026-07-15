"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { analyzeDeal, DealAnalysis } from "@/lib/underwriting";
import type { DealRow } from "@/lib/types";
import { money, num, pct, signedMoney } from "@/lib/format";
import { Card } from "@/components/ui";

interface MetricDef {
  label: string;
  value: (a: DealAnalysis, d: DealRow) => string;
  raw: (a: DealAnalysis, d: DealRow) => number;
  /** true when a higher value wins the row */
  higherIsBetter: boolean;
  tone?: (a: DealAnalysis) => "good" | "bad" | "neutral";
}

const METRICS: MetricDef[] = [
  {
    label: "Price",
    value: (_a, d) => money(d.inputs.price),
    raw: (_a, d) => d.inputs.price,
    higherIsBetter: false,
  },
  {
    label: "Rent",
    value: (_a, d) => `${money(d.inputs.rent)}/mo`,
    raw: (_a, d) => d.inputs.rent,
    higherIsBetter: true,
  },
  {
    label: "PITIA",
    value: (a) => `${money(a.pitia)}/mo`,
    raw: (a) => a.pitia,
    higherIsBetter: false,
  },
  {
    label: "DSCR",
    value: (a) => `${num(a.dscr, 2)} ${a.dscrVerdict}`,
    raw: (a) => a.dscr,
    higherIsBetter: true,
    tone: (a) => (a.dscrVerdict === "PASS" ? "good" : a.dscrVerdict === "FAIL" ? "bad" : "neutral"),
  },
  {
    label: "HELOC draw",
    value: (a) => money(a.helocDraw),
    raw: (a) => a.helocDraw,
    higherIsBetter: false,
  },
  {
    label: "HELOC payment",
    value: (a) => `${money(a.helocIO)}/mo`,
    raw: (a) => a.helocIO,
    higherIsBetter: false,
  },
  {
    label: "Carry (before reserves)",
    value: (a) => `${signedMoney(a.monthlyCarry)}/mo`,
    raw: (a) => a.monthlyCarry,
    higherIsBetter: true,
    tone: (a) => (a.monthlyCarry >= 0 ? "good" : "bad"),
  },
  {
    label: "All-in carry",
    value: (a) => `${signedMoney(a.allInCarry)}/mo`,
    raw: (a) => a.allInCarry,
    higherIsBetter: true,
    tone: (a) => (a.allInCarry >= 0 ? "good" : "bad"),
  },
  {
    label: "Annual carry",
    value: (a) => `${signedMoney(a.annualCarry)}/yr`,
    raw: (a) => a.annualCarry,
    higherIsBetter: true,
  },
  {
    label: "GRM",
    value: (a) => num(a.grm, 1),
    raw: (a) => a.grm,
    higherIsBetter: false,
  },
  {
    label: "Cap rate",
    value: (a) => pct(a.capRate, 2),
    raw: (a) => a.capRate,
    higherIsBetter: true,
  },
  {
    label: "All-in basis",
    value: (a) => money(a.allInBasis),
    raw: (a) => a.allInBasis,
    higherIsBetter: false,
  },
];

export default function ComparePage() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((d) => {
        const rows: DealRow[] = d.deals ?? [];
        setDeals(rows);
        setSelected(rows.slice(0, Math.min(3, rows.length)).map((r) => r.id));
      })
      .finally(() => setLoading(false));
  }, []);

  const picked = useMemo(
    () =>
      selected
        .map((id) => deals.find((d) => d.id === id))
        .filter((d): d is DealRow => Boolean(d))
        .map((d) => ({ deal: d, a: analyzeDeal(d.inputs, d.profile) })),
    [deals, selected],
  );

  function toggle(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id],
    );
  }

  if (loading) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      </Card>
    );
  }

  if (deals.length < 2) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-slate-500">
          Save at least two deals to compare them.{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            Analyze a property →
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Compare deals</h1>

      <Card title="Pick 2–4 deals">
        <div className="flex flex-wrap gap-2">
          {deals.map((d) => (
            <button
              key={d.id}
              onClick={() => toggle(d.id)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                selected.includes(d.id)
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {d.nickname || d.address}
            </button>
          ))}
        </div>
      </Card>

      {picked.length >= 2 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500">
                  Metric
                </th>
                {picked.map(({ deal }) => (
                  <th key={deal.id} className="px-3 py-3 text-left">
                    <Link
                      href={`/?deal=${deal.id}`}
                      className="font-semibold text-slate-100 hover:text-emerald-400"
                    >
                      {deal.nickname || deal.address}
                    </Link>
                    {deal.nickname ? (
                      <div className="text-xs font-normal text-slate-500">{deal.address}</div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const values = picked.map(({ a, deal }) => m.raw(a, deal));
                const best = m.higherIsBetter ? Math.max(...values) : Math.min(...values);
                return (
                  <tr key={m.label} className="border-b border-slate-800/60">
                    <td className="px-3 py-2 text-slate-400">{m.label}</td>
                    {picked.map(({ a, deal }, i) => {
                      const isBest = values[i] === best && new Set(values).size > 1;
                      const tone = m.tone?.(a) ?? "neutral";
                      return (
                        <td
                          key={deal.id}
                          className={`px-3 py-2 ${
                            tone === "good"
                              ? "text-emerald-400"
                              : tone === "bad"
                                ? "text-rose-400"
                                : "text-slate-100"
                          } ${isBest ? "font-bold" : ""}`}
                        >
                          {m.value(a, deal)}
                          {isBest ? " ★" : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-slate-500">
            ★ = best value in the row. Each deal uses the financing profile it was saved
            with.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="py-6 text-center text-sm text-slate-500">Pick at least two deals.</p>
        </Card>
      )}
    </div>
  );
}
