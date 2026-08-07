import assert from "node:assert/strict";
import test from "node:test";

import {
  selectNextWord,
  type WordSessionSelectionCandidate,
  type WordSessionSelectionPools,
  type WordSessionSelectionState,
} from "./word-session-selection.ts";

const now = Date.UTC(2026, 0, 1);

const _candidate = ({
  dueAtMillis = now,
  phase = "review",
  wordId,
}: {
  readonly dueAtMillis?: number;
  readonly phase?: WordSessionSelectionCandidate["phase"];
  readonly wordId: string;
}): WordSessionSelectionCandidate => ({
  difficulty: 5,
  dueAtMillis,
  lastPracticedAtMillis: now - 86_400_000,
  phase,
  retrievability: 0.8,
  scheduledDays: 1,
  wordId,
});

const state: WordSessionSelectionState = {
  consecutiveLearningSelections: 0,
  dueReviewSelectionsSinceForced: 0,
  missCounts: {},
  newWordCredit: 0,
  recentWordIds: [],
};

const _pools = (
  input: Partial<WordSessionSelectionPools>
): WordSessionSelectionPools => ({
  activeLearningCount: 0,
  dueLearning: [],
  dueReview: [],
  earlyLearning: [],
  extra: [],
  newWords: [],
  ...input,
});

test("due learning is selected before reviews and new words", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      dueLearning: [_candidate({ phase: "learning", wordId: "learning" })],
      dueReview: [_candidate({ wordId: "review" })],
      newWords: [_candidate({ phase: "new", wordId: "new" })],
    }),
    randomFraction: 0,
    state,
  });

  assert.equal(selection?.candidate.wordId, "learning");
});

test("due reviews are selected before new words", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      dueReview: [_candidate({ wordId: "review" })],
      newWords: [_candidate({ phase: "new", wordId: "new" })],
    }),
    randomFraction: 0,
    state,
  });

  assert.equal(selection?.candidate.wordId, "review");
});

test("future and extra cards are never selected", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      dueLearning: [
        _candidate({
          dueAtMillis: now + 60_000,
          phase: "learning",
          wordId: "future-learning",
        }),
      ],
      dueReview: [
        _candidate({ dueAtMillis: now + 60_000, wordId: "future-review" }),
      ],
      extra: [_candidate({ wordId: "extra" })],
    }),
    randomFraction: 0,
    state,
  });

  assert.equal(selection, undefined);
});

test("all due new words are eligible without a credit or daily cap", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      activeLearningCount: 100,
      newWords: [
        _candidate({ phase: "new", wordId: "first" }),
        _candidate({ phase: "new", wordId: "second" }),
      ],
    }),
    randomFraction: 0.99,
    state,
  });

  assert.equal(selection?.candidate.wordId, "second");
});
