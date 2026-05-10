# Phase 2 Rollout / Rollback Runbook

## Feature Flags

Set in Railway (web service):

- `NEXT_PUBLIC_IA_V2_ENABLED`
- `NEXT_PUBLIC_DASHBOARD_V2_ENABLED`
- `NEXT_PUBLIC_PERSONALIZATION_V2_ENABLED`
- `NEXT_PUBLIC_INTELLIGENCE_V3_ENABLED`
- `NEXT_PUBLIC_AUTOMATION_V3_ENABLED`
- `NEXT_PUBLIC_FORECAST_V3_ENABLED`
- `NEXT_PUBLIC_CALIBRATION_V3_ENABLED`

Values accepted: `1|true|yes|on` (enabled), anything else (disabled).

## Release Gate Checklist

1. Run migrations through `0068_workspace_personalization.sql`.
2. Deploy to staging and verify:
   - top navigation domain grouping
   - dashboard widget move/save
   - workspace context strip persistence
3. Validate existing flows:
   - jobs CRUD, pipeline movement, interview scheduling, alerts actions
   - attendance/timesheet self and admin paths
4. Run `npm run build` cleanly on CI.

## Fast Rollback (No Redeploy)

1. Set all 3 flags to `false`.
1a. Set all Phase 3 flags to `false`.
2. Redeploy web (or restart instance if env hot-reload is unavailable).
3. Hard refresh browser and clear CDN cache if stale JS is served.

Expected result:

- v1 nav and v1 dashboard paths are restored immediately.
- personalization records remain in DB but are ignored while flags are off.
- phase3 intelligence/automation/forecast routes become no-op responses with existing ATS behavior unchanged.

## Hard Rollback (Deploy-Level)

If issues persist:

1. Roll back Railway web service to last successful deployment.
2. Keep all 3 Phase 2 flags disabled.
3. Re-verify login, dashboard, jobs, pipeline, and interviews.
