"use client";

type TableFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  hideSearch?: boolean;
  location: string;
  onLocationChange: (value: string) => void;
  status: "All" | "Active" | "Placed";
  onStatusChange: (value: "All" | "Active" | "Placed") => void;
  skillsetInput: string;
  onSkillsetInputChange: (value: string) => void;
  locations: string[];
  onClear: () => void;
};

export default function TableFilters(props: TableFiltersProps) {
  const {
    search,
    onSearchChange,
    hideSearch,
    location,
    onLocationChange,
    status,
    onStatusChange,
    skillsetInput,
    onSkillsetInputChange,
    locations,
    onClear,
  } = props;
  const skillChips = skillsetInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
      <div className={["grid grid-cols-1 gap-3", hideSearch ? "lg:grid-cols-3" : "lg:grid-cols-5"].join(" ")}>
        {!hideSearch ? (
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Search
            </label>
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by name or email"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950/50 dark:text-slate-100"
            />
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Location</label>
          <select
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Skillset</label>
          <input
            type="text"
            value={skillsetInput}
            onChange={(e) => onSkillsetInputChange(e.target.value)}
            placeholder="Filter by skills (e.g. React, AWS)"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {skillChips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {skillChips.map((chip, index) => (
                <button
                  key={`${chip}-${index}`}
                  type="button"
                  onClick={() => {
                    const next = skillChips.filter((_, i) => i !== index).join(", ");
                    onSkillsetInputChange(next);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  title={`Remove ${chip}`}
                >
                  <span>{chip}</span>
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value as "All" | "Active" | "Placed")}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All</option>
              <option value="Active">Active</option>
              <option value="Placed">Placed</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

