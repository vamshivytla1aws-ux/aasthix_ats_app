import { z } from "zod";

export const STICKY_COLORS = ["yellow", "blue", "green", "pink"] as const;
export type StickyNoteColor = (typeof STICKY_COLORS)[number];

export const VISIBILITIES = ["team", "private"] as const;

/** Lanes on the Team notes board */
export const BOARD_COLUMNS = ["follow_up", "team_sync", "done"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

const pos = z.number().min(0).max(1);

export const createStickyNoteSchema = z.object({
  content: z.string().max(8000).optional().default(""),
  color: z.enum(STICKY_COLORS).optional().default("yellow"),
  pos_x: pos.optional().default(0.85),
  pos_y: pos.optional().default(0.05),
  z_index: z.number().int().min(0).max(9999).optional().default(1),
  is_pinned: z.boolean().optional().default(false),
  visibility: z.enum(VISIBILITIES).optional().default("team"),
  board_column: z.enum(BOARD_COLUMNS).optional().default("follow_up"),
});

export const patchStickyNoteSchema = z
  .object({
    content: z.string().max(8000).optional(),
    color: z.enum(STICKY_COLORS).optional(),
    pos_x: pos.optional(),
    pos_y: pos.optional(),
    z_index: z.number().int().min(0).max(9999).optional(),
    is_pinned: z.boolean().optional(),
    visibility: z.enum(VISIBILITIES).optional(),
    board_column: z.enum(BOARD_COLUMNS).optional(),
  })
  .strict();

export function clampPos(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
