import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, lookups } from "@/db";
import { normalizeAddress } from "@/lib/rentcast";

/**
 * Free-tier geocoding via OpenStreetMap Nominatim, so the map works even
 * without a RentCast key (RentCast lookups already return coordinates when
 * available; this is the fallback). Cached ~forever — addresses don't move.
 */
const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !address.trim()) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const key = `geo:${normalizeAddress(address)}`;
  const cached = db.select().from(lookups).where(eq(lookups.address, key)).get();
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return NextResponse.json({ ...(cached.payload as object), cached: true });
  }

  try {
    const qs = new URLSearchParams({
      q: address.trim(),
      format: "json",
      limit: "1",
      countrycodes: "us",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
      headers: {
        // Nominatim usage policy requires an identifying User-Agent
        "User-Agent": "real-estate-deal-analyzer/1.0 (personal investment tool)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
    const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!rows.length) {
      return NextResponse.json({ notFound: true }, { status: 200 });
    }
    const payload = {
      lat: Number(rows[0].lat),
      lng: Number(rows[0].lon),
      displayName: rows[0].display_name,
    };
    db.insert(lookups)
      .values({ address: key, payload, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: lookups.address,
        set: { payload, fetchedAt: new Date() },
      })
      .run();
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "geocode failed" },
      { status: 502 },
    );
  }
}
