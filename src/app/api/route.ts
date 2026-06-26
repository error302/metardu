import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "METARDU API",
    version: "1.0.0",
    status: "operational",
  });
}