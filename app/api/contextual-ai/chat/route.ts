import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { loadApplicationContext, loadCandidateContext, loadJobContext } from "@/lib/contextualAi/loadContext";
import { runContextualCopilotChat, type ContextualHistoryTurn } from "@/lib/contextualAi/chat";
import { checkContextualAiRateLimit } from "@/lib/contextualAi/rateLimit";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LEN = 8000;
const RATE_MAX = Number(process.env.CONTEXTUAL_AI_RATE_MAX ?? 40) || 40;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const CONTEXT_CAP = Math.min(120_000, Math.max(8000, Number(process.env.CONTEXTUAL_AI_CONTEXT_CHAR_CAP ?? 48_000) || 48_000));

type Scope = "job" | "candidate" | "application";

function canUseScope(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>, scope: Scope) {
  if (access.role === "admin") return true;
  if (scope === "job") return access.permissions["jobs.view"] !== false;
  if (scope === "candidate") return access.permissions["candidates.view"] !== false;
  if (scope === "application") return access.permissions["pipeline.view"] !== false;
  return false;
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("dashboard.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const access = auth.access;

    const body = (await request.json()) as {
      scope?: Scope;
      entityId?: number;
      message?: string;
      history?: ContextualHistoryTurn[];
    };

    const scope = body.scope;
    const entityId = body.entityId;
    const message = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!scope || (scope !== "job" && scope !== "candidate" && scope !== "application")) {
      return NextResponse.json({ error: "Invalid scope (job | candidate | application)." }, { status: 400 });
    }
    if (!Number.isFinite(entityId) || !entityId || entityId <= 0) {
      return NextResponse.json({ error: "entityId is required." }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "message is required." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LEN) {
      return NextResponse.json({ error: `Message too long (max ${MAX_MESSAGE_LEN} characters).` }, { status: 400 });
    }

    if (!canUseScope(access, scope)) {
      return NextResponse.json({ error: "You do not have permission to use the copilot on this record." }, { status: 403 });
    }

    const rl = checkContextualAiRateLimit(access.user_id, { max: RATE_MAX, windowMs: RATE_WINDOW_MS });
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many copilot requests. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    let contextLoaded: { text: string } | { error: "not_found" };
    if (scope === "job") {
      contextLoaded = await loadJobContext(entityId, CONTEXT_CAP);
    } else if (scope === "candidate") {
      contextLoaded = await loadCandidateContext(entityId, CONTEXT_CAP);
    } else {
      contextLoaded = await loadApplicationContext(entityId, access.user_id, CONTEXT_CAP);
    }

    if ("error" in contextLoaded) {
      return NextResponse.json({ error: "Record not found or not accessible." }, { status: 404 });
    }

    const safeHistory: ContextualHistoryTurn[] = history
      .filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
      .slice(-10)
      .map((h) => ({ role: h.role, content: h.content.slice(0, 12_000) }));

    const result = await runContextualCopilotChat({
      contextBlock: contextLoaded.text,
      userMessage: message,
      history: safeHistory,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }

    await writeAuditLog({
      actorUserId: access.user_id,
      action: "contextual_ai.chat",
      metadata: {
        scope,
        entityId,
        messageChars: message.length,
        model: process.env.CONTEXTUAL_AI_MODEL || "gpt-4o",
      },
    });

    return NextResponse.json({ reply: result.text });
  } catch (e) {
    console.error("POST /api/contextual-ai/chat", e);
    return NextResponse.json({ error: "Failed to run copilot." }, { status: 500 });
  }
}
