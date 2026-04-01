/**
 * Shared dashboard UI tokens — light + dark (scoped under .dashboard-root.dark).
 */
export const UI = {
  pageShell:
    "w-full rounded-2xl border border-slate-200/90 bg-white px-6 py-6 shadow-ats-sm shadow-ats-ring md:px-8 md:py-7 " +
    "dark:border-slate-700/80 dark:bg-slate-900/80 dark:shadow-none",
  sectionCard:
    "rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring dark:border-slate-700/80 dark:bg-slate-900/80 dark:shadow-none",
  label: "mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400",
  input:
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 " +
    "outline-none transition duration-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 " +
    "dark:border-slate-600 dark:bg-slate-950/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500/50 dark:focus:ring-indigo-500/20",
  select:
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 " +
    "outline-none transition duration-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 " +
    "dark:border-slate-600 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:border-indigo-500/50 dark:focus:ring-indigo-500/20",
  primaryButton:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-white " +
    "shadow-sm shadow-indigo-600/10 transition duration-200 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 " +
    "dark:bg-indigo-500 dark:hover:bg-indigo-400",
  secondaryButton:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 " +
    "shadow-ats-sm transition duration-200 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 " +
    "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700/80",
  card:
    "rounded-2xl border border-slate-200/90 bg-white p-6 shadow-ats-sm shadow-ats-ring dark:border-slate-700/80 dark:bg-slate-900/80 dark:shadow-none",

  enterprise: {
    shellGradient:
      "bg-gradient-to-r from-[#0b1f3f] via-[#0f3566] to-[#164a7e] dark:from-[#020617] dark:via-[#0f172a] dark:to-[#1e293b]",
    onShell: "text-slate-50",
    onShellMuted: "text-slate-50/75",
    shellSearch:
      "w-full min-w-0 rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-sm text-white placeholder:text-white/60 outline-none ring-offset-0 focus:border-white/50 focus:ring-2 focus:ring-white/30",
    shellIconButton:
      "inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/15 p-2 text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
    shellGhostButton:
      "inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
    secondaryNavBar:
      "border-b border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white dark:border-slate-700/80 dark:from-slate-950 dark:to-slate-900",
    /** Enterprise pill / soft button tabs (MegaMenuNavbar secondary row). */
    secondaryNavLink:
      "relative inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-slate-200/90 bg-white px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-300 dark:shadow-none dark:hover:border-slate-500 dark:hover:bg-slate-800 dark:hover:text-white",
    secondaryNavLinkActive:
      "border-indigo-300 bg-indigo-50 text-indigo-900 shadow-md shadow-indigo-900/5 ring-1 ring-indigo-200/70 dark:border-indigo-500/45 dark:bg-indigo-950/55 dark:text-indigo-100 dark:shadow-indigo-950/20 dark:ring-indigo-500/25",
    elevatedCard:
      "rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-900 dark:shadow-none",
    tableHeaderSticky:
      "sticky top-0 z-20 border-b border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-900/95",
    tableRow: "border-b border-slate-200 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/80",
    pillInactive:
      "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
    pillActive:
      "rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:border-blue-500/50 dark:bg-blue-950/60 dark:text-blue-200",
  },
};
