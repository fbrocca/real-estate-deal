import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, lookups } from "@/db";
import { CompListing, CompMode, searchListings } from "@/lib/rentcast";

// Listings move faster than property records, but the free tier is 50
// requests/month — 3 days is the compromise.
const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    lat?: number;
    lng?: number;
    radiusMiles?: number;
    mode?: CompMode;
  };
  const { lat, lng } = body;
  const mode: CompMode = body.mode === "rental" ? "rental" : "sale";
  const radius = Math.min(Math.max(body.radiusMiles ?? 1, 0.25), 5);

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ noApiKey: true }, { status: 200 });
  }

  // ~110m grid so nearby searches share a cache entry
  const key = `comps:${mode}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
  const cached = db.select().from(lookups).where(eq(lookups.address, key)).get();
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return NextResponse.json({
      listings: cached.payload as CompListing[],
      cached: true,
      fetchedAt: cached.fetchedAt.getTime(),
    });
  }

  try {
    const listings = await searchListings(mode, lat, lng, radius, apiKey);
    db.insert(lookups)
      .values({ address: key, payload: listings, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: lookups.address,
        set: { payload: listings, fetchedAt: new Date() },
      })
      .run();
    return NextResponse.json({ listings, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "comps lookup failed" },
      { status: 502 },
    );
  }
}
