const fs = require('fs');
const files = [
  'app/(dashboard)/analytics/page.tsx',
  'app/(dashboard)/usage/page.tsx',
  'app/(dashboard)/audit/page.tsx',
  'app/(dashboard)/alerts/page.tsx',
  'app/(dashboard)/activity-center/page.tsx',
  'app/(dashboard)/roadmap/page.tsx',
  'app/(dashboard)/screening/page.tsx',
  'app/(dashboard)/training/manage/page.tsx',
  'app/(dashboard)/recruiter/copilot/page.tsx',
  'app/(dashboard)/recruiter/workload/page.tsx',
  'app/(dashboard)/governance/page.tsx'
];

const replacements = [
  [/border-slate-200/g, 'border-[var(--ats-border)]'],
  [/border-slate-300/g, 'border-[var(--ats-border)]'],
  [/dark:border-slate-700/g, ''],
  [/dark:border-slate-800/g, ''],
  [/border-slate-100/g, 'border-[var(--ats-border)]'],

  [/bg-white/g, 'bg-[var(--ats-bg-panel)]'],
  [/dark:bg-slate-900/g, ''],
  
  [/bg-slate-50/g, 'bg-[var(--ats-bg-elevated)]'],
  [/dark:bg-slate-800/g, ''],
  
  [/bg-slate-100/g, 'bg-[var(--ats-bg-subtle)]'],

  [/text-slate-900/g, 'text-[var(--ats-text)]'],
  [/dark:text-slate-100/g, ''],
  [/dark:text-white/g, ''],

  [/text-slate-800/g, 'text-[var(--ats-text)]'],
  [/dark:text-slate-200/g, ''],

  [/text-slate-700/g, 'text-[var(--ats-text)]'],

  [/text-slate-600/g, 'text-[var(--ats-text-muted)]'],
  [/dark:text-slate-300/g, ''],

  [/text-slate-500/g, 'text-[var(--ats-text-muted)]'],
  [/dark:text-slate-400/g, ''],
  
  [/bg-indigo-600/g, 'bg-[var(--ats-primary)]'],
  [/text-white/g, 'text-[var(--ats-primary-foreground)]'],
  [/text-indigo-600/g, 'text-[var(--ats-primary)]'],
  [/text-indigo-500/g, 'text-[var(--ats-primary)]'],
  
  [/bg-indigo-50/g, 'bg-[var(--ats-primary)]\\/10'],
  [/text-indigo-700/g, 'text-[var(--ats-primary)]'],
  [/dark:bg-indigo-950/g, ''],
  [/dark:text-indigo-300/g, ''],
  [/dark:text-indigo-400/g, ''],
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log('Skipping ' + file);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  for (const [regex, replacement] of replacements) {
    content = content.replace(regex, replacement);
  }
  
  // Clean up double spaces in classNames
  content = content.replace(/ [ ]+/g, ' ');
  content = content.replace(/className=" /g, 'className="');
  content = content.replace(/ "/g, '"');
  
  fs.writeFileSync(file, content);
  console.log('Updated ' + file);
}
