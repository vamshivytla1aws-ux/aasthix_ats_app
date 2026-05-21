DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_call_signals_type_chk'
      AND conrelid = 'chat_call_signals'::regclass
  ) THEN
    ALTER TABLE chat_call_signals DROP CONSTRAINT chat_call_signals_type_chk;
  END IF;
END $$;

ALTER TABLE chat_call_signals
  ADD CONSTRAINT chat_call_signals_type_chk
  CHECK (
    signal_type IN (
      'offer',
      'answer',
      'ice',
      'leave',
      'presenting',
      'media_repair',
      'moderation_mute',
      'moderation_unmute',
      'moderation_remove',
      'moderation_end'
    )
  );
