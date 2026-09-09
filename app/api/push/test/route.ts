import { NextResponse } from "next/server";
import { sendPush } from "@/lib/push";

export async function POST() {
  await sendPush("IBAM Monitor — test", "Web Push sudah aktif.", "/");
  return NextResponse.json({ ok: true });
}