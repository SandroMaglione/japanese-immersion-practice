ALTER TABLE word_memory_states ADD COLUMN introduced_at INTEGER;

UPDATE word_memory_states
SET introduced_at = COALESCE(last_review_at, last_practiced_at, created_at)
WHERE attempt_count > 0;
