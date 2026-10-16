import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const headers = new Headers();
  for (const name of ["accept", "authorization", "content-type", "cookie", "origin"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetch(`${(process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "")}/api/v1/paychangu/initialize`, {
    method: "POST",
    headers,
    body: await request.text(),
    cache: "no-store",
  });
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
  });
}
