# Oracle Parity Roadmap — ATS Requisition & Job Lifecycle

Comparison reference: **Oracle Recruiting Cloud (ORC)** requisition lifecycle and
Oracle HCM Cloud job-status FSM.

---

## 1. Job / Requisition Status State Machine

### 1.1 Canonical states

| State              | Description                                             | Oracle equivalent          |
| ------------------ | ------------------------------------------------------- | -------------------------- |
| **Draft**          | JD authored, not yet submitted for approval              | Draft                      |
| **Pending Approval** | Awaiting hiring-manager or finance sign-off            | Pending Approval           |
| **Open**           | Actively sourcing candidates                             | Open / Approved            |
| **On Hold**        | Temporarily paused (budget, reorg, etc.)                 | On Hold / Frozen           |
| **Filled**         | All positions filled — no further sourcing               | Filled                     |
| **Closed**         | Cancelled or expired — no hire made                      | Closed / Cancelled         |

### 1.2 Allowed transitions (directed graph)

```
Draft ──────────► Pending Approval ──────► Open
  │                   │                      │
  │                   ▼                      ├──► On Hold ──► Open
  │                 Draft (reject)           │        │
  │                   │                      ├──► Filled
  └────────────────►  Open (fast-track)      │
                      │                      └──► Closed
                      ▼
                    Closed
```

Adjacency list (implemented in `lib/jobStatusTransitions.ts`):

| From               | Allowed targets                         |
| ------------------ | --------------------------------------- |
| Draft              | Pending Approval, Open, Closed          |
| Pending Approval   | Open, Draft, Closed                     |
| Open               | On Hold, Filled, Closed                 |
| On Hold            | Open, Closed                            |
| Filled             | Open (reopen), Closed                   |
| Closed             | Draft (reopen), Open (reopen)           |

### 1.3 API enforcement

All three job-mutation endpoints validate transitions **server-side**:

| Endpoint                  | Method | Behaviour on invalid transition                  |
| ------------------------- | ------ | ------------------------------------------------ |
| `/api/jobs/[id]`          | PUT    | 400 `{ code: "INVALID_STATUS_TRANSITION", … }`   |
| `/api/jobs/[id]`          | PATCH  | 400 `{ code: "INVALID_STATUS_TRANSITION", … }`   |
| `/api/jobs/batch`         | POST   | per-item `{ ok: false, error: "..." }`            |

Error payload shape:

```json
{
  "error": "Status transition \"Draft\" → \"Filled\" is not allowed. Valid targets from \"Draft\": Pending Approval, Open, Closed",
  "code": "INVALID_STATUS_TRANSITION",
  "from": "Draft",
  "to": "Filled",
  "allowed": ["Pending Approval", "Open", "Closed"]
}
```

### 1.4 Disposition-reason enforcement

Transitions into **Closed**, **Filled**, or **On Hold** additionally require a
valid `disposition_reason_id` (category `job_close` from the
`disposition_reasons` table). This is checked *after* the transition graph
validation passes.

---

## 2. Oracle Parity Checklist

### 2.1 Completed

| Feature                                 | Oracle equivalent                        | Status |
| --------------------------------------- | ---------------------------------------- | ------ |
| Status state-machine with from→to rules | Requisition Status FSM                   | ✅     |
| Disposition reasons on terminal states  | Close Reason / Hold Reason               | ✅     |
| Disposition audit events                | Audit Trail (who changed, when, why)     | ✅     |
| Inline-edit status + openings           | Requisition Worklist inline edit         | ✅     |
| Bulk status update (batch API)          | Mass Update Requisitions                 | ✅     |
| RBAC gate (`jobs.manage`)               | Requisition security profile             | ✅     |
| Pipeline board (drag-and-drop)          | Candidate Progression Board              | ✅     |
| Interview scheduling + decision loop    | Interview Management                     | ✅     |
| SLA badges (overdue, due soon)          | Requisition Aging / SLA Dashboard        | ✅     |
| Careers portal (public job board)       | Oracle Candidate Experience (CX)         | ✅     |
| Screening tests (auto-trigger)          | Screening / Assessment                   | ✅     |
| Alert system (upcoming, ongoing)        | Notifications & Alerts                   | ✅     |

| Requisition approval workflow              | Approval Workflows (single-level)          | ✅     |
| Approval panel on job detail              | Requisition Approval Actions               | ✅     |
| Approval indicator on requisitions list   | Worklist Pending Indicator                 | ✅     |
| Draft→Pending Approval auto-transition    | Submit for Approval action                 | ✅     |
| Approve→Open / Reject→Draft auto-update   | Approval Outcome auto-status               | ✅     |

### 2.2 Planned / Not Yet Implemented

| Feature                                   | Oracle equivalent                          | Priority |
| ----------------------------------------- | ------------------------------------------ | -------- |
| Multi-level approval chains               | Approval Workflows (BPM / multi-step)      | High     |
| Approval delegation / escalation          | Delegation Rules                           | High     |
| Offer management (letter, comp, approval) | Offer Management module                    | High     |
| Onboarding checklist handoff              | Onboarding (OLC) integration               | Medium   |
| Configurable workflow builder (no-code)   | Transaction Design Studio (TDS)            | Medium   |
| Position management / headcount control   | Position Synchronisation                   | Medium   |
| Requisition templates                     | Requisition Template Library               | Low      |
| Configurable status labels per tenant     | Setup & Maintenance → Requisition Phases   | Low      |
| Budget integration / compensation bands   | Workforce Compensation integration         | Low      |
| Advanced analytics / BI publisher         | OTBI / BI Publisher Reports                | Low      |

---

## 3. File Map

| File                                | Purpose                                          |
| ----------------------------------- | ------------------------------------------------ |
| `lib/jobStatusTransitions.ts`       | State machine, `validateStatusTransition()`      |
| `lib/requisitionWorkflow.ts`        | Step labels, normalization, ordering             |
| `lib/dispositionRules.ts`           | Pure rule: which statuses need a reason           |
| `lib/dispositionAudit.ts`           | DB: validate reason, record audit event          |
| `app/api/jobs/[id]/route.ts`        | PUT + PATCH — single-job mutations               |
| `app/api/jobs/batch/route.ts`       | POST — bulk job mutations                        |
| `migrations/0038_disposition_audit.sql` | `disposition_reasons` + `disposition_events`  |
| `migrations/0039_approval_requests.sql` | `approval_requests` table + indexes          |
| `app/api/approvals/route.ts`            | GET + POST + PATCH — approval CRUD           |
| `components/enterprise/ApprovalPanel.tsx` | Approval panel UI for job detail            |
| `app/(dashboard)/requisitions/page.tsx` | Requisition worklist UI                      |
