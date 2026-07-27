PRAGMA foreign_keys = ON;

CREATE TABLE words (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  translation TEXT NOT NULL,
  description TEXT,
  examples TEXT,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX words_by_updated_at ON words(updated_at);

CREATE TABLE word_memory_states (
  word_id TEXT PRIMARY KEY NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('new', 'learning', 'review', 'relearning')),
  due_at INTEGER NOT NULL,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  elapsed_days REAL NOT NULL,
  scheduled_days REAL NOT NULL,
  learning_steps INTEGER NOT NULL,
  repetitions INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  incorrect_count INTEGER NOT NULL,
  last_review_at INTEGER,
  last_practiced_at INTEGER NOT NULL,
  scheduler_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX word_memory_states_by_due_at ON word_memory_states(due_at);
CREATE INDEX word_memory_states_by_last_practiced_at ON word_memory_states(last_practiced_at);
CREATE INDEX word_memory_states_by_phase ON word_memory_states(phase);
CREATE INDEX word_memory_states_by_phase_and_due_at ON word_memory_states(phase, due_at);
CREATE INDEX word_memory_states_by_phase_and_last_practiced_at ON word_memory_states(phase, last_practiced_at);
CREATE INDEX word_memory_states_by_updated_at ON word_memory_states(updated_at);

CREATE TABLE word_practice_events (
  id TEXT PRIMARY KEY NOT NULL,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  submitted_text TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('correct', 'incorrect')),
  kind TEXT NOT NULL CHECK (kind IN ('scheduled', 'extra')),
  source TEXT NOT NULL CHECK (source IN ('new', 'learning', 'review', 'relearning', 'extra')),
  previous_due_at INTEGER NOT NULL,
  next_due_at INTEGER NOT NULL,
  changed_schedule INTEGER NOT NULL CHECK (changed_schedule IN (0, 1)),
  phase_after TEXT NOT NULL CHECK (phase_after IN ('new', 'learning', 'review', 'relearning')),
  stability_after REAL NOT NULL,
  difficulty_after REAL NOT NULL,
  scheduler_version TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_position INTEGER NOT NULL,
  legacy_batch_number INTEGER
) STRICT;

CREATE INDEX word_practice_events_by_reviewed_at ON word_practice_events(reviewed_at);
CREATE INDEX word_practice_events_by_session_id ON word_practice_events(session_id);
CREATE INDEX word_practice_events_by_word_id ON word_practice_events(word_id);
