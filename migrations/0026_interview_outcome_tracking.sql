BEGIN;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS rejected_in_round_order INT,
  ADD COLUMN IF NOT EXISTS selected_after_rounds INT,
  ADD COLUMN IF NOT EXISTS final_outcome TEXT;

CREATE INDEX IF NOT EXISTS applications_final_outcome_idx
  ON applications(final_outcome, updated_at DESC);

COMMIT;
