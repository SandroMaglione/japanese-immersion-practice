export function KanjiWordText({
  kanjiEntries,
  text,
}: {
  readonly kanjiEntries: readonly {
    readonly readings: readonly string[];
    readonly symbol: string;
  }[];
  readonly text: string;
}) {
  return (
    <>
      {Array.from(text).map((character, index) => {
        const entry = kanjiEntries.find(
          (kanjiEntry) => kanjiEntry.symbol === character
        );

        return (
          <span
            key={`${index}:${character}`}
            className={
              entry === undefined
                ? undefined
                : entry.readings.length === 1
                  ? "text-sky"
                  : "text-gold"
            }
            title={entry?.readings.join(" / ")}
          >
            {character}
          </span>
        );
      })}
    </>
  );
}
