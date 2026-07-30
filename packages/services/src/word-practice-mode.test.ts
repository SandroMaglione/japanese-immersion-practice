import assert from "node:assert/strict";
import test from "node:test";

import {
  MinimumTypedRecallCorrectCount,
  MinimumTypedRecallStability,
  selectMode,
} from "./word-practice-mode.ts";

test("a word starts with a non-graded introduction", () => {
  assert.equal(
    selectMode({
      correctCount: 0,
      introduced: false,
      phase: "new",
      stability: 0,
    }),
    "introduction"
  );
});

test("learning and relearning words use guided recall", () => {
  for (const phase of ["new", "learning", "relearning"] as const) {
    assert.equal(
      selectMode({
        correctCount: 20,
        introduced: true,
        phase,
        stability: 20,
      }),
      "guided"
    );
  }
});

test("review words unlock typed recall only after both thresholds", () => {
  assert.equal(
    selectMode({
      correctCount: MinimumTypedRecallCorrectCount,
      introduced: true,
      phase: "review",
      stability: MinimumTypedRecallStability,
    }),
    "typed"
  );
  assert.equal(
    selectMode({
      correctCount: MinimumTypedRecallCorrectCount - 1,
      introduced: true,
      phase: "review",
      stability: MinimumTypedRecallStability,
    }),
    "guided"
  );
  assert.equal(
    selectMode({
      correctCount: MinimumTypedRecallCorrectCount,
      introduced: true,
      phase: "review",
      stability: MinimumTypedRecallStability - 0.01,
    }),
    "guided"
  );
});
