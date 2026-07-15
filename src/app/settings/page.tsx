"use client";

import { useEffect, useState } from "react";
import { FinancingProfile } from "@/lib/underwriting";
import { DEFAULT_PROFILE } from "@/lib/defaults";
import { Card, Field, NumberInput } from "@/components/ui";

type FormKeys = keyof FinancingProfile;

interface FieldDef {
  key: FormKeys;
  label: string;
  hint?: string;
  /** display multiplier: percentages stored as fractions are edited as % */
  scale: number;
  step: number;
}

const FIELDS: FieldDef[] = [
  { key: "dscrRate", label: "DSCR note rate (%)", scale: 100, step: 0.125 },
  { key: "ltv", label: "LTV (%)", scale: 100, step: 5 },
  { key: "termYears", label: "Amortization (years)", scale: 1, step: 5 },
  { key: "dscrFloor", label: "DSCR floor", hint: "Lender minimum, usually 1.00", scale: 1, step: 0.05 },
  { key: "helocRate", label: "HELOC rate (%, interest-only)", scale: 100, step: 0.01 },
  { key: "closingCostPct", label: "Closing costs (% of price)", scale: 100, step: 0.5 },
  {
    key: "taxAssessmentRatio",
    label: "Tax assessment ratio (%)",
    hint: "SC investment property = 6%; owner-occupied = 4%",
    scale: 100,
    step: 1,
  },
  {
    key: "millage",
    label: "Effective millage (mills)",
    hint: "Applied to assessed value. ~300 mills ≈ Charleston-area investment rate with school ops.",
    scale: 1000,
    step: 5,
  },
  { key: "vacancyPct", label: "Vacancy reserve (% of rent)", scale: 100, step: 1 },
  { key: "maintenanceMonthly", label: "Maintenance reserve ($/mo)", scale: 1, step: 50 },
];

export default function SettingsPage() {
  const [form, setForm] = useState<Record<FormKeys, string> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toForm(p: FinancingProfile): Record<FormKeys, string> {
    return Object.fromEntries(
      FIELDS.map((f) => [f.key, String(Math.round(p[f.key] * f.scale * 1000) / 1000)]),
    ) as Record<FormKeys, string>;
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setForm(toForm(d.profile ?? DEFAULT_PROFILE)))
      .catch(() => setForm(toForm(DEFAULT_PROFILE)));
  }, []);

  async function save() {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    const profile = Object.fromEntries(
      FIELDS.map((f) => {
        const v = Number(form[f.key]);
        return [f.key, (Number.isFinite(v) ? v : 0) / f.scale];
      }),
    ) as unknown as FinancingProfile;
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      if (!res.ok) throw new Error("save failed");
      setMsg("Saved. New analyses use this profile; saved deals keep their snapshot.");
    } catch {
      setMsg("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      </Card>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-lg font-semibold">Financing profile</h1>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <NumberInput
                value={form[f.key]}
                step={f.step}
                onChange={(v) => setForm((s) => (s ? { ...s, [f.key]: v } : s))}
              />
            </Field>
          ))}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="mt-5 w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {msg ? <p className="mt-2 text-xs text-slate-400">{msg}</p> : null}
      </Card>
      <p className="text-xs text-slate-500">
        These defaults drive every new analysis. Saved deals snapshot the profile they
        were underwritten with, so changing settings never silently rewrites an old
        deal — reopen and re-save a deal to refresh it.
      </p>
    </div>
  );
}
