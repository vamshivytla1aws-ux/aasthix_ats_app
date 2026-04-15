import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { getRailwayUsage } from "@/lib/usage/railwayUsage";
import { maybeBypassCache, resolveUsageDateRange } from "@/lib/usage/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const range = resolveUsageDateRange(url.searchParams);
    const data = await getRailwayUsage(range, { refresh: maybeBypassCache(url.searchParams) });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/usage/railway", error);
    return NextResponse.json({ error: "Failed to fetch Railway usage." }, { status: 500 });
  }
}
