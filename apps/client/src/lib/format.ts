import { DateTime } from "effect";

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
});

const timeFormatter = new Intl.DateTimeFormat("en", {
  timeStyle: "short",
});

function _dateFromUtc({ dateTime }: { readonly dateTime: DateTime.Utc }) {
  return new Date(DateTime.toEpochMillis(dateTime));
}

export function formatDate({ dateTime }: { readonly dateTime: DateTime.Utc }) {
  return dateFormatter.format(_dateFromUtc({ dateTime }));
}

export function formatDateTime({
  dateTime,
}: {
  readonly dateTime: DateTime.Utc;
}) {
  return dateTimeFormatter.format(_dateFromUtc({ dateTime }));
}

export function formatTime({ dateTime }: { readonly dateTime: DateTime.Utc }) {
  return timeFormatter.format(_dateFromUtc({ dateTime }));
}

export function formatReviewInterval({
  dueAt,
  now,
}: {
  readonly dueAt: number;
  readonly now: number;
}) {
  const remainingMillis = Math.max(0, dueAt - now);
  const seconds = Math.max(1, Math.round(remainingMillis / 1_000));
  const minutes = Math.max(1, Math.round(remainingMillis / 60_000));

  return remainingMillis < 60_000
    ? `${seconds}s`
    : remainingMillis < 3_600_000
      ? `${minutes}m`
      : remainingMillis < 86_400_000
        ? `${Math.round(remainingMillis / 3_600_000)}h`
        : `${Math.round(remainingMillis / 86_400_000)}d`;
}
