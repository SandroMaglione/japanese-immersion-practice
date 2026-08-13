ALTER TABLE word_memory_states
ADD COLUMN stage_failure_streak INTEGER NOT NULL DEFAULT 0;

ALTER TABLE word_practice_events
ADD COLUMN demoted_to TEXT CHECK (demoted_to IN ('recognition', 'meaningRecall', 'contextRecall'));

UPDATE word_memory_states
SET
  stage_started_at = unixepoch('now') * 1000,
  stage_attempt_count = 0,
  stage_failure_streak = 0,
  stage_mastery_streak = 0,
  phase = 'new',
  due_at = unixepoch('now') * 1000,
  stability = 0,
  difficulty = 0,
  elapsed_days = 0,
  scheduled_days = 0,
  learning_steps = 0,
  repetitions = 0,
  lapses = 0,
  last_review_at = NULL,
  updated_at = unixepoch('now') * 1000
WHERE stage IN ('recognition', 'meaningRecall');
