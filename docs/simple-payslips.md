# Simple payslip generation

Apply `0108_agreed_salary_breakup.sql` and `0109_payslip_employee_snapshot.sql` with the existing numbered migrations before deploying this change. Railway startup normally applies these migrations. No production migration or salary records were changed during implementation.

In an employee's **Salary & Payslips** tab:

1. Expand **Salary setup and employee details** once.
2. Choose **Use supplied ₹18 lakh offer breakup**, verify the annual components and optional payroll details, select the appropriate effective month, and save the structure. Personal details come from the profile's **Details** section. The supplied breakup is an explicit preset, never automatically applied to other employees.
3. Each month, select the salary month, eligible calendar days before absence, and the complete number of absent/unpaid calendar days. A full month defaults to all calendar days, with zero absence.
4. Preview, then generate. The generated payslip opens for viewing/downloading. Preview performs no writes.
5. For a past payment, optionally enter **Amount already paid**. The difference from calculated net is recorded as a separate **Payment adjustment (actual paid)** earning or deduction. The adjustment has no recurring annual/monthly rate, and the agreed PF, tax and salary rates remain intact. The field clears when changing months.

The supplied annual earnings are ₹5,10,000 basic, ₹2,55,000 HRA, ₹1,70,000 special allowance, ₹2,04,000 conveyance, ₹21,600 employer PF, and ₹6,39,400 other allowance. They total ₹18,00,000. Annual deductions are ₹2,400 professional tax, ₹21,600 employer PF, ₹21,600 employee PF and ₹1,44,200 agreed TDS.

Monthly components use whole rupees as shown in the offer. Full-month earnings are ₹1,50,000, deductions ₹15,817, and net ₹1,34,183. The preset preserves the supplied employer PF presentation and supplied TDS; it does not calculate statutory tax or infer different deductions.

For partial months, the agreed earnings and deductions are each multiplied once by `(eligible days - absence days) / month days`. Individual prorated rows use two decimals; net pay is rounded down to whole rupees and any fractional difference appears as a separate rounding adjustment. Other allowance absorbs full-month component rounding so earnings remain equal to monthly CTC. With this convention, 30/31 days gives ₹1,29,854. It is an explicit convention inferred from the supplied payments, subject to payroll confirmation.

Payment dates supplied by the user map as follows:

| Salary month | Payment date | Amount paid |
| --- | --- | ---: |
| May 2026 | 1 June 2026 | ₹60,598 |
| June 2026 | 1 July 2026 | ₹1,34,183 |
| July 2026 | 1 August 2026 | ₹1,29,854 |
| August 2026 | 1 September 2026 | ₹1,34,183 |

The user confirmed **13 paid working days** for May, after one absence, and explicitly chose actual-payment reconciliation. For May select 14 eligible days before absence, 1 absence (13 payable days), and amount already paid ₹60,598. The 31-day baseline calculates ₹56,270.28 before whole-rupee rounding; a clearly named ₹4,327.72 payment adjustment brings net to ₹60,598. Recorded payments omit the separate whole-rupee rounding entry. This is reconciliation of a known payment, not a claim that the original working-day payroll calculation has been reconstructed. Do not replace the confirmed paid count with 14. July's payment matches 30/31 days mathematically; its actual absence count also needs payroll confirmation.

The simple flow treats the entered absence count as the complete total; it does not silently add approved leave again. Scheduled generation skips agreed-breakup employees for manual attendance review, reports `manualReviewRequired`, respects locked months, and does not overwrite existing payslips. Existing automatic salary structures remain available. Changing an employee's setup requires saving before monthly preview/generation.

The simple PDF uses the existing company background, employee details, a four-column earnings/deductions table, net pay and amount in words. It omits projected tax and inaccurate YTD columns. Existing automatic payslips retain their layout.

Verified with the unit suite, payslip API tests, desktop/mobile browser tests using isolated fixtures, TypeScript, lint, and a rendered one-page PDF preview. These checks do not verify a live database migration or deployment.
