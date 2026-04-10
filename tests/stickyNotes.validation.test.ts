import { describe, expect, it } from "vitest";
import {
  clampPos,
  createStickyNoteSchema,
  patchStickyNoteSchema,
} from "@/lib/pipelineStickyNotes/validation";

describe("clampPos", () => {
  it("clamps to 0–1", () => {
    expect(clampPos(-1)).toBe(0);
    expect(clampPos(2)).toBe(1);
    expect(clampPos(0.5)).toBe(0.5);
  });

  it("maps non-finite to 0", () => {
    expect(clampPos(Number.NaN)).toBe(0);
    expect(clampPos(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("createStickyNoteSchema", () => {
  it("applies defaults", () => {
    const r = createStickyNoteSchema.parse({});
    expect(r.pos_x).toBe(0.85);
    expect(r.pos_y).toBe(0.05);
    expect(r.color).toBe("yellow");
    expect(r.visibility).toBe("team");
    expect(r.board_column).toBe("follow_up");
  });

  it("accepts board_column", () => {
    const r = createStickyNoteSchema.parse({ board_column: "done" });
    expect(r.board_column).toBe("done");
  });

  it("rejects invalid color", () => {
    expect(() => createStickyNoteSchema.parse({ color: "red" })).toThrow();
  });
});

describe("patchStickyNoteSchema", () => {
  it("allows partial updates", () => {
    const r = patchStickyNoteSchema.parse({ content: "hi" });
    expect(r.content).toBe("hi");
  });

  it("allows board_column patch", () => {
    const r = patchStickyNoteSchema.parse({ board_column: "team_sync" });
    expect(r.board_column).toBe("team_sync");
  });

  it("rejects unknown keys", () => {
    expect(() => patchStickyNoteSchema.parse({ extra: 1 })).toThrow();
  });
});
