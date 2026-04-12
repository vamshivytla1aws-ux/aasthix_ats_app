BEGIN;

ALTER TABLE careers_funnel_events
  DROP CONSTRAINT IF EXISTS careers_funnel_events_type_check;

ALTER TABLE careers_funnel_events
  ADD CONSTRAINT careers_funnel_events_type_check
  CHECK (
    event_type IN (
      'view_job_list',
      'view_jd',
      'start_apply',
      'submit_success',
      'share_modal_open',
      'copy_public_link',
      'share_linkedin_click',
      'share_x_click',
      'copy_instagram_caption',
      'copy_short_caption',
      'copy_ready_post_text',
      'open_public_page'
    )
  );

COMMIT;
