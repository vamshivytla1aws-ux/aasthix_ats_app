# Permission Matrix — ATS Enterprise RBAC

Reference document for board-level permissions, job team roles, and how they
interact with API visibility rules.

---

## 1. Board-level Permission Keys

Managed per-user in `user_permissions` (admin page at `/admin/permissions`).
Admins always have all permissions.  Non-admin users default to `true` for
any key that has no explicit row.

| Key                   | Scope                              | Grants                                                     |
| --------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `dashboard.view`      | Dashboard / Activity Center        | View dashboard metrics and activity feed                    |
| `candidates.view`     | Candidate list                     | View candidate profiles                                     |
| `candidates.manage`   | Candidate CRUD                     | Create, edit, delete candidates                             |
| `jobs.view`           | Job / Requisition list             | View jobs, requisitions, and their details                  |
| `jobs.manage`         | Job CRUD + workflow                | Create, edit, change status, inline-edit, bulk-update jobs  |
| `pipeline.view`       | Pipeline board                     | View applications and pipeline board                        |
| `pipeline.manage`     | Application stage changes          | Move candidates through stages, schedule interviews, reject |
| `interviews.view`     | Interview list                     | View scheduled interviews and calendar                      |
| `interviews.manage`   | Interview actions                  | Reschedule, cancel, mark no-show                            |
| `vendors.view`        | Client / vendor list               | View client directory                                       |
| `vendors.manage`      | Client CRUD                        | Create, edit, delete client records                         |
| `alerts.view`         | Alert list                         | View and manage personal alert queue                        |
| `approvals.manage`    | Requisition approval               | Approve or reject requisition approval requests             |
| `hiring_manager.view` | Team-scoped visibility             | See jobs/apps where assigned as hiring manager              |
| `recruiter.view`      | Team-scoped visibility             | See jobs/apps where assigned as recruiter                   |
| `coordinator.view`    | Team-scoped visibility             | See jobs/apps where assigned as coordinator                 |

### Default behaviour for non-admin users

- If no `user_permissions` row exists for a key → **allowed** (permissive default).
- Explicit `allowed = false` row → **denied**.
- The `hiring_manager.view`, `recruiter.view`, `coordinator.view` keys act as
  UI-level flags.  Actual data visibility is determined by `job_team` membership
  (see section 2).

---

## 2. Job Team Roles (`job_team` table)

A user can be assigned one or more roles on a specific job.  Team membership
extends visibility: the user sees the job and its applications even if they are
not the `created_by_user_id` owner.

| Role              | Code               | Typical responsibility                                  |
| ----------------- | ------------------ | ------------------------------------------------------- |
| Hiring Manager    | `hiring_manager`   | Owns headcount decision, approves offer, final sign-off |
| Recruiter         | `recruiter`        | Sourcing, screening, candidate management               |
| Coordinator       | `coordinator`      | Interview scheduling, logistics, candidate communication|
| Sourcer           | `sourcer`          | Top-of-funnel sourcing, outreach                        |
| Observer          | `observer`         | Read-only stakeholder (e.g. finance, HRBP)              |

### Uniqueness

Each `(job_id, user_id, role)` triple is unique.  A user can hold multiple
roles on the same job (e.g. both `recruiter` and `coordinator`).

---

## 3. Visibility Rules

### 3.1 Jobs (`GET /api/jobs`)

A user sees a job if **any** of:
1. `jobs.created_by_user_id = user_id` (owner), OR
2. `job_team` contains a row with `user_id` for that `job_id` (team member)

Admin users see all jobs regardless (RBAC short-circuit).

### 3.2 Applications (`GET /api/applications`)

A user sees an application if **any** of:
1. `applications.created_by_user_id = user_id` (owner), OR
2. The application's `job_id` has a `job_team` row for `user_id`

### 3.3 Activity Center (`GET /api/activity-center`)

All four activity queries (alerts, screening, interview follow-ups, empty jobs)
use the same ownership-or-team-membership filter.  This ensures team members
see actionable items for their assigned jobs.

### 3.4 Mutations (PATCH / DELETE)

Write operations still check `created_by_user_id` in their `WHERE` clauses
to ensure only the owner can mutate data.  Team membership is read-only
visibility.  This can be relaxed per-role in a future iteration.

---

## 4. API Endpoints for Team Management

| Endpoint       | Method | Permission     | Behaviour                                      |
| -------------- | ------ | -------------- | ---------------------------------------------- |
| `/api/job-team`| GET    | `jobs.view`    | List members by `?job_id=` or `?user_id=`      |
| `/api/job-team`| POST   | `jobs.manage`  | Add `{ job_id, user_id, role }` — idempotent   |
| `/api/job-team`| DELETE | `jobs.manage`  | Remove by `{ id }` or `{ job_id, user_id, role }` |

---

## 5. File Map

| File                                     | Purpose                                      |
| ---------------------------------------- | -------------------------------------------- |
| `lib/rbac.ts`                            | Board permission keys, `requirePermission()` |
| `lib/jobTeam.ts`                         | Team role constants, `visibleJobIds()` helper |
| `migrations/0040_job_team.sql`           | `job_team` table, indexes, unique constraint  |
| `app/api/job-team/route.ts`             | Team CRUD API                                 |
| `app/api/jobs/route.ts`                 | Job listing — extended with team visibility   |
| `app/api/applications/route.ts`         | Application listing — extended with team vis. |
| `app/api/activity-center/route.ts`      | Activity feed — extended with team visibility |
| `app/(dashboard)/admin/permissions/page.tsx` | UI for managing user permissions         |

---

## 6. Oracle Parity Notes

| ATS Feature          | Oracle Recruiting Cloud Equivalent            |
| -------------------- | --------------------------------------------- |
| `job_team` roles     | Requisition Team (Hiring Manager, Recruiter)  |
| Board permissions    | Security Profiles / Data Roles                |
| Team-based visibility| Requisition Team Membership visibility rules  |
| Approval workflow    | Approval BPM chains (single-level implemented)|
