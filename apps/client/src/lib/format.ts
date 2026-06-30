import { DateTime } from "effect";

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime({
  dateTime,
}: {
  readonly dateTime: DateTime.Utc;
}) {
  return dateTimeFormatter.format(new Date(DateTime.toEpochMillis(dateTime)));
}
