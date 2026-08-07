import { FuriganaText, WordMemoryScheduler } from "@jip/services";
import { HashMap, Option, Schema } from "effect";

import * as Domain from "./domain.ts";

type LegacyWord = Schema.Codec.Encoded<typeof Domain.WordEntry>;
type LegacySubmission = Schema.Codec.Encoded<
  typeof Domain.WordPracticeSubmission
>;

export const buildVersion5Data = ({
  legacyBatches,
  legacySubmissions,
  legacyWords,
}: {
  readonly legacyBatches: readonly Schema.Codec.Encoded<
    typeof Domain.WordPracticeBatch
  >[];
  readonly legacySubmissions: readonly LegacySubmission[];
  readonly legacyWords: readonly LegacyWord[];
}) => {
  const batchById = HashMap.fromIterable(
    legacyBatches.map((batch) => [batch.id, batch] as const)
  );
  const sessionIdByBatchId = HashMap.fromIterable(
    legacyBatches.map((batch) => [batch.id, crypto.randomUUID()] as const)
  );
  const words: Schema.Codec.Encoded<typeof Domain.Word>[] = [];
  const states: Schema.Codec.Encoded<typeof Domain.WordMemoryState>[] = [];
  const events: Schema.Codec.Encoded<typeof Domain.WordPracticeEvent>[] = [];
  let submissionsByWordText = HashMap.empty<
    LegacyWord["text"],
    LegacySubmission[]
  >();

  for (const submission of legacySubmissions) {
    const submissionsForWord = Option.getOrUndefined(
      HashMap.get(submissionsByWordText, submission.wordText)
    );

    if (submissionsForWord === undefined) {
      submissionsByWordText = HashMap.set(
        submissionsByWordText,
        submission.wordText,
        [submission]
      );
    } else {
      submissionsForWord.push(submission);
    }
  }

  for (const legacyWord of legacyWords) {
    const wordId = crypto.randomUUID();
    const word: Schema.Codec.Encoded<typeof Domain.Word> = {
      id: wordId,
      text: legacyWord.text,
      translation: legacyWord.translation,
      ...(legacyWord.description === undefined
        ? {}
        : { description: legacyWord.description }),
      createdAt: legacyWord.createdAt,
      updatedAt: legacyWord.updatedAt,
    };
    const submissionsForWord = [
      ...Option.getOrElse(
        HashMap.get(submissionsByWordText, legacyWord.text),
        () => []
      ),
    ].sort((left, right) => left.submittedAt - right.submittedAt);
    let memoryCard = WordMemoryScheduler.initialCard({
      now: legacyWord.createdAt,
    });
    let correctCount = 0;
    let incorrectCount = 0;

    for (const [submissionIndex, submission] of submissionsForWord.entries()) {
      const result =
        submission.result ??
        (FuriganaText.normalizePlainText({
          text: submission.submittedText,
        }) === FuriganaText.normalizePlainText({ text: submission.wordText })
          ? "correct"
          : "incorrect");
      const transition = WordMemoryScheduler.applyDeterministicPracticeResult({
        card: memoryCard,
        kind: "scheduled",
        now: submission.submittedAt,
        rating: result === "correct" ? "good" : "again",
      });
      const legacyBatch =
        submission.batchId === undefined
          ? undefined
          : Option.getOrUndefined(HashMap.get(batchById, submission.batchId));
      const sessionId =
        submission.batchId === undefined
          ? crypto.randomUUID()
          : Option.getOrElse(
              HashMap.get(sessionIdByBatchId, submission.batchId),
              () => crypto.randomUUID()
            );

      events.push({
        id: submission.id,
        wordId,
        submittedText: submission.submittedText,
        reviewedAt: submission.submittedAt,
        result,
        rating: result === "correct" ? "good" : "again",
        stage: "contextRecall",
        kind: "scheduled",
        source: memoryCard.phase === "new" ? "new" : memoryCard.phase,
        previousDueAt: transition.previousDueAtMillis,
        nextDueAt: transition.card.dueAtMillis,
        changedSchedule: transition.changedSchedule,
        phaseBefore: memoryCard.phase,
        phaseAfter: transition.card.phase,
        stabilityAfter: transition.card.stability,
        difficultyAfter: transition.card.difficulty,
        schedulerVersion: WordMemoryScheduler.SchedulerVersion,
        sessionId,
        sessionPosition: submission.batchPosition ?? submissionIndex,
        ...(legacyBatch === undefined
          ? {}
          : { legacyBatchNumber: legacyBatch.batchNumber }),
      });
      memoryCard = transition.card;

      if (result === "correct") {
        correctCount += 1;
      } else {
        incorrectCount += 1;
      }
    }

    const lastSubmission = submissionsForWord[submissionsForWord.length - 1];
    const lastPracticedAt = lastSubmission?.submittedAt ?? legacyWord.createdAt;

    words.push(word);
    states.push({
      wordId,
      stage: "contextRecall",
      stageStartedAt: legacyWord.createdAt,
      stageAttemptCount: submissionsForWord.length,
      stageMasteryStreak: 0,
      phase: memoryCard.phase,
      dueAt: memoryCard.dueAtMillis,
      stability: memoryCard.stability,
      difficulty: memoryCard.difficulty,
      elapsedDays: memoryCard.elapsedDays,
      scheduledDays: memoryCard.scheduledDays,
      learningSteps: memoryCard.learningSteps,
      repetitions: memoryCard.repetitions,
      lapses: memoryCard.lapses,
      attemptCount: submissionsForWord.length,
      correctCount,
      incorrectCount,
      ...(memoryCard.lastReviewAtMillis === undefined
        ? {}
        : { lastReviewAt: memoryCard.lastReviewAtMillis }),
      lastPracticedAt,
      schedulerVersion: WordMemoryScheduler.SchedulerVersion,
      createdAt: legacyWord.createdAt,
      updatedAt: lastSubmission?.submittedAt ?? legacyWord.updatedAt,
    });
  }

  return { events, states, words };
};
