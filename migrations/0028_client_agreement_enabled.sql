BEGIN;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS agreement_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE vendors
SET agreement_enabled = COALESCE(invoice_agreement, FALSE)
WHERE agreement_enabled IS DISTINCT FROM COALESCE(invoice_agreement, FALSE);

COMMIT;
