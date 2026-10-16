import { NextResponse } from "next/server";

function unsupported() {
  return NextResponse.json({ error: "Saved addresses are not part of this marketplace checkout." }, { status: 410 });
}

export async function GET() {
  return unsupported();
}

export async function POST() {
  return unsupported();
}
