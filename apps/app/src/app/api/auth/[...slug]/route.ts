import { auth } from "@raypx/auth";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getAllowedMethods() {
  return ["GET", "POST", "OPTIONS"];
}

async function handler(request: NextRequest) {
  return auth.handler(request);
}

export const GET = handler;
export const POST = handler;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: getAllowedMethods().join(", "),
    },
  });
}
