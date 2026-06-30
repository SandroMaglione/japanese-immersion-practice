import { FuriganaText } from "@jip/services";

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
      {FuriganaText.parse({ text }).map((segment, segmentIndex) =>
        segment.type === "ruby" ? (
          <ruby
            key={`${segmentIndex}:ruby:${segment.base}:${segment.reading}`}
            title={segment.reading}
          >
            {Array.from(segment.base).map((character, characterIndex) => {
              const entry = kanjiEntries.find(
                (kanjiEntry) => kanjiEntry.symbol === character
              );

              return (
                <span
                  key={`${segmentIndex}:ruby-base:${characterIndex}:${character}`}
                  className={
                    entry === undefined
                      ? undefined
                      : entry.readings.length === 1
                        ? "text-kanji-single"
                        : "text-kanji-multiple"
                  }
                  title={entry?.readings.join(" / ")}
                >
                  {character}
                </span>
              );
            })}
            <rt className="text-[0.45em] font-black leading-none text-ink-muted">
              {segment.reading}
            </rt>
          </ruby>
        ) : (
          Array.from(segment.text).map((character, characterIndex) => {
            const entry = kanjiEntries.find(
              (kanjiEntry) => kanjiEntry.symbol === character
            );

            return (
              <span
                key={`${segmentIndex}:text:${characterIndex}:${character}`}
                className={
                  entry === undefined
                    ? undefined
                    : entry.readings.length === 1
                      ? "text-kanji-single"
                      : "text-kanji-multiple"
                }
                title={entry?.readings.join(" / ")}
              >
                {character}
              </span>
            );
          })
        )
      )}
    </>
  );
}
