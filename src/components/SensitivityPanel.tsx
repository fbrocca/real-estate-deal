"use client";

import { useMemo, useState } from "react";
import { analyzeDeal, FinancingProfile, PropertyInputs } from "@/lib/underwriting";
import { rentSweep, rateSweep, priceSweep, SweepPoint } from "@/lib/sensitivity";
import { money, num, pct, signedMoney } from "@/lib/format";
import { Card, Stat } from "./ui";

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-100">{display}</span>
      </div>
      <input
        type="range"
        className="w-full accent-emerald-500"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function SweepTable({
  title,
  points,
  formatValue,
  currentValue,
  floor,
}: {
  title: string;
  points: SweepPoint[];
  formatValue: (v: number) => string;
  currentValue: number;
  floor: number;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-4 font-medium">{title.split(" ")[0]}</th>
              <th className="py-1 pr-4 font-medium">DSCR</th>
              <th className="py-1 pr-4 font-medium">Carry</th>
              <th className="py-1 font-medium">All-in carry</th>
            </tr>
          </thead>
          <tbody>
            {points.map((pt) => {
              const isCurrent =
                Math.abs(pt.value - currentValue) <
                Math.abs(points[1].value - points[0].value) / 2;
              return (
                <tr
                  key={pt.value}
                  className={`border-t border-slate-800 ${isCurrent ? "bg-slate-800/60" : ""}`}
                >
                  <td className="py-1.5 pr-4">{formatValue(pt.value)}</td>
                  <td
                    className={`py-1.5 pr-4 font-medium ${
                      pt.dscr >= floor ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {num(pt.dscr, 2)}
                  </td>
                  <td
                    className={`py-1.5 pr-4 ${
                      pt.monthlyCarry >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {signedMoney(pt.monthlyCarry)}
                  </td>
                  <td
                    className={`py-1.5 ${
                      pt.allInCarry >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {signedMoney(pt.allInCarry)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SensitivityPanel({
  inputs,
  profile,
}: {
  inputs: PropertyInputs;
  profile: FinancingProfile;
}) {
  const [rent, setRent] = useState(inputs.rent);
  const [rate, setRate] = useState(profile.dscrRate);
  const [price, setPrice] = useState(inputs.price);

  // Reset sliders when the underlying deal changes materially
  const dealKey = `${inputs.price}|${inputs.rent}|${profile.dscrRate}`;
  const [lastKey, setLastKey] = useState(dealKey);
  if (dealKey !== lastKey) {
    setLastKey(dealKey);
    setRent(inputs.rent);
    setRate(profile.dscrRate);
    setPrice(inputs.price);
  }

  const whatIf = useMemo(
    () => analyzeDeal({ ...inputs, rent, price }, { ...profile, dscrRate: rate }),
    [inputs, profile, rent, rate, price],
  );

  const sweeps = useMemo(
    () => ({
      rent: rentSweep(inputs, profile),
      rate: rateSweep(inputs, profile),
      price: priceSweep(inputs, profile),
    }),
    [inputs, profile],
  );

  if (inputs.price <= 0 || inputs.rent <= 0) return null;

  return (
    <Card title="Sensitivity — what if?">
      <div className="grid gap-4 md:grid-cols-3">
        <Slider
          label="Rent"
          value={rent}
          min={Math.round(inputs.rent * 0.7)}
          max={Math.round(inputs.rent * 1.3)}
          step={25}
          display={`${money(rent)}/mo`}
          onChange={setRent}
        />
        <Slider
          label="DSCR rate"
          value={rate}
          min={0.05}
          max={0.085}
          step={0.00125}
          display={pct(rate, 3)}
          onChange={setRate}
        />
        <Slider
          label="Price"
          value={price}
          min={Math.round((inputs.price * 0.8) / 1000) * 1000}
          max={Math.round((inputs.price * 1.2) / 1000) * 1000}
          step={5000}
          display={money(price)}
          onChange={setPrice}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat
          label="What-if DSCR"
          value={num(whatIf.dscr, 2)}
          tone={whatIf.dscr >= profile.dscrFloor ? "good" : "bad"}
        />
        <Stat
          label="What-if carry"
          value={`${signedMoney(whatIf.monthlyCarry)}/mo`}
          tone={whatIf.monthlyCarry >= 0 ? "good" : "bad"}
        />
        <Stat
          label="What-if all-in"
          value={`${signedMoney(whatIf.allInCarry)}/mo`}
          tone={whatIf.allInCarry >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <SweepTable
          title="Rent ±20%"
          points={sweeps.rent}
          formatValue={(v) => money(v)}
          currentValue={inputs.rent}
          floor={profile.dscrFloor}
        />
        <SweepTable
          title="Rate 5.5–8.0%"
          points={sweeps.rate}
          formatValue={(v) => pct(v, 2)}
          currentValue={profile.dscrRate}
          floor={profile.dscrFloor}
        />
        <SweepTable
          title="Price ±15%"
          points={sweeps.price}
          formatValue={(v) => money(v)}
          currentValue={inputs.price}
          floor={profile.dscrFloor}
        />
      </div>
    </Card>
  );
}
