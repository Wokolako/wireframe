import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Order repair by URL secret is disabled. Payment confirmation is verified by PayChangu." }, { status: 410 });
}
