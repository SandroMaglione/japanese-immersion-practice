import type { WordMemoryPhase } from "./word-memory-scheduler.ts";

export type WordPracticeMode = "introduction" | "guided" | "typed";

export const MinimumTypedRecallCorrectCount = 4;
export const MinimumTypedRecallStability = 3;

export const selectMode = ({
  correctCount,
  introduced,
  phase,
  stability,
}: {
  readonly correctCount: number;
  readonly introduced: boolean;
  readonly phase: WordMemoryPhase;
  readonly stability: number;
}): WordPracticeMode =>
  !introduced
    ? "introduction"
    : phase === "review" &&
        correctCount >= MinimumTypedRecallCorrectCount &&
        stability >= MinimumTypedRecallStability
      ? "typed"
      : "guided";
