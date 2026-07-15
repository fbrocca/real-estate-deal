"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { CompListing, CompMode } from "@/lib/rentcast";
import { money } from "@/lib/format";
import { Card } from "./ui";

const MODE_COLOR: Record<CompMode, string> = {
  sale: "#0ea5e9",
  rental: "#8b5cf6",
};

function pillLabel(price: number, mode: CompMode): string {
  if (mode === "sale") {
    return price >= 1_000_000
      ? `$${(price / 1_000_000).toFixed(2)}M`
      : `$${Math.round(price / 1000)}K`;
  }
  return `$${Math.round(price).toLocaleString()}`;
}

function pillIcon(price: number, mode: CompMode): L.DivIcon {
  const label = pillLabel(price, mode);
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${MODE_COLOR[mode]};color:#fff;font-weight:700;font-size:11px;
      padding:2px 7px;border-radius:999px;border:2px solid rgba(255,255,255,.85);
      box-shadow:0 1px 4px rgba(0,0,0,.5);white-space:nowrap;transform:translate(-50%,-50%);
      width:max-content;">${label}</div>`,
    iconSize: [0, 0],
  });
}

const subjectIcon = L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
    <div style="background:#10b981;color:#fff;font-weight:800;font-size:11px;padding:3px 8px;
      border-radius:6px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.6);white-space:nowrap;">
      ★ SUBJECT</div>
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
      border-top:8px solid #10b981;margin-top:-1px;"></div>
  </div>`,
  iconSize: [0, 0],
});

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
  }, [map, lat, lng]);
  return null;
}

export interface MapPanelProps {
  lat: number;
  lng: number;
  address: string;
  onUseRent?: (rent: number) => void;
}

export default function MapPanel({ lat, lng, address, onUseRent }: MapPanelProps) {
  const [mode, setMode] = useState<CompMode>("sale");
  const [radius, setRadius] = useState(1);
  const [listings, setListings] = useState<CompListing[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMsg(null);
    fetch("/api/comps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, radiusMiles: radius, mode }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.noApiKey) {
          setListings([]);
          setMsg(
            "Surrounding listings need a RentCast API key (map itself works without one).",
          );
        } else if (data.error) {
          setListings([]);
          setMsg(`Comps lookup failed: ${data.error}`);
        } else {
          setListings(data.listings ?? []);
          if (data.cached) setMsg("Comps loaded from cache (no API credits used).");
        }
      })
      .catch(() => !cancelled && setMsg("Comps lookup failed (network)."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lat, lng, radius, mode]);

  const stats = useMemo(() => {
    const prices = listings.map((l) => l.price);
    const ppsf = listings
      .filter((l) => l.squareFootage && l.squareFootage > 0)
      .map((l) => l.price / (l.squareFootage as number));
    return {
      count: listings.length,
      medianPrice: median(prices),
      medianPpsf: median(ppsf),
    };
  }, [listings]);

  return (
    <Card title="Map — subject + surrounding listings">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-slate-700">
          {(["sale", "rental"] as CompMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-sm font-semibold transition ${
                mode === m
                  ? m === "sale"
                    ? "bg-sky-500/20 text-sky-300"
                    : "bg-violet-500/20 text-violet-300"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              {m === "sale" ? "For sale" : "For rent"}
            </button>
          ))}
        </div>
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
        >
          <option value={0.5}>0.5 mi</option>
          <option value={1}>1 mi</option>
          <option value={2}>2 mi</option>
          <option value={3}>3 mi</option>
        </select>
        {loading ? <span className="text-xs text-slate-500">Loading comps…</span> : null}
      </div>

      {stats.count > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
          <span className="text-slate-400">
            <span className="font-semibold text-slate-100">{stats.count}</span> active{" "}
            {mode === "sale" ? "sale" : "rental"} listings within {radius} mi
          </span>
          <span className="text-slate-400">
            median{" "}
            <span className="font-semibold text-slate-100">
              {money(stats.medianPrice)}
              {mode === "rental" ? "/mo" : ""}
            </span>
          </span>
          {stats.medianPpsf > 0 ? (
            <span className="text-slate-400">
              median{" "}
              <span className="font-semibold text-slate-100">
                {mode === "sale"
                  ? `${money(stats.medianPpsf)}/sqft`
                  : `${money(stats.medianPpsf, 2)}/sqft/mo`}
              </span>
            </span>
          ) : null}
          {mode === "rental" && onUseRent ? (
            <button
              onClick={() => onUseRent(Math.round(stats.medianPrice / 25) * 25)}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-500"
            >
              Use median as rent →
            </button>
          ) : null}
        </div>
      ) : null}
      {msg ? <p className="mb-2 text-xs text-slate-500">{msg}</p> : null}

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <MapContainer
          center={[lat, lng]}
          zoom={14}
          style={{ height: 440, width: "100%", background: "#0f172a" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <Recenter lat={lat} lng={lng} />
          <Marker position={[lat, lng]} icon={subjectIcon} zIndexOffset={1000}>
            <Popup>
              <div style={{ fontSize: 13 }}>
                <strong>Subject property</strong>
                <br />
                {address}
              </div>
            </Popup>
          </Marker>
          {listings.map((l) => (
            <Marker
              key={`${mode}-${l.id}`}
              position={[l.latitude, l.longitude]}
              icon={pillIcon(l.price, mode)}
            >
              <Popup>
                <div style={{ fontSize: 13, minWidth: 180 }}>
                  <strong>
                    {money(l.price)}
                    {mode === "rental" ? "/mo" : ""}
                  </strong>
                  <br />
                  {l.address}
                  <br />
                  <span style={{ color: "#64748b" }}>
                    {[
                      l.bedrooms !== undefined ? `${l.bedrooms} bd` : null,
                      l.bathrooms !== undefined ? `${l.bathrooms} ba` : null,
                      l.squareFootage ? `${l.squareFootage.toLocaleString()} sqft` : null,
                      l.yearBuilt ? `built ${l.yearBuilt}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {l.squareFootage ? (
                    <>
                      <br />
                      <span style={{ color: "#64748b" }}>
                        {mode === "sale"
                          ? `${money(l.price / l.squareFootage)}/sqft`
                          : `${money(l.price / l.squareFootage, 2)}/sqft/mo`}
                        {l.daysOnMarket !== undefined ? ` · ${l.daysOnMarket} DOM` : ""}
                      </span>
                    </>
                  ) : null}
                  {mode === "rental" && onUseRent ? (
                    <>
                      <br />
                      <button
                        onClick={() => onUseRent(l.price)}
                        style={{
                          marginTop: 6,
                          background: "#7c3aed",
                          color: "#fff",
                          border: 0,
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Use as rent →
                      </button>
                    </>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {mode === "sale"
          ? "Sale comps — what the exit looks like if you flip/resell. Compare median $/sqft against your all-in basis."
          : "Rental comps — what the unit rents for long-term. A listing is asking price, not a signed lease; treat the median as a ceiling."}
      </p>
    </Card>
  );
}
