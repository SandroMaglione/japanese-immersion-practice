import { FuriganaText } from "@jip/services";

export function WordText({ text }: { readonly text: string }) {
  return (
    <>
      {FuriganaText.parse({ text }).map((segment, segmentIndex) =>
        segment.type === "ruby" ? (
          <ruby
            key={`${segmentIndex}:ruby:${segment.base}:${segment.reading}`}
            title={segment.reading}
          >
            {segment.base}
            <rt className="text-[0.45em] font-black leading-none text-ink-muted">
              {segment.reading}
            </rt>
          </ruby>
        ) : (
          <span key={`${segmentIndex}:text:${segment.text}`}>
            {segment.text}
          </span>
        )
      )}
    </>
  );
}
