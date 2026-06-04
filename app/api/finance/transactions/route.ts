import { NextResponse } from "next/server";
import { deleteTransaction, getWorkspace, listGroupedTransactions, listTransactions, toMinor, updateTransactionGroup, upsertTransaction } from "@/lib/finance/service";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requirePermission("finance.view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const url = new URL(request.url);
    const workspace = await getWorkspace();
    const transactions = await listTransactions({
      workspaceId: workspace.id,
      kind: url.searchParams.get("kind") ?? "all",
      queryText: url.searchParams.get("q") ?? "",
      fromDate: url.searchParams.get("from") ?? "",
      toDate: url.searchParams.get("to") ?? "",
      sort: (url.searchParams.get("sort") as "asc" | "desc" | null) ?? "desc",
    });
    const groupedTransactions = await listGroupedTransactions({
      workspaceId: workspace.id,
      kind: url.searchParams.get("kind") ?? "all",
      queryText: url.searchParams.get("q") ?? "",
      fromDate: url.searchParams.get("from") ?? "",
      toDate: url.searchParams.get("to") ?? "",
      sort: (url.searchParams.get("sort") as "asc" | "desc" | null) ?? "desc",
    });
    return NextResponse.json({ transactions, groupedTransactions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requirePermission("finance.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = (await request.json()) as {
      kind: string;
      date: string;
      description: string;
      category?: string;
      amount: string | number;
      partnerId?: number | null;
      accountEntryType?: "debit" | "credit" | null;
      payments?: Array<{ partnerId: number; amountMinor: number }>;
      shares?: Array<{ partnerId: number; amountMinor: number }>;
      metadata?: Record<string, unknown>;
    };
    const workspace = await getWorkspace();
    const totalMinor = typeof body.amount === "number" ? body.amount : toMinor(body.amount);
    const transaction = await upsertTransaction({
      workspaceId: workspace.id,
      kind: body.kind as never,
      date: body.date,
      description: body.description,
      category: body.category ?? "General",
      totalMinor,
      partnerId: body.partnerId ?? null,
      accountEntryType: body.accountEntryType ?? null,
      payments: body.payments ?? [],
      shares: body.shares ?? [],
      metadata: body.metadata ?? {},
      createdByUserId: access.access.user_id,
    });
    return NextResponse.json({ transaction });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const access = await requirePermission("finance.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = (await request.json()) as {
      id: number;
      kind: string;
      date: string;
      description: string;
      category?: string;
      amount: string | number;
      partnerId?: number | null;
      accountEntryType?: "debit" | "credit" | null;
      payments?: Array<{ partnerId: number; amountMinor: number }>;
      shares?: Array<{ partnerId: number; amountMinor: number }>;
      metadata?: Record<string, unknown>;
    };
    const workspace = await getWorkspace();
    const totalMinor = typeof body.amount === "number" ? body.amount : toMinor(body.amount);
    const transaction = await updateTransactionGroup({
      id: body.id,
      workspaceId: workspace.id,
      kind: body.kind as never,
      date: body.date,
      description: body.description,
      category: body.category ?? "General",
      totalMinor,
      partnerId: body.partnerId ?? null,
      accountEntryType: body.accountEntryType ?? null,
      payments: body.payments ?? [],
      shares: body.shares ?? [],
      metadata: body.metadata ?? {},
      createdByUserId: access.access.user_id,
    });
    return NextResponse.json({ transaction });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const access = await requirePermission("finance.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id") ?? "0");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const workspace = await getWorkspace();
    await deleteTransaction(workspace.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

