"use client";

import React from "react";
import useSWR from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type MonthRecords = { month: string; attendance: { available: boolean; entries?: Array<{ date: string; status: string; firstCheckIn: string | null; lastCheckOut: string | null; minutes: number }>; totals?: { present: number; late: number; absent: number; notRecorded: number; minutes: number } };
  leave: { available: boolean; requests?: Array<{ id: number; from_date: string; to_date: string; leave_type: string; status: string; paid_days: number; lop_days: number }> }; links: { attendance: string | null; leave: string | null } };
export default function EmployeeMonthlyRecords({ employeeId, enabled }: { employeeId: number; enabled: boolean }) {
  const [month, setMonth] = React.useState(() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
  });
  const { data, error } = useSWR<MonthRecords>(enabled && month ? `/api/hrms/employees/${employeeId}/monthly-records?month=${month}` : null, dashboardFetcher);
  const time = (value: string | null) => value ? new Date(value).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "—";
  return <section className={UI.card + " p-5"}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">Attendance & Leave</h2><p className="mt-1 text-sm text-[var(--ats-text-muted)]">Recorded data only. These records do not change manually entered payslip days.</p></div>
      <label className={UI.label}>Records month<input className={UI.input} type="month" value={month} onChange={event => setMonth(event.target.value)} /></label></div>
    {error ? <p role="alert" className="mt-4">Unable to load this month, or your account does not have access. Please try again.</p> : !data ? <p className="mt-4">Select a month to view records.</p> : <>
      {data.attendance.available ? <>
        <div className="my-4 flex flex-wrap gap-4 text-sm"><span>Present: <strong>{data.attendance.totals?.present}</strong></span><span>Late: <strong>{data.attendance.totals?.late}</strong></span><span>Recorded absent: <strong>{data.attendance.totals?.absent}</strong></span><span>Not recorded: <strong>{data.attendance.totals?.notRecorded}</strong></span></div>
        {data.links.attendance && <a className={UI.secondaryButton + " inline-block mb-3"} href={data.links.attendance}>Manage attendance for this employee</a>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Date</th><th className="p-2">Status</th><th className="p-2">Check in</th><th className="p-2">Check out</th><th className="p-2">Time</th></tr></thead><tbody>
          {data.attendance.entries?.map(row => <tr key={row.date} className="border-t border-[var(--ats-border)]"><td className="p-2 whitespace-nowrap">{row.date}</td><td className="p-2 capitalize">{row.status.replaceAll("_", " ")}</td><td className="p-2">{time(row.firstCheckIn)}</td><td className="p-2">{time(row.lastCheckOut)}</td><td className="p-2">{row.status === "not_recorded" ? "—" : `${Math.floor(row.minutes / 60)}h ${row.minutes % 60}m`}</td></tr>)}
        </tbody></table></div>
      </> : <p className="mt-4 text-sm">Attendance access is not enabled for your account.</p>}
      <h3 className="mt-6 font-semibold">Leave requests overlapping this month</h3>
      {data.links.leave && <a className={UI.secondaryButton + " mt-3 inline-block"} href={data.links.leave}>Manage leave for this employee</a>}
      {!data.leave.available ? <p className="mt-3 text-sm">Leave access is not enabled for your account.</p> : !data.leave.requests?.length ? <p className="mt-3 text-sm">No leave requests for this month.</p> : data.leave.requests.map(request => <div key={request.id} className="mt-3 rounded-lg border border-[var(--ats-border)] p-3 text-sm"><p className="capitalize">{request.leave_type} · {request.status}</p><p>{request.from_date} to {request.to_date}</p><p>Paid days: {request.paid_days} · Unpaid days: {request.lop_days}</p></div>)}
    </>}
  </section>;
}
