# Simple HRMS and employee login

## HR workflow

1. Open HRMS → Employees & Payslips.
2. Add the employee's name, email, employment details and role **Employee**. This creates their account record; it does not send an email or assign a password.
3. Open the employee record. Use **Details** to edit personal and employment details in one place. In **Login & Access**, confirm the date of joining and choose **Set joining date password**. The initial password is the joining date as **DDMMYYYY**; for example, 13 May 2026 becomes `13052026`. Share the employee sign-in URL and their email directly with the employee. The date is validated and the derived password is hashed.
4. Under **Salary & Payslips**, save salary and optional payroll identity details once. Personal details come from **Details**, without duplicate entry. Generate payslips month by month using the simplified flow in `simple-payslips.md`.
5. Upload, download or delete this employee's documents under **Documents**, or use the existing HR Documents page. The employee can download their own files when allowed.

The short setup checklist opens the relevant section for Profile details, Employee login, Salary setup and Documents. Only name/email are required for the profile. A joining date is required when setting a password; a saved salary is required when generating a payslip. Missing optional bank, PAN, PF and documents do not block generation. Existing configured mandatory document policies are shown as needing attention.

**Attendance & Leave** shows a selected month's recorded attendance, daily entries, and leave requests overlapping that month. Missing attendance is **Not recorded**, never inferred as absence. These records do not change manually entered payslip days. Employee-filtered links open the existing attendance correction and leave approval screens. Team leave access follows the leave manager mapping and assigned request manager.

The HR home keeps Employees & Payslips, Leave, Attendance and Documents visible according to permissions. Less frequent settings and review tools are under **More HR tools**. Payroll approval/lock controls remain available there.

## Employee workflow

The dedicated sign-in path is `/employee/login`; regular HR/recruitment sign-in remains `/login`. Employee sign-in uses the existing account and secure session, not a second duplicate employee record. Staff accounts are directed to staff sign-in when using the employee page. Employees also land on `/hrms` if they use the regular sign-in page.

After sign-in, **My HRMS** shows only explicitly permitted features:

- My Profile: personal and job details, manager and work location.
- My Payslips: own annual CTC, payroll identity/bank details, monthly payslips and yearly statements.
- My Documents: own offer letters and other HR documents.
- My Leave, My Attendance and My Timesheet: existing self-service workflows.
- My Onboarding & Exit and My Performance: own checklists, goals and review history.
- Team Calendar, when its view permission is granted.

The employee menu omits recruitment and administration navigation. Direct employee visits to staff pages are blocked by the workspace view. Relevant APIs independently check permissions and ownership: salary-structure lists/details, payslip lists/details/downloads/yearly statements, document downloads, profile and performance goals. Self attendance does not include the company-wide summary. Employees cannot change salary setup, generate payslips or set other employees' passwords with baseline employee permissions.

Profile and payroll identity fields are read-only in self service. Employees contact HR for corrections. The workspace owner has separate switches for Profile, Payslips, Documents, Leave, Attendance, Timesheets, Onboarding and Performance in **Login & Access**, and on the existing Access Control page. HR can inspect these settings but cannot change them. Turning off Leave, Attendance or Timesheets also disables its self-service actions at the server, even if an older action grant remains. Timesheet viewing no longer grants editing permission, and company totals require company-wide viewing permission. Revoking a feature removes its card/navigation and its API still denies access. No new blanket permissions are granted by visiting the employee sign-in page.

Only authorized HR employee managers can set up passwords here, and only for accounts with the employee role. Passwords use **joining date, not DOB**. Use **Reset password to joining date** after correcting the date if the password needs changing; ordinary profile edits do not silently reset passwords. Password changes revoke prior sessions through token versions. Inactive/resigned employees cannot sign in or keep using an existing HRMS session. Resetting login does not reactivate an inactive employee. No emails are sent by login setup.

The employee record includes **Manage employee profile → Edit employee** for identity, contact, department, designation, employment type, joining date, reporting manager, location, status and login role. Optional values can be cleared individually or together. Name and valid email remain required. Partial profile updates preserve fields omitted from the request. Administrator accounts cannot be edited by ordinary HR managers.

The user explicitly chose **deactivation with retained history**, not permanent profile deletion. **Deactivate employee** blocks login and revokes old sessions; payslips, documents and attendance are retained. Set employment status back to **Active** to reactivate. The employee profile links to their document management screen for upload/download/delete, and existing salary configuration/payslip controls remain under Salary & Payslips. Document and individual payslip deletion remain separate explicit actions.

## Deployment and validation

Apply pending numbered migrations, including `0108_agreed_salary_breakup.sql` and **`0109_payslip_employee_snapshot.sql`**, before running the new application. Railway startup normally runs numbered migrations. Migration 0109 adds nullable JSONB `payslips.employee_snapshot` without backfilling existing rows; it is safe to run again. No new permissions table or second employee account store is introduced.

New payslips store current profile identity and saved payroll identity with their PDF and totals. Later profile or salary edits do not change historical previews or reconstructed PDFs. Already stored PDFs are returned unchanged, including legacy PDFs without a tax sheet. Legacy rows with a null employee snapshot retain their existing fallback; historical details are not guessed. Explicit regeneration remains an HR action subject to existing payroll locks.

Read-only APIs:

- `GET /api/hrms/employees/:id/setup`: authorized staff with employee-directory viewing permission; returns derived checklist, login/salary readiness and employee feature settings. Only the owner is marked able to manage access. Salary/document status respects the viewer's permissions.
- `GET /api/hrms/employees/:id/monthly-records?month=YYYY-MM`: permission-scoped monthly attendance and overlapping leave. Employee sessions may only request their own ID. Neither endpoint creates attendance, leave accruals or employee records.

Local unit/API and isolated browser fixtures cover profile edits and optional clearing, joining-date passwords, deactivation/reactivation, access revocation, direct-record probes, monthly empty/overlapping records, immutable payslip identity and PDF bytes, and Syam's agreed salary/payment adjustment. These tests do not create real employee records or payments.

Release remains pending staging validation: this workspace has no configured database connection and the Railway CLI is signed out. Before production, apply pending migrations in staging, confirm legacy snapshots remain null and PDF bytes unchanged, then use one sample employee to verify login, permitted features, denial after revocation/deactivation, reactivation with history, and the salary generation flow. Run migration 0109 twice to check idempotence. Do not release to production until those staging checks pass.
