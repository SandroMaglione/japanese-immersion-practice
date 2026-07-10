import assert from "node:assert/strict";
import test from "node:test";
import { Array as EffectArray, HashSet } from "effect";

import {
  MaximumActiveLearningWords,
  selectNextWord,
  sessionStateAfterResult,
  sessionStateAfterSelection,
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

const _pools = ({
  activeLearningCount = 0,
  dueLearning = [],
  dueReview = [],
  earlyLearning = [],
  extra = [],
  newWords = [],
}: Partial<WordSessionSelectionPools>): WordSessionSelectionPools => ({
  activeLearningCount,
  dueLearning,
  dueReview,
  earlyLearning,
  extra,
  newWords,
});

const _state = ({
  consecutiveLearningSelections = 0,
  dueReviewSelectionsSinceForced = 0,
  missCounts = {},
  newWordCredit = 0,
  recentWordIds = [],
}: Partial<WordSessionSelectionState>): WordSessionSelectionState => ({
  consecutiveLearningSelections,
  dueReviewSelectionsSinceForced,
  missCounts,
  newWordCredit,
  recentWordIds,
});

test("recent words are excluded when another due word is available", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      dueReview: [
        _candidate({ wordId: "recent" }),
        _candidate({ wordId: "available" }),
      ],
    }),
    randomFraction: 0,
    state: _state({ recentWordIds: ["recent"] }),
  });

  assert.equal(selection?.candidate.wordId, "available");
});

test("the oldest due word is forced after three randomized due reviews", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      dueReview: [
        _candidate({ dueAtMillis: now - 1_000, wordId: "newer" }),
        _candidate({ dueAtMillis: now - 10_000, wordId: "oldest" }),
      ],
    }),
    randomFraction: 0,
    state: _state({ dueReviewSelectionsSinceForced: 3 }),
  });

  assert.equal(selection?.candidate.wordId, "oldest");
});

test("new words respect the active learning cap", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      activeLearningCount: MaximumActiveLearningWords,
      extra: [_candidate({ dueAtMillis: now + 86_400_000, wordId: "extra" })],
      newWords: [_candidate({ phase: "new", wordId: "new" })],
    }),
    randomFraction: 0,
    state: _state({ newWordCredit: 1 }),
  });

  assert.equal(selection?.source, "extra");
});

test("a fresh library seeds enough active words to avoid immediate repeats", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      activeLearningCount: 1,
      earlyLearning: [
        _candidate({
          dueAtMillis: now + 10 * 60_000,
          phase: "learning",
          wordId: "learning",
        }),
      ],
      newWords: [_candidate({ phase: "new", wordId: "new" })],
    }),
    randomFraction: 0,
    state: _state({ newWordCredit: 0, recentWordIds: ["learning"] }),
  });

  assert.equal(selection?.source, "new");
});

test("early learning practice does not advance a correct word's schedule", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      activeLearningCount: 7,
      earlyLearning: [
        _candidate({
          dueAtMillis: now + 10 * 60_000,
          phase: "learning",
          wordId: "learning",
        }),
      ],
      newWords: [_candidate({ phase: "new", wordId: "new" })],
    }),
    randomFraction: 0,
    state: _state({ newWordCredit: 0 }),
  });

  assert.equal(selection?.source, "learning");
  assert.equal(selection?.kind, "extra");
});

test("a word is suppressed after three misses in the session", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      dueReview: [
        _candidate({ wordId: "suppressed" }),
        _candidate({ wordId: "available" }),
      ],
    }),
    randomFraction: 0,
    state: _state({ missCounts: { suppressed: 3 } }),
  });

  assert.equal(selection?.candidate.wordId, "available");
});

test("selection and result updates maintain session pacing", () => {
  const selection = selectNextWord({
    now,
    pools: _pools({
      newWords: [_candidate({ phase: "new", wordId: "new" })],
    }),
    randomFraction: 0,
    state: _state({ newWordCredit: 1 }),
  });

  assert.ok(selection !== undefined);
  const afterSelection = sessionStateAfterSelection({
    selection,
    state: _state({ newWordCredit: 1 }),
  });
  const afterResult = sessionStateAfterResult({
    dueReviewCount: 0,
    result: "incorrect",
    state: afterSelection,
    wordId: selection.candidate.wordId,
  });

  assert.equal(afterSelection.newWordCredit, 0);
  assert.deepEqual(afterSelection.recentWordIds, ["new"]);
  assert.equal(afterResult.missCounts.new, 1);
  assert.ok(afterResult.newWordCredit > 0);
});

test("a rolling bounded pool eventually selects all 5,000 due words", () => {
  const remaining = Array.from({ length: 5_000 }, (_, index) =>
    _candidate({
      dueAtMillis: now - (5_000 - index) * 1_000,
      wordId: `word-${index}`,
    })
  );
  let selectedWordIds = HashSet.empty<string>();
  let state = _state({});

  while (EffectArray.isReadonlyArrayNonEmpty(remaining)) {
    const selection = selectNextWord({
      now,
      pools: _pools({ dueReview: remaining.slice(0, 64) }),
      randomFraction: (HashSet.size(selectedWordIds) * 0.618_033_988_75) % 1,
      state,
    });

    assert.ok(selection !== undefined);
    assert.equal(
      HashSet.has(selectedWordIds, selection.candidate.wordId),
      false
    );
    selectedWordIds = HashSet.add(selectedWordIds, selection.candidate.wordId);
    state = sessionStateAfterSelection({ selection, state });

    const selectedIndex = remaining.findIndex(
      (candidate) => candidate.wordId === selection.candidate.wordId
    );
    assert.notEqual(selectedIndex, -1);
    remaining.splice(selectedIndex, 1);
  }

  assert.equal(HashSet.size(selectedWordIds), 5_000);
});
