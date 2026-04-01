import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getCareersPublisherUserId, CAREERS_APPLICATION_SOURCE } from "@/lib/careersPublisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated recruiter: funnel + applications sourced from the public careers page.
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const publisherConfigured = getCareersPublisherUserId();
    const isPublisher = publisherConfigured != null && publisherConfigured === user.user_id;

    if (!isPublisher) {
      return NextResponse.json({
        isCareersPublisher: false,
        message: "Analytics are available only for the account configured as CAREERS_PUBLISHER_USER_ID.",
      });
    }

    const url = new URL(request.url);
    const daysRaw = Number(url.searchParams.get("days") || "30");
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;

    const funnel = await query(
      `
      SELECT event_type, job_id, COUNT(*)::int AS cnt
      FROM careers_funnel_events
      WHERE publisher_user_id = $1
        AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
      GROUP BY event_type, job_id
      ORDER BY event_type ASC, cnt DESC
      `,
      [user.user_id, days]
    );

    const applications = await query(
      `
      SELECT
        a.job_id,
        j.title AS job_title,
        COUNT(*)::int AS applications
      FROM applications a
      JOIN jobs j ON j.id = a.job_id AND j.created_by_user_id = $1
      WHERE a.created_by_user_id = $1
        AND COALESCE(a.source, 'UI') = $2
        AND a.created_at >= NOW() - ($3::int * INTERVAL '1 day')
      GROUP BY a.job_id, j.title
      ORDER BY applications DESC, j.title ASC
      `,
      [user.user_id, CAREERS_APPLICATION_SOURCE, days]
    );

    const totals = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'view_jd')::int AS jd_views,
        COUNT(*) FILTER (WHERE event_type = 'start_apply')::int AS apply_starts,
        COUNT(*) FILTER (WHERE event_type = 'submit_success')::int AS submit_events
      FROM careers_funnel_events
      WHERE publisher_user_id = $1
        AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
      `,
      [user.user_id, days]
    );

    const careerAppsTotal = await query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM applications
      WHERE created_by_user_id = $1
        AND COALESCE(source, 'UI') = $2
        AND created_at >= NOW() - ($3::int * INTERVAL '1 day')
      `,
      [user.user_id, CAREERS_APPLICATION_SOURCE, days]
    );

    const t = totals.rows[0] as { jd_views: number; apply_starts: number; submit_events: number };
    const appsTotal = Number((careerAppsTotal.rows[0] as { cnt: number })?.cnt ?? 0);
    const jdViews = Number(t?.jd_views ?? 0);

    return NextResponse.json({
      isCareersPublisher: true,
      windowDays: days,
      funnel: funnel.rows,
      applicationsByJob: applications.rows,
      summary: {
        jd_views: jdViews,
        apply_starts: Number(t?.apply_starts ?? 0),
        funnel_submits: Number(t?.submit_events ?? 0),
        applications_recorded: appsTotal,
        /** Submitted applications / JD detail views (0 if no views) */
        conversion_rate:
          jdViews > 0 ? Math.round((appsTotal / jdViews) * 10000) / 100 : null,
      },
    });
  } catch (error) {
    console.error("careers/analytics GET", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
