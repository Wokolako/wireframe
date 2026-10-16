import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "This legacy test endpoint is unavailable." }, { status: 404 });
}
