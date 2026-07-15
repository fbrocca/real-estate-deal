"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { analyzeDeal, FinancingProfile, PropertyInputs } from "@/lib/underwriting";
import { DEFAULT_PROFILE } from "@/lib/defaults";
import type { PropertyFacts } from "@/lib/rentcast";
import type { DealRow } from "@/lib/types";
import { money } from "@/lib/format";
import { Card, Field, NumberInput, inputCls } from "./ui";
import { ResultsPanel } from "./ResultsPanel";
import { SensitivityPanel } from "./SensitivityPanel";

// Leaflet touches `window` at import time — client-only
const MapPanel = dynamic(() => import("./MapPanel"), { ssr: false });

const n = (s: string): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

interface FormState {
  price: string;
  rent: string;
  hoa: string;
  insurance: string;
  taxesAuto: boolean;
  taxesMonthly: string;
  rehab: string;
  listedTaxesAnnual: string;
}

const EMPTY_FORM: FormState = {
  price: "",
  rent: "",
  hoa: "0",
  insurance: "150",
  taxesAuto: true,
  taxesMonthly: "",
  rehab: "0",
  listedTaxesAnnual: "",
};

export function AnalyzerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dealId = searchParams.get("deal");

  const [profile, setProfile] = useState<FinancingProfile>(DEFAULT_PROFILE);
  const [address, setAddress] = useState("");
  const [nickname, setNickname] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [facts, setFacts] = useState<PropertyFacts | null>(null);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loadedDeal, setLoadedDeal] = useState<DealRow | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const set = useCallback(
    (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch })),
    [],
  );

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d.profile && setProfile(d.profile))
      .catch(() => {});
  }, []);

  // Nominatim fallback so the map works even without RentCast coordinates
  const geocode = useCallback(async (addr: string) => {
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      const data = await res.json();
      if (typeof data.lat === "number" && typeof data.lng === "number") {
        setCoords({ lat: data.lat, lng: data.lng });
      }
    } catch {
      // no map, no drama — the analyzer works without it
    }
  }, []);

  // Load an existing deal when linked as /?deal=<id>
  useEffect(() => {
    if (!dealId) return;
    fetch(`/api/deals/${dealId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ deal }: { deal: DealRow }) => {
        setLoadedDeal(deal);
        setAddress(deal.address);
        setNickname(deal.nickname ?? "");
        setProfile(deal.profile);
        const i = deal.inputs;
        setForm({
          price: String(i.price || ""),
          rent: String(i.rent || ""),
          hoa: String(i.hoaMonthly ?? 0),
          insurance: String(i.insuranceMonthly ?? 0),
          taxesAuto: i.taxesMonthly === undefined,
          taxesMonthly: i.taxesMonthly !== undefined ? String(i.taxesMonthly) : "",
          rehab: String(i.rehab ?? 0),
          listedTaxesAnnual:
            i.listedTaxesAnnual !== undefined ? String(i.listedTaxesAnnual) : "",
        });
        geocode(deal.address);
      })
      .catch(() => setLookupMsg("Could not load that saved deal."));
  }, [dealId, geocode]);

  const inputs: PropertyInputs = useMemo(
    () => ({
      price: n(form.price),
      rent: n(form.rent),
      hoaMonthly: n(form.hoa),
      insuranceMonthly: n(form.insurance),
      taxesMonthly: form.taxesAuto ? undefined : n(form.taxesMonthly),
      rehab: n(form.rehab),
      listedTaxesAnnual: form.listedTaxesAnnual ? n(form.listedTaxesAnnual) : undefined,
    }),
    [form],
  );

  const analysis = useMemo(
    () => (inputs.price > 0 && inputs.rent > 0 ? analyzeDeal(inputs, profile) : null),
    [inputs, profile],
  );

  async function runLookup() {
    if (!address.trim()) return;
    setLooking(true);
    setLookupMsg(null);
    setFacts(null);
    setCoords(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (data.noApiKey) {
        setLookupMsg(
          "No RentCast API key configured — running in manual mode. Enter the numbers from the listing below.",
        );
        geocode(address);
        return;
      }
      if (!res.ok) {
        setLookupMsg(`Lookup failed: ${data.error ?? res.statusText}. Enter numbers manually.`);
        geocode(address);
        return;
      }
      const f: PropertyFacts = data.facts;
      setFacts(f);
      if (typeof f.latitude === "number" && typeof f.longitude === "number") {
        setCoords({ lat: f.latitude, lng: f.longitude });
      } else {
        geocode(address);
      }
      setLookupMsg(
        data.cached
          ? "Loaded from cache (no API credits used). Every field is editable."
          : "Fetched from RentCast. Every field below is editable — trust listing evidence over estimates.",
      );
      set({
        ...(f.valueEstimate ? { price: String(Math.round(f.valueEstimate.value)) } : {}),
        ...(f.rentEstimate ? { rent: String(Math.round(f.rentEstimate.value)) } : {}),
        ...(f.hoaMonthly ? { hoa: String(f.hoaMonthly) } : {}),
        ...(f.taxesAnnualLatest
          ? { listedTaxesAnnual: String(Math.round(f.taxesAnnualLatest)) }
          : {}),
      });
    } catch {
      setLookupMsg("Lookup failed (network). Enter numbers manually.");
      geocode(address);
    } finally {
      setLooking(false);
    }
  }

  async function saveDeal() {
    if (!address.trim() || !analysis) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      const payload = {
        address: address.trim(),
        nickname: nickname.trim() || null,
        inputs,
        profile,
      };
      const res = loadedDeal
        ? await fetch(`/api/deals/${loadedDeal.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      setSavedMsg(loadedDeal ? "Deal updated." : "Deal saved.");
      if (!loadedDeal && data.deal) {
        setLoadedDeal(data.deal);
        router.replace(`/?deal=${data.deal.id}`);
      }
    } catch (err) {
      setSavedMsg(`Save failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  function resetForNew() {
    setLoadedDeal(null);
    setAddress("");
    setNickname("");
    setFacts(null);
    setLookupMsg(null);
    setSavedMsg(null);
    setCoords(null);
    setForm(EMPTY_FORM);
    router.replace("/");
  }

  return (
    <div className="space-y-4">
      <Card title={loadedDeal ? "Editing saved deal" : "Property lookup"}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={inputCls}
            placeholder="Street address, e.g. 936 Lansing Dr Unit D, Mt Pleasant, SC 29464"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runLookup()}
          />
          <button
            onClick={runLookup}
            disabled={looking || !address.trim()}
            className="shrink-0 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {looking ? "Looking up…" : "Look up"}
          </button>
          {loadedDeal ? (
            <button
              onClick={resetForNew}
              className="shrink-0 rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              New deal
            </button>
          ) : null}
        </div>
        {lookupMsg ? <p className="mt-2 text-xs text-slate-400">{lookupMsg}</p> : null}
        {facts ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            {facts.bedrooms !== undefined && <span>{facts.bedrooms} bd</span>}
            {facts.bathrooms !== undefined && <span>{facts.bathrooms} ba</span>}
            {facts.squareFootage !== undefined && (
              <span>{facts.squareFootage.toLocaleString()} sqft</span>
            )}
            {facts.yearBuilt !== undefined && <span>built {facts.yearBuilt}</span>}
            {facts.propertyType && <span>{facts.propertyType}</span>}
            {facts.valueEstimate && (
              <span>
                AVM {money(facts.valueEstimate.value)}
                {facts.valueEstimate.low && facts.valueEstimate.high
                  ? ` (${money(facts.valueEstimate.low)}–${money(facts.valueEstimate.high)})`
                  : ""}
              </span>
            )}
            {facts.rentEstimate && (
              <span>
                rent est. {money(facts.rentEstimate.value)}/mo
                {facts.rentEstimate.low && facts.rentEstimate.high
                  ? ` (${money(facts.rentEstimate.low)}–${money(facts.rentEstimate.high)})`
                  : ""}
              </span>
            )}
            {facts.lastSalePrice && (
              <span>
                last sale {money(facts.lastSalePrice)}
                {facts.lastSaleDate ? ` (${facts.lastSaleDate.slice(0, 10)})` : ""}
              </span>
            )}
          </div>
        ) : null}
      </Card>

      {coords ? (
        <MapPanel
          lat={coords.lat}
          lng={coords.lng}
          address={address}
          onUseRent={(r) => set({ rent: String(r) })}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <Card title="Deal inputs" className="h-fit">
          <div className="space-y-3">
            <Field label="Purchase price">
              <NumberInput value={form.price} onChange={(v) => set({ price: v })} step={1000} placeholder="420000" />
            </Field>
            <Field
              label="Monthly rent"
              hint="Use listing/market evidence over AVMs — a pulled rental listing is a ceiling, not a floor."
            >
              <NumberInput value={form.rent} onChange={(v) => set({ rent: v })} step={25} placeholder="2700" />
            </Field>
            <Field label="HOA ($/mo)">
              <NumberInput value={form.hoa} onChange={(v) => set({ hoa: v })} step={10} />
            </Field>
            <Field label="Insurance ($/mo)">
              <NumberInput value={form.insurance} onChange={(v) => set({ insurance: v })} step={10} />
            </Field>
            <Field label="Rehab budget" hint="Goes on the HELOC and into all-in basis — never into DSCR.">
              <NumberInput value={form.rehab} onChange={(v) => set({ rehab: v })} step={1000} />
            </Field>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={form.taxesAuto}
                  onChange={(e) => set({ taxesAuto: e.target.checked })}
                />
                Compute taxes at investment rate
              </label>
              <p className="mt-1 text-xs text-slate-500">
                6% assessment ratio × full millage. Uncheck to enter a known figure.
              </p>
              {!form.taxesAuto ? (
                <div className="mt-2">
                  <NumberInput
                    value={form.taxesMonthly}
                    onChange={(v) => set({ taxesMonthly: v })}
                    step={10}
                    placeholder="Taxes $/mo"
                  />
                </div>
              ) : null}
              <div className="mt-2">
                <Field label="Taxes shown on listing ($/yr, optional)" hint="Used to flag owner-occupied tax figures.">
                  <NumberInput
                    value={form.listedTaxesAnnual}
                    onChange={(v) => set({ listedTaxesAnnual: v })}
                    step={100}
                  />
                </Field>
              </div>
            </div>

            <Field label="Nickname (optional)">
              <input
                className={inputCls}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. Lansing condo"
              />
            </Field>

            <button
              onClick={saveDeal}
              disabled={saving || !analysis || !address.trim()}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              {saving ? "Saving…" : loadedDeal ? "Update deal" : "Save deal"}
            </button>
            {savedMsg ? <p className="text-xs text-slate-400">{savedMsg}</p> : null}
            {!analysis ? (
              <p className="text-xs text-slate-500">
                Enter a price and rent to run the numbers.
              </p>
            ) : null}
          </div>
        </Card>

        <div className="min-w-0">
          {analysis ? (
            <ResultsPanel inputs={inputs} profile={profile} analysis={analysis} />
          ) : (
            <Card>
              <p className="py-12 text-center text-sm text-slate-500">
                Search an address or enter price + rent to see DSCR, PITIA, HELOC draw,
                and cash flow.
              </p>
            </Card>
          )}
        </div>
      </div>

      {analysis ? <SensitivityPanel inputs={inputs} profile={profile} /> : null}
    </div>
  );
}
