-- Team notes lanes (Follow-up / Team sync / Done) on pipeline_board_sticky_notes.

BEGIN;

ALTER TABLE pipeline_board_sticky_notes
  ADD COLUMN board_column TEXT NOT NULL DEFAULT 'follow_up';

ALTER TABLE pipeline_board_sticky_notes
  DROP CONSTRAINT IF EXISTS pipeline_board_sticky_notes_board_column_check;

ALTER TABLE pipeline_board_sticky_notes
  ADD CONSTRAINT pipeline_board_sticky_notes_board_column_check
  CHECK (board_column IN ('follow_up', 'team_sync', 'done'));

CREATE INDEX IF NOT EXISTS pipeline_board_sticky_notes_lane_sort_idx
  ON pipeline_board_sticky_notes (board_column, is_pinned DESC, updated_at DESC);

COMMIT;
