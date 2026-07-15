import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, deals } from "@/db";

export async function GET() {
  const rows = db.select().from(deals).orderBy(desc(deals.updatedAt)).all();
  return NextResponse.json({ deals: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.address || !body?.inputs || !body?.profile) {
    return NextResponse.json(
      { error: "address, inputs, and profile are required" },
      { status: 400 },
    );
  }
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    address: String(body.address),
    nickname: body.nickname ? String(body.nickname) : null,
    status: body.status ?? "analyzing",
    inputs: body.inputs,
    profile: body.profile,
    notes: body.notes ? String(body.notes) : null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(deals).values(row).run();
  return NextResponse.json({ deal: row }, { status: 201 });
}
