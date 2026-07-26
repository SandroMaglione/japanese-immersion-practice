import assert from "node:assert/strict";
import test from "node:test";

import { selectExample } from "./word-practice-presentation.ts";

const Examples = ["first", "second", "third", "fourth"] as const;

test("each shuffled cycle selects every example exactly once", () => {
  const firstCycle = Examples.map((_, attemptCount) =>
    selectExample({
      attemptCount,
      examples: Examples,
      wordId: "word-a",
    })
  );
  const secondCycle = Examples.map((_, position) =>
    selectExample({
      attemptCount: Examples.length + position,
      examples: Examples,
      wordId: "word-a",
    })
  );

  assert.deepEqual([...firstCycle].sort(), [...Examples].sort());
  assert.deepEqual([...secondCycle].sort(), [...Examples].sort());
});

test("selection is stable for the same word and attempt", () => {
  const input = {
    attemptCount: 7,
    examples: Examples,
    wordId: "word-a",
  } as const;

  assert.equal(selectExample(input), selectExample(input));
});

test("adjacent cycle boundaries do not repeat", () => {
  for (let cycle = 1; cycle < 50; cycle += 1) {
    const previousLast = selectExample({
      attemptCount: cycle * Examples.length - 1,
      examples: Examples,
      wordId: "word-a",
    });
    const nextFirst = selectExample({
      attemptCount: cycle * Examples.length,
      examples: Examples,
      wordId: "word-a",
    });

    assert.notEqual(previousLast, nextFirst);
  }
});

test("two examples alternate without repeats", () => {
  const sequence = Array.from({ length: 8 }, (_, attemptCount) =>
    selectExample({
      attemptCount,
      examples: ["first", "second"],
      wordId: "word-b",
    })
  );

  for (let index = 1; index < sequence.length; index += 1) {
    assert.notEqual(sequence[index - 1], sequence[index]);
  }
});

test("empty and single-example pools need no rotation state", () => {
  assert.equal(
    selectExample({
      attemptCount: 10,
      examples: [],
      wordId: "word-c",
    }),
    undefined
  );
  assert.equal(
    selectExample({
      attemptCount: 10,
      examples: ["only"],
      wordId: "word-c",
    }),
    "only"
  );
});
