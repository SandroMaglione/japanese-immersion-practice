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
