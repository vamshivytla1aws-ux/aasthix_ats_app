-- Auto-assign employee codes for users without one
BEGIN;

CREATE SEQUENCE IF NOT EXISTS employee_code_seq START 1001;

UPDATE users
SET employee_code = 'EMP-' || nextval('employee_code_seq')
WHERE employee_code IS NULL OR employee_code = '';

COMMIT;
