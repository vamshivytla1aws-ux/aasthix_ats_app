import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn(async () => ({ ok: true, access: { role: "employee", user_id: 12 } })) }));
vi.mock("@/lib/salary/service", () => ({ getLatestSalaryStructure: vi.fn(), getSalaryStructureForMonth: vi.fn() }));
import { GET } from "@/app/api/salary-structures/[employeeId]/route";
import { getLatestSalaryStructure, getSalaryStructureForMonth } from "@/lib/salary/service";
const context = { params: { employeeId: "12" } };
const request = (month = "2026-10") => new Request(`http://localhost/test?month=${month}`);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLatestSalaryStructure).mockResolvedValue({ structure: { id: 2, agreed_breakup: { basic: 510000 } }, components: [] });
  vi.mocked(getSalaryStructureForMonth).mockResolvedValue({ structure: { id: 1, agreed_breakup: null }, components: [] });
});
it("returns the applicable month instead of a later structure", async () => {
  expect((await (await GET(request(), context)).json()).structure.id).toBe(1);
  expect(getSalaryStructureForMonth).toHaveBeenCalledWith(12, 10, 2026);
  expect(getLatestSalaryStructure).not.toHaveBeenCalled();
});
it("keeps the same latest fallback as the generator when no effective structure exists", async () => {
  vi.mocked(getSalaryStructureForMonth).mockResolvedValue(null);
  expect((await (await GET(request(), context)).json()).structure.id).toBe(2);
});
it("preserves the existing latest-structure API without a month parameter", async () => {
  expect((await (await GET(new Request("http://localhost/test"), context)).json()).structure.id).toBe(2);
  expect(getSalaryStructureForMonth).not.toHaveBeenCalled();
});
it.each(["2026-13", "2026-1", "bad", "1999-12", ""])("rejects invalid month %s", async month => {
  expect((await GET(request(month), context)).status).toBe(400);
  expect(getSalaryStructureForMonth).not.toHaveBeenCalled(); expect(getLatestSalaryStructure).not.toHaveBeenCalled();
});
it("rejects another employee's month before loading a structure", async () => {
  expect((await GET(request(), { params: { employeeId: "99" } })).status).toBe(403);
  expect(getSalaryStructureForMonth).not.toHaveBeenCalled(); expect(getLatestSalaryStructure).not.toHaveBeenCalled();
});
