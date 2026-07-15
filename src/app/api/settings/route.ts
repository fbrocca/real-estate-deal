import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { DEFAULT_PROFILE } from "@/lib/defaults";
import type { FinancingProfile } from "@/lib/underwriting";

const ROW_ID = "default";

export async function GET() {
  const row = db.select().from(settings).where(eq(settings.id, ROW_ID)).get();
  return NextResponse.json({ profile: row?.profile ?? DEFAULT_PROFILE });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { profile?: Partial<FinancingProfile> }
    | null;
  if (!body?.profile) {
    return NextResponse.json({ error: "profile is required" }, { status: 400 });
  }
  const profile: FinancingProfile = { ...DEFAULT_PROFILE, ...body.profile };
  db.insert(settings)
    .values({ id: ROW_ID, profile })
    .onConflictDoUpdate({ target: settings.id, set: { profile } })
    .run();
  return NextResponse.json({ profile });
}
