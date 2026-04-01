-- Add attachment support to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT CHECK (attachment_type IN ('file', 'image', 'gif'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url  TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
