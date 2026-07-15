/**
 * RentCast API client (server-only). Free tier is 50 requests/month —
 * every address lookup costs up to 3 requests (records, value AVM, rent AVM),
 * so results are cached in the lookups table by the API route.
 */

export interface FieldEstimate {
  value: number;
  low?: number;
  high?: number;
}

export interface PropertyFacts {
  address: string;
  formattedAddress?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  yearBuilt?: number;
  latitude?: number;
  longitude?: number;
  /** Monthly HOA fee from county/listing records, when present */
  hoaMonthly?: number;
  /** Most recent annual property tax bill on record (often owner-occ rate!) */
  taxesAnnualLatest?: number;
  taxesYear?: number;
  lastSalePrice?: number;
  lastSaleDate?: string;
  valueEstimate?: FieldEstimate;
  rentEstimate?: FieldEstimate;
}

const BASE = "https://api.rentcast.io/v1";

async function rcFetch(pathname: string, params: Record<string, string>, apiKey: string) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${pathname}?${qs}`, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`RentCast ${pathname} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function rcGet(pathname: string, address: string, apiKey: string) {
  const url = `${BASE}${pathname}?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`RentCast ${pathname} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function lookupProperty(
  address: string,
  apiKey: string,
): Promise<PropertyFacts> {
  const [records, value, rent] = await Promise.allSettled([
    rcGet("/properties", address, apiKey),
    rcGet("/avm/value", address, apiKey),
    rcGet("/avm/rent/long-term", address, apiKey),
  ]);

  const facts: PropertyFacts = { address };

  if (records.status === "fulfilled") {
    const rec: any = Array.isArray(records.value) ? records.value[0] : records.value;
    if (rec) {
      facts.formattedAddress = rec.formattedAddress;
      facts.propertyType = rec.propertyType;
      facts.bedrooms = rec.bedrooms;
      facts.bathrooms = rec.bathrooms;
      facts.squareFootage = rec.squareFootage;
      facts.yearBuilt = rec.yearBuilt;
      facts.latitude = rec.latitude;
      facts.longitude = rec.longitude;
      facts.lastSalePrice = rec.lastSalePrice;
      facts.lastSaleDate = rec.lastSaleDate;
      if (rec.hoa?.fee) facts.hoaMonthly = rec.hoa.fee;
      if (rec.propertyTaxes && typeof rec.propertyTaxes === "object") {
        const years = Object.keys(rec.propertyTaxes).sort();
        const latest = years[years.length - 1];
        if (latest) {
          facts.taxesAnnualLatest = rec.propertyTaxes[latest]?.total;
          facts.taxesYear = Number(latest);
        }
      }
    }
  }

  if (value.status === "fulfilled" && value.value?.price) {
    facts.valueEstimate = {
      value: value.value.price,
      low: value.value.priceRangeLow,
      high: value.value.priceRangeHigh,
    };
  }

  if (rent.status === "fulfilled" && rent.value?.rent) {
    facts.rentEstimate = {
      value: rent.value.rent,
      low: rent.value.rentRangeLow,
      high: rent.value.rentRangeHigh,
    };
  }

  const gotAnything =
    records.status === "fulfilled" ||
    value.status === "fulfilled" ||
    rent.status === "fulfilled";
  if (!gotAnything) {
    const firstError = [records, value, rent].find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    throw new Error(String(firstError?.reason ?? "RentCast lookup failed"));
  }

  return facts;
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

export type CompMode = "sale" | "rental";

export interface CompListing {
  id: string;
  address: string;
  /** List price (sale) or monthly rent (rental) */
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  propertyType?: string;
  yearBuilt?: number;
  daysOnMarket?: number;
  listedDate?: string;
  latitude: number;
  longitude: number;
}

/**
 * Active listings around a point. One call = one API credit, so the API route
 * caches results. Sale listings serve flip/resale comps; long-term rental
 * listings serve LTR rent comps.
 */
export async function searchListings(
  mode: CompMode,
  latitude: number,
  longitude: number,
  radiusMiles: number,
  apiKey: string,
): Promise<CompListing[]> {
  const pathname = mode === "sale" ? "/listings/sale" : "/listings/rental/long-term";
  const data = await rcFetch(
    pathname,
    {
      latitude: String(latitude),
      longitude: String(longitude),
      radius: String(radiusMiles),
      status: "Active",
      limit: "100",
    },
    apiKey,
  );
  const rows: any[] = Array.isArray(data) ? data : [];
  return rows
    .filter((r) => r.latitude && r.longitude && r.price)
    .map((r) => ({
      id: String(r.id ?? r.formattedAddress),
      address: r.formattedAddress ?? "",
      price: r.price,
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      squareFootage: r.squareFootage,
      propertyType: r.propertyType,
      yearBuilt: r.yearBuilt,
      daysOnMarket: r.daysOnMarket,
      listedDate: r.listedDate,
      latitude: r.latitude,
      longitude: r.longitude,
    }));
}
