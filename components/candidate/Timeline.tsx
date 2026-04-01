type TimelineItem = {
  id: number;
  type: "Applied" | "Interview" | "Selected" | "Rejected" | "Screening" | "Screening Failed";
  description: string;
  created_at: string;
};

function tone(type: TimelineItem["type"]) {
  if (type === "Applied") return "bg-blue-500";
  if (type === "Interview") return "bg-amber-500";
  if (type === "Selected") return "bg-emerald-500";
  if (type === "Rejected") return "bg-rose-500";
  if (type === "Screening Failed") return "bg-orange-500";
  return "bg-slate-500";
}

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

type Density = "comfortable" | "compact" | "ultra";

export default function Timeline({
  items,
  density = "ultra",
}: {
  items: TimelineItem[];
  density?: Density;
}) {
  const rootPad = density === "comfortable" ? "py-3" : density === "compact" ? "py-2" : "py-1";
  const titleClass = density === "ultra" ? "text-[10px]" : "text-xs";
  const itemGap = density === "comfortable" ? "gap-2" : density === "compact" ? "gap-1.5" : "gap-1";
  const itemPad = density === "comfortable" ? "py-1" : "py-0.5";
  const descClass = density === "ultra" ? "text-[10px]" : "text-xs";

  return (
    <div className={["border-b border-gray-200", rootPad].join(" ")}>
      <div className={["mb-0.5 font-medium text-gray-700", titleClass].join(" ")}>Timeline</div>

      {items.length === 0 ? (
        <div className="py-0.5 text-xs text-gray-500">
          No timeline activity yet.
        </div>
      ) : (
        <ol className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id} className={["flex items-start text-xs text-gray-600 hover:bg-gray-50 transition", itemGap, itemPad].join(" ")}>
              <span className={["mt-1 h-1.5 w-1.5 rounded-full", tone(item.type)].join(" ")} />
              <div>
                <div>
                  {item.type} — {formatDateTime(item.created_at)}
                </div>
                <div className={[descClass, "text-gray-500"].join(" ")}>{item.description}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

