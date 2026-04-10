-- Pipeline board sticky notes (not tied to a job; single-tenant workspace).

BEGIN;

CREATE TABLE IF NOT EXISTS pipeline_board_sticky_notes (
  id BIGSERIAL PRIMARY KEY,
  author_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  pos_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  pos_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  z_index INT NOT NULL DEFAULT 1,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  visibility TEXT NOT NULL DEFAULT 'team',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pipeline_board_sticky_notes_color_check
    CHECK (color IN ('yellow', 'blue', 'green', 'pink')),
  CONSTRAINT pipeline_board_sticky_notes_visibility_check
    CHECK (visibility IN ('team', 'private')),
  CONSTRAINT pipeline_board_sticky_notes_pos_x_check
    CHECK (pos_x >= 0::double precision AND pos_x <= 1::double precision),
  CONSTRAINT pipeline_board_sticky_notes_pos_y_check
    CHECK (pos_y >= 0::double precision AND pos_y <= 1::double precision)
);

CREATE INDEX IF NOT EXISTS pipeline_board_sticky_notes_sort_idx
  ON pipeline_board_sticky_notes (is_pinned DESC, updated_at DESC);

COMMIT;
