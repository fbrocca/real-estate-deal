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
