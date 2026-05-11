import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { CAREERS_APPLICATION_SOURCE } from "@/lib/careersPublisher";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AlertType = "ongoing" | "upcoming" | "interview_complete" | "renewal";

type AlertRow = {
  id: number;
  type: AlertType;
  message: string;
  created_at: string;
  status: "unread" | "read" | "expired";
  expires_at: string | null;
};

function buildMessage(type: AlertType, candidateName: string, interviewDateTime: string | null) {
  if (type === "ongoing") {
    return `Interview in progress: ${candidateName}`;
  }

  if (!interviewDateTime) {
    return `Interview in 0 mins: ${candidateName}`;
  }

  const diffMs = new Date(interviewDateTime).getTime() - Date.now();
  const mins = Math.max(0, Math.round(diffMs / (1000 * 60)));
  return `Interview in ${mins} mins: ${candidateName}`;
}

function runVisibilityQuery(sql: string, visibilityPredicate: string, userId: number) {
  if (visibilityPredicate === "TRUE") {
    return query(sql);
  }
  return query(sql, [userId]);
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("alerts.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const hasTeam = await hasJobTeamTable();

    const careersVisibility =
      user.role === "admin"
        ? "TRUE"
        : applicationAccessPredicate("a", "$1", hasTeam);

    await query(
      `
      INSERT INTO alerts (user_id, application_id, type, message, status, expires_at)
      SELECT
        $1,
        a.id,
        'careers_apply',
        'New candidate applied for ' || COALESCE(j.title, 'this role'),
        'unread',
        NOW() + INTERVAL '30 days'
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      WHERE COALESCE(a.source, 'UI') = $2
        AND a.created_at >= NOW() - INTERVAL '30 days'
        AND ${careersVisibility}
        AND NOT EXISTS (
          SELECT 1
          FROM alerts existing
          WHERE existing.user_id = $1
            AND existing.application_id = a.id
            AND existing.type = 'careers_apply'
        )
      `,
      [user.user_id, CAREERS_APPLICATION_SOURCE]
    );

    // Generate (upsert) interview alerts for the next +/- 1 hour window.
    const interviewVisibility =
      user.role === "admin"
        ? "TRUE"
        : applicationAccessPredicate("a", "$1", hasTeam);

    const generated = await runVisibilityQuery(
      `
      SELECT
        a.id AS application_id,
        CASE
          WHEN a.interview_datetime BETWEEN (NOW() - INTERVAL '1 hour') AND NOW() THEN 'ongoing'
          ELSE 'upcoming'
        END AS type,
        c.full_name AS candidate_full_name,
        j.title AS job_title,
        a.interview_datetime
      FROM applications a
      JOIN candidates c ON c.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      WHERE ${interviewVisibility}
        AND a.stage = 'Interview'
        AND a.interview_scheduled = true
        AND a.interview_datetime IS NOT NULL
        AND COALESCE(a.interview_substatus, 'scheduled') = 'scheduled'
        AND (
          a.interview_datetime BETWEEN (NOW() - INTERVAL '1 hour') AND NOW()
          OR a.interview_datetime BETWEEN NOW() AND (NOW() + INTERVAL '1 hour')
        )
      ORDER BY
        CASE
          WHEN a.interview_datetime BETWEEN (NOW() - INTERVAL '1 hour') AND NOW() THEN 0
          ELSE 1
        END ASC,
        a.interview_datetime ASC
      `,
      interviewVisibility,
      user.user_id
    );

    for (const row of generated.rows as Array<{
      application_id: number;
      type: AlertType;
      candidate_full_name: string;
      interview_datetime: string | null;
    }>) {
      const message = buildMessage(row.type, String(row.candidate_full_name || "Candidate"), row.interview_datetime);

      await query(
        `
        INSERT INTO alerts (user_id, application_id, type, message, status, expires_at)
        VALUES ($1, $2, $3, $4, 'unread', CASE WHEN $5::timestamptz IS NULL THEN NOW() + INTERVAL '2 hour' ELSE $5::timestamptz + INTERVAL '1 hour' END)
        ON CONFLICT (user_id, application_id, type)
        DO UPDATE SET
          message = EXCLUDED.message,
          expires_at = EXCLUDED.expires_at
        `,
        [user.user_id, row.application_id, row.type, message, row.interview_datetime]
      );
    }

    const url = new URL(request.url);
    const statusParam = (url.searchParams.get("status") || "unread").trim().toLowerCase();
    const typeParam = (url.searchParams.get("type") || "").trim().toLowerCase();
    const qParam = (url.searchParams.get("q") || "").trim().toLowerCase();
    const limitRaw = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const unreadCountRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM alerts
      WHERE user_id = $1
        AND status = 'unread'
        AND (expires_at IS NULL OR expires_at > NOW())
      `,
      [user.user_id]
    );
    const renewalUnreadRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM client_renewal_alerts
      WHERE user_id = $1
        AND status = 'unread'
      `,
      [user.user_id]
    );

    const unreadCount = Number(unreadCountRes.rows?.[0]?.count ?? 0) + Number(renewalUnreadRes.rows?.[0]?.count ?? 0);

    // Qualify with al.* — JOIN applications also has status (and other overlapping names).
    const where: string[] = ["al.user_id = $1"];
    const params: any[] = [user.user_id];
    if (statusParam === "unread" || statusParam === "read" || statusParam === "expired" || statusParam === "all") {
      if (statusParam !== "all") {
        params.push(statusParam);
        where.push(`al.status = $${params.length}`);
      }
    } else {
      params.push("unread");
      where.push(`al.status = $${params.length}`);
    }
    if (typeParam === "ongoing" || typeParam === "upcoming" || typeParam === "careers_apply" || typeParam === "interview_complete" || typeParam === "renewal") {
      params.push(typeParam);
      where.push(`al.type = $${params.length}`);
    }
    if (qParam) {
      params.push(`%${qParam}%`);
      where.push(`al.message ILIKE $${params.length}`);
    }
    if (statusParam !== "expired" && statusParam !== "all") {
      where.push(`(al.expires_at IS NULL OR al.expires_at > NOW())`);
    }
    params.push(limit);

    const alertsRes = await query(
      `
      SELECT
        al.id,
        al.type,
        al.message,
        al.created_at,
        al.status,
        al.expires_at,
        al.application_id,
        app.candidate_id
      FROM alerts al
      LEFT JOIN applications app
        ON app.id = al.application_id
      WHERE ${where.join(" AND ")}
      ORDER BY al.created_at DESC
      LIMIT $${params.length}
      `,
      params
    );
    const renewalRes = await query(
      `
      SELECT
        id + 1000000000 AS id,
        'renewal'::text AS type,
        message,
        created_at,
        status,
        NULL::timestamptz AS expires_at,
        NULL::bigint AS application_id,
        NULL::bigint AS candidate_id
      FROM client_renewal_alerts
      WHERE user_id = $1
        AND ($2 = 'all' OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3
      `,
      [user.user_id, statusParam === "all" ? "all" : statusParam, limit]
    );
    const merged = [...(alertsRes.rows as AlertRow[]), ...(renewalRes.rows as AlertRow[])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return NextResponse.json({ alerts: merged, unreadCount });
  } catch (error) {
    console.error("Error fetching alerts", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requirePermission("alerts.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const { id, ids } = body as { id?: number | string; ids?: Array<number | string> };

    const singleId = id !== undefined && id !== null ? Number(id) : null;
    const listIds = Array.isArray(ids) ? ids.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];
    const idList = (singleId !== null && Number.isFinite(singleId) ? [singleId] : []).concat(listIds);
    const distinctIds = Array.from(new Set(idList)).filter((x) => Number.isFinite(x));

    if (distinctIds.length === 0) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const appAlertIds = distinctIds.filter((x) => x < 1000000000);
    const renewalIds = distinctIds.filter((x) => x >= 1000000000).map((x) => x - 1000000000);
    const updatedIds: number[] = [];

    if (appAlertIds.length > 0) {
      const updated = await query(
        `
        UPDATE alerts
        SET read_at = NOW(),
            status = 'read'
        WHERE id = ANY($1)
          AND user_id = $2
        RETURNING id
        `,
        [appAlertIds, user.user_id]
      );
      updatedIds.push(...updated.rows.map((r: any) => Number(r.id)));
    }

    if (renewalIds.length > 0) {
      const renewalUpdated = await query(
        `
        UPDATE client_renewal_alerts
        SET read_at = NOW(),
            status = 'read'
        WHERE id = ANY($1)
          AND user_id = $2
          AND status = 'unread'
        RETURNING id
        `,
        [renewalIds, user.user_id]
      );
      updatedIds.push(...renewalUpdated.rows.map((r: any) => Number(r.id) + 1000000000));
    }

    return NextResponse.json({ ok: true, ids: updatedIds });
  } catch (error) {
    console.error("Error marking alerts as read", error);
    return NextResponse.json({ error: "Failed to update alerts" }, { status: 500 });
  }
}
