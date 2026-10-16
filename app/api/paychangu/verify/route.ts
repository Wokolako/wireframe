import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const headers = new Headers();
  for (const name of ["accept", "authorization", "cookie", "origin"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const base = (process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
  const response = await fetch(`${base}/api/v1/paychangu/verify${request.nextUrl.search}`, {
    headers,
    cache: "no-store",
  });
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
  });
}
