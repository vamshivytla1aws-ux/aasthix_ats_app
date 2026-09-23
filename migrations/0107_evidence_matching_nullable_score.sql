-- Unavailable evaluations are not zero-fit candidates. Existing history is unchanged.
ALTER TABLE single_candidate_match_checks ALTER COLUMN match_score DROP NOT NULL;
