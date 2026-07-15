import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, deals } from "@/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const row = db.select().from(deals).where(eq(deals.id, id)).get();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ deal: row });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = db.select().from(deals).where(eq(deals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  db.update(deals)
    .set({
      address: body.address ?? existing.address,
      nickname: body.nickname !== undefined ? body.nickname : existing.nickname,
      status: body.status ?? existing.status,
      inputs: body.inputs ?? existing.inputs,
      profile: body.profile ?? existing.profile,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, id))
    .run();
  const updated = db.select().from(deals).where(eq(deals.id, id)).get();
  return NextResponse.json({ deal: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  db.delete(deals).where(eq(deals.id, id)).run();
  return NextResponse.json({ ok: true });
}
