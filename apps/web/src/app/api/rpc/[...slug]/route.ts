import { handleRPCRequest } from "@raypx/rpc/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: NextRequest) {
  return handleRPCRequest(request);
}

export const GET = handler;
export const POST = handler;
