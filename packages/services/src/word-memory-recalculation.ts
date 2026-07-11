import {
  applyDeterministicPracticeResult,
  initialCard,
  type WordMemoryCard,
  type WordMemoryPracticeKind,
  type WordMemoryPracticeResult,
} from "./word-memory-scheduler.ts";

export type WordMemoryRecalculationEvent = {
  readonly id: string;
  readonly kind: WordMemoryPracticeKind;
  readonly result: WordMemoryPracticeResult;
  readonly reviewedAtMillis: number;
  readonly sessionId: string;
  readonly sessionPosition: number;
};

export type WordMemoryRecalculationResult = {
  readonly card: WordMemoryCard;
  readonly reclassifiedEventCount: number;
};

export const replayPracticeHistory = ({
  createdAtMillis,
  events,
}: {
  readonly createdAtMillis: number;
  readonly events: readonly WordMemoryRecalculationEvent[];
}): WordMemoryRecalculationResult => {
  let card = initialCard({ now: createdAtMillis });
  let reclassifiedEventCount = 0;

  for (const event of [...events].sort(
    (left, right) =>
      left.reviewedAtMillis - right.reviewedAtMillis ||
      left.sessionId.localeCompare(right.sessionId) ||
      left.sessionPosition - right.sessionPosition ||
      left.id.localeCompare(right.id)
  )) {
    const wasScheduledEarly =
      event.kind === "scheduled" &&
      card.phase !== "new" &&
      event.reviewedAtMillis < card.dueAtMillis;
    const kind =
      card.phase === "new"
        ? "scheduled"
        : event.kind === "extra" || wasScheduledEarly
          ? "extra"
          : "scheduled";

    if (wasScheduledEarly) {
      reclassifiedEventCount += 1;
    }

    card = applyDeterministicPracticeResult({
      card,
      kind,
      now: event.reviewedAtMillis,
      result: event.result,
    }).card;
  }

  return { card, reclassifiedEventCount };
};
