"use client";

import * as Popover from "@radix-ui/react-popover";
import { addDays, format, isValid, parse } from "date-fns";
import { CalendarDays, Check, ChevronDown, Clock3, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { UI } from "@/lib/ui";
import { ATS_TIMEZONE_LABEL } from "@/lib/timezones";
import type { DateRangeValue } from "@/lib/uiTypes";

function fromIsoDate(value?: string | null) {
  if (!value) return undefined;
  const result = parse(value.slice(0, 10), "yyyy-MM-dd", new Date());
  return isValid(result) ? result : undefined;
}

function toIsoDate(value?: Date) {
  return value && isValid(value) ? format(value, "yyyy-MM-dd") : "";
}

function displayDate(value?: string | null) {
  const date = fromIsoDate(value);
  return date ? format(date, "dd MMM yyyy") : "";
}

type CommonProps = { className?: string; disabled?: boolean; required?: boolean; id?: string; "aria-label"?: string };
type FieldVariant = "default" | "dark";
const darkFieldClass = "border-[#3a4660] bg-[#0b1223] text-slate-100 placeholder:text-slate-500 hover:border-[#52617f] focus:border-teal-400 focus:ring-teal-400/15";

export function DatePicker({ value, onChange, placeholder = "Select date", min, max, className = "", disabled, required, id, variant = "default", "aria-label": ariaLabel }: CommonProps & { value: string; onChange: (value: string) => void; placeholder?: string; min?: string; max?: string; variant?: FieldVariant }) {
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const selected = fromIsoDate(value);
  const minDate = fromIsoDate(min);
  const maxDate = fromIsoDate(max);
  const disabledMatcher = minDate || maxDate ? [{ before: minDate ?? new Date(1900, 0, 1), after: maxDate ?? new Date(2100, 11, 31) }] : undefined;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button id={id ?? generatedId} type="button" disabled={disabled} aria-label={ariaLabel ?? placeholder} data-required={required || undefined} className={`${UI.input} flex items-center justify-between gap-3 text-left ${variant === "dark" ? darkFieldClass : ""} ${!value ? "text-[var(--ats-text-soft)]" : ""} ${className}`}>
          <span className="flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-[var(--ats-primary)]" /><span className="truncate">{displayDate(value) || placeholder}</span></span><ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ats-text-soft)] transition ${open ? "rotate-180" : ""}`} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="ats-calendar-popover" sideOffset={6} align="start" collisionPadding={12}>
          <DayPicker className="ats-calendar" mode="single" weekStartsOn={1} selected={selected} onSelect={(date) => { onChange(toIsoDate(date)); setOpen(false); }} disabled={disabledMatcher} captionLayout="dropdown" startMonth={minDate} endMonth={maxDate} />
          <div className="mt-2 flex items-center justify-between border-t border-[var(--ats-border)] pt-2">
            <div className="flex gap-1"><button type="button" className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--ats-primary)] hover:bg-[var(--ats-bg-panel-strong)]" onClick={() => { onChange(toIsoDate(new Date())); setOpen(false); }}>Today</button><button type="button" className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--ats-primary)] hover:bg-[var(--ats-bg-panel-strong)]" onClick={() => { onChange(toIsoDate(addDays(new Date(), 1))); setOpen(false); }}>Tomorrow</button></div>
            {value ? <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--ats-text-muted)] hover:bg-[var(--ats-bg-panel)]" onClick={() => { onChange(""); setOpen(false); }}><X className="h-3.5 w-3.5" />Clear</button> : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function DateRangePicker({ value, onChange, placeholder = "Select date range", className = "" }: CommonProps & { value: DateRangeValue; onChange: (value: DateRangeValue) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected: DateRange | undefined = value.from || value.to ? { from: fromIsoDate(value.from), to: fromIsoDate(value.to) } : undefined;
  const label = value.from ? `${displayDate(value.from)}${value.to ? ` - ${displayDate(value.to)}` : ""}` : placeholder;
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" className={`${UI.input} flex items-center justify-between gap-3 text-left ${!value.from ? "text-[var(--ats-text-soft)]" : ""} ${className}`}><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--ats-primary)]" />{label}</span><ChevronDown className="h-4 w-4 text-[var(--ats-text-soft)]" /></button></Popover.Trigger><Popover.Portal><Popover.Content className="ats-calendar-popover" sideOffset={6} align="start"><DayPicker className="ats-calendar" mode="range" weekStartsOn={1} selected={selected} onSelect={(range) => onChange({ from: toIsoDate(range?.from), to: toIsoDate(range?.to) })} captionLayout="dropdown" /><div className="mt-2 flex justify-end border-t border-[var(--ats-border)] pt-2"><button type="button" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--ats-primary)]" onClick={() => setOpen(false)}><Check className="mr-1 inline h-3.5 w-3.5" />Apply</button></div></Popover.Content></Popover.Portal></Popover.Root>;
}

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const label = format(new Date(2020, 0, 1, hours, minutes), "hh:mm a");
  return { value, label };
});

export function TimePicker({ value, onChange, placeholder = "Select time", className = "", disabled, showTimezone = true, variant = "default" }: CommonProps & { value: string; onChange: (value: string) => void; placeholder?: string; showTimezone?: boolean; variant?: FieldVariant }) {
  const listId = useId();
  const current = TIME_OPTIONS.find((option) => option.value === value)?.label ?? value;
  return <div className={`relative ${className}`}><Clock3 className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--ats-primary)]" /><input type="text" list={listId} value={current} disabled={disabled} placeholder={placeholder} onChange={(event) => { const raw = event.target.value; const option = TIME_OPTIONS.find((item) => item.label.toLowerCase() === raw.toLowerCase() || item.value === raw); onChange(option?.value ?? raw); }} onBlur={(event) => { const raw = event.target.value.trim(); const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(raw); if (!match) return; let hour = Number(match[1]); const minute = Number(match[2]); const suffix = match[3]?.toUpperCase(); if (suffix === "PM" && hour < 12) hour += 12; if (suffix === "AM" && hour === 12) hour = 0; if (hour < 24 && minute < 60) onChange(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`); }} className={`${UI.input} pl-10 ${showTimezone ? "pr-14" : ""} ${variant === "dark" ? darkFieldClass : ""}`} /><datalist id={listId}>{TIME_OPTIONS.map((option) => <option key={option.value} value={option.label} />)}</datalist>{showTimezone ? <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-bold ${variant === "dark" ? "bg-slate-700 text-teal-300" : "bg-[var(--ats-bg-panel-strong)] text-[var(--ats-primary)]"}`}>{ATS_TIMEZONE_LABEL}</span> : null}</div>;
}

export function DateTimePicker({ value, onChange, className = "", disabled, variant = "default" }: CommonProps & { value: string; onChange: (value: string) => void; variant?: FieldVariant }) {
  const [date, time = ""] = value ? value.split("T") : ["", ""];
  return <div className={`grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] ${className}`}><DatePicker value={date} onChange={(next) => onChange(next ? `${next}T${time || "09:00"}` : "")} disabled={disabled} variant={variant} /><TimePicker value={time.slice(0, 5)} onChange={(next) => onChange(date ? `${date}T${next}` : `${toIsoDate(new Date())}T${next}`)} disabled={disabled} variant={variant} /></div>;
}

export function MonthYearPicker({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const [yearValue, monthValue] = value ? value.split("-") : [String(new Date().getFullYear()), ""];
  const years = useMemo(() => Array.from({ length: 16 }, (_, index) => new Date().getFullYear() - 10 + index), []);
  return <div className={`grid grid-cols-2 gap-2 ${className}`}><select className={UI.select} value={monthValue} onChange={(event) => onChange(`${yearValue}-${event.target.value}`)} aria-label="Month"><option value="">Month</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1).padStart(2, "0")}>{format(new Date(2020, index, 1), "MMMM")}</option>)}</select><select className={UI.select} value={yearValue} onChange={(event) => onChange(`${event.target.value}-${monthValue || "01"}`)} aria-label="Year">{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>;
}
