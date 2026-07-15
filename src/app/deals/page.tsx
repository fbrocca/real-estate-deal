"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { analyzeDeal } from "@/lib/underwriting";
import type { DealRow } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import type { DealStatus } from "@/db/schema";
import { money, num, pct, signedMoney } from "@/lib/format";
import { Card } from "@/components/ui";

type SortKey = "dscr" | "allInCarry" | "allInBasis" | "capRate" | "updatedAt";

const STATUS_TONE: Record<DealStatus, string> = {
  analyzing: "bg-slate-700 text-slate-200",
  offer: "bg-sky-500/20 text-sky-300",
  under_contract: "bg-amber-500/20 text-amber-300",
  owned: "bg-emerald-500/20 text-emerald-300",
  passed: "bg-rose-500/20 text-rose-300",
};

export default function DealsPage() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("dscr");

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((d) => setDeals(d.deals ?? []))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const analyzed = deals.map((d) => ({ deal: d, a: analyzeDeal(d.inputs, d.profile) }));
    const dir = sortKey === "allInBasis" ? 1 : -1; // lower basis is better
    return analyzed.sort((x, y) => {
      switch (sortKey) {
        case "dscr":
          return dir * (x.a.dscr - y.a.dscr);
        case "allInCarry":
          return dir * (x.a.allInCarry - y.a.allInCarry);
        case "allInBasis":
          return dir * (x.a.allInBasis - y.a.allInBasis);
        case "capRate":
          return dir * (x.a.capRate - y.a.capRate);
        case "updatedAt":
          return (
            new Date(y.deal.updatedAt).getTime() - new Date(x.deal.updatedAt).getTime()
          );
      }
    });
  }, [deals, sortKey]);

  async function setStatus(id: string, status: DealStatus) {
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, status } : d)));
    await fetch(`/api/deals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this deal?")) return;
    setDeals((ds) => ds.filter((d) => d.id !== id));
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
  }

  const TH = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className={`cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium hover:text-white ${
        sortKey === k ? "text-emerald-400" : ""
      }`}
      onClick={() => setSortKey(k)}
    >
      {label}
      {sortKey === k ? " ↓" : ""}
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Saved deals</h1>
        <Link
          href="/"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          + Analyze new
        </Link>
      </div>

      {loading ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-500">
            No saved deals yet. Analyze a property and hit “Save deal”.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500">
                <th className="px-3 py-2 text-left font-medium">Property</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <TH k="dscr" label="DSCR" />
                <TH k="allInCarry" label="All-in carry" />
                <TH k="capRate" label="Cap" />
                <TH k="allInBasis" label="Basis" />
                <th className="px-3 py-2 text-left font-medium">Rent</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ deal, a }) => (
                <tr key={deal.id} className="border-b border-slate-800/60 hover:bg-slate-900/60">
                  <td className="px-3 py-2">
                    <Link href={`/?deal=${deal.id}`} className="font-medium text-slate-100 hover:text-emerald-400">
                      {deal.nickname || deal.address}
                    </Link>
                    {deal.nickname ? (
                      <div className="text-xs text-slate-500">{deal.address}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={deal.status}
                      onChange={(e) => setStatus(deal.id, e.target.value as DealStatus)}
                      className={`rounded px-2 py-1 text-xs ${STATUS_TONE[deal.status]} border-0 bg-slate-800`}
                    >
                      {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      a.dscrVerdict === "PASS"
                        ? "text-emerald-400"
                        : a.dscrVerdict === "MARGINAL"
                          ? "text-amber-400"
                          : "text-rose-400"
                    }`}
                  >
                    {num(a.dscr, 2)}
                  </td>
                  <td className={`px-3 py-2 ${a.allInCarry >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {signedMoney(a.allInCarry)}/mo
                  </td>
                  <td className="px-3 py-2">{pct(a.capRate, 1)}</td>
                  <td className="px-3 py-2">{money(a.allInBasis)}</td>
                  <td className="px-3 py-2">{money(deal.inputs.rent)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(deal.id)}
                      className="text-xs text-slate-500 hover:text-rose-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
