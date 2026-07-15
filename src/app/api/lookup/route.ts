import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, lookups } from "@/db";
import { lookupProperty, normalizeAddress, PropertyFacts } from "@/lib/rentcast";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — protect the free tier

export async function POST(req: NextRequest) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !address.trim()) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ noApiKey: true }, { status: 200 });
  }

  const key = normalizeAddress(address);
  const cached = db.select().from(lookups).where(eq(lookups.address, key)).get();
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return NextResponse.json({
      facts: cached.payload as PropertyFacts,
      cached: true,
      fetchedAt: cached.fetchedAt.getTime(),
    });
  }

  try {
    const facts = await lookupProperty(address.trim(), apiKey);
    db.insert(lookups)
      .values({ address: key, payload: facts, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: lookups.address,
        set: { payload: facts, fetchedAt: new Date() },
      })
      .run();
    return NextResponse.json({ facts, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "lookup failed" },
      { status: 502 },
    );
  }
}
