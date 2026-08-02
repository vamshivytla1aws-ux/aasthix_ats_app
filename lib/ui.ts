/**
 * Shared enterprise UI tokens and composition classes.
 * Built around semantic CSS variables from globals.css so dark mode works globally.
 */
export const UI = {
  layout: {
    wideTableMinWidth: "min-w-[1360px]",
    wideTableShell: "max-w-[1600px]",
  },
  pageShell:
    "w-full rounded-[var(--ats-radius-xl)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-5 py-5 shadow-[var(--ats-shadow-sm)] md:px-7 md:py-7",
  sectionCard:
    "rounded-[var(--ats-radius-lg)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] shadow-[var(--ats-shadow-sm)]",
  label: "mb-1 block text-sm font-medium text-[var(--ats-text-muted)]",
  input:
    "w-full min-h-11 rounded-[var(--ats-radius-md)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3.5 py-2.5 text-sm text-[var(--ats-text)] " +
    "outline-none transition duration-200 placeholder:text-[var(--ats-text-soft)] hover:border-[var(--ats-border-strong)] focus:border-[var(--ats-primary)] focus:ring-4 focus:ring-[var(--ats-focus)]",
  select:
    "w-full min-h-11 rounded-[var(--ats-radius-md)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3.5 py-2.5 text-sm text-[var(--ats-text)] " +
    "outline-none transition duration-200 hover:border-[var(--ats-border-strong)] focus:border-[var(--ats-primary)] focus:ring-4 focus:ring-[var(--ats-focus)]",
  primaryButton:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--ats-radius-md)] bg-[var(--ats-primary)] px-4 py-2.5 text-sm font-semibold text-white " +
    "shadow-[0_10px_24px_-14px_rgba(11,110,105,0.7)] transition duration-200 hover:bg-[var(--ats-primary-hover)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
  secondaryButton:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--ats-radius-md)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-4 py-2.5 text-sm font-semibold text-[var(--ats-text)] " +
    "shadow-[var(--ats-shadow-sm)] transition duration-200 hover:border-[var(--ats-border-strong)] hover:bg-[var(--ats-bg-panel)] disabled:cursor-not-allowed disabled:opacity-50",
  card:
    "rounded-[var(--ats-radius-lg)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-5 shadow-[var(--ats-shadow-sm)]",

  enterprise: {
    shellGradient:
      "bg-[linear-gradient(120deg,var(--enterprise-shell-from),var(--enterprise-shell-via)_55%,var(--enterprise-shell-to))]",
    onShell: "text-[var(--enterprise-on-shell)]",
    onShellMuted: "text-[color:rgb(239_246_255_/_0.76)]",
    shellSearch:
      "w-full min-w-0 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/60 outline-none ring-offset-0 backdrop-blur-sm focus:border-white/35 focus:ring-2 focus:ring-white/25",
    shellIconButton:
      "inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 p-2.5 text-white transition backdrop-blur-sm hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
    shellGhostButton:
      "inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition backdrop-blur-sm hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
    secondaryNavBar:
      "border-b border-[var(--ats-border)] bg-[color:rgb(248_251_255_/_0.82)] backdrop-blur-xl dark:bg-[color:rgb(9_22_37_/_0.82)]",
    secondaryNavLink:
      "relative inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ats-text-muted)] shadow-[var(--ats-shadow-sm)] transition-all duration-200 hover:border-[var(--ats-border-strong)] hover:bg-[var(--ats-bg-panel-strong)] hover:text-[var(--ats-text)] hover:shadow-[var(--ats-shadow-md)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(37_99_235_/_0.18)]",
    secondaryNavLinkActive:
      "border-[color:rgb(37_99_235_/_0.32)] bg-[color:rgb(37_99_235_/_0.11)] text-[var(--ats-primary)] shadow-[var(--ats-shadow-sm)] ring-1 ring-[color:rgb(37_99_235_/_0.12)]",
    elevatedCard:
      "rounded-[1.35rem] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] shadow-[var(--ats-shadow-md)] ring-1 ring-[rgb(255_255_255_/_0.45)]",
    metricCard:
      "rounded-[1.35rem] border border-[var(--ats-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--ats-bg-elevated)_90%,white_10%),var(--ats-bg-panel))] p-5 shadow-[var(--ats-shadow-md)] ring-1 ring-[rgb(255_255_255_/_0.45)]",
    commandRail:
      "rounded-[1.35rem] border border-[var(--ats-border)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--ats-primary)_14%,var(--ats-bg-elevated)),var(--ats-bg-elevated))] p-4 shadow-[var(--ats-shadow-md)]",
    tableHeaderSticky:
      "sticky top-0 z-20 border-b border-[var(--enterprise-table-border)] bg-[var(--enterprise-table-header)] shadow-sm",
    tableRow:
      "border-b border-[var(--enterprise-table-border)] transition-colors hover:bg-[var(--enterprise-row-hover)]",
    pillInactive:
      "rounded-full border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-1 text-xs font-semibold text-[var(--ats-text-muted)] shadow-[var(--ats-shadow-sm)] transition hover:border-[var(--ats-border-strong)] hover:bg-[var(--ats-bg-panel-strong)] hover:text-[var(--ats-text)]",
    pillActive:
      "rounded-full border border-[color:rgb(37_99_235_/_0.28)] bg-[color:rgb(37_99_235_/_0.12)] px-3 py-1 text-xs font-semibold text-[var(--ats-primary)]",
    subtleText: "text-[var(--ats-text-muted)]",
    headingText: "text-[var(--ats-text)]",
    workspaceStrip:
      "border-b border-[var(--ats-border)] bg-[color:rgb(248_251_255_/_0.78)] backdrop-blur-xl dark:bg-[color:rgb(9_22_37_/_0.72)]",
  },
};
