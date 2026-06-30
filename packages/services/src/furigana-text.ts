const HanCharacterPattern = /^[\p{Script=Han}々〆ヶ]$/u;
const WordCharacterPattern =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Latin}\p{N}々〆ヶー]$/u;

export type FuriganaTextSegment =
  | {
      readonly text: string;
      readonly type: "text";
    }
  | {
      readonly base: string;
      readonly reading: string;
      readonly type: "ruby";
    };

export const parse = ({
  text,
}: {
  readonly text: string;
}): readonly FuriganaTextSegment[] => {
  const characters = Array.from(text);
  const segments: FuriganaTextSegment[] = [];
  let index = 0;
  let pending = "";

  const isHanCharacter = ({ character }: { readonly character: string }) =>
    HanCharacterPattern.test(character);

  const isWordCharacter = ({ character }: { readonly character: string }) =>
    WordCharacterPattern.test(character);

  const trailingBase = ({ source }: { readonly source: string }) => {
    const sourceCharacters = Array.from(source);
    const lastCharacter = sourceCharacters[sourceCharacters.length - 1] ?? "";

    if (
      lastCharacter === "" ||
      !isWordCharacter({ character: lastCharacter })
    ) {
      return {
        base: "",
        prefix: source,
      };
    }

    const useHanOnly = isHanCharacter({ character: lastCharacter });
    let baseStart = sourceCharacters.length - 1;

    while (baseStart >= 0) {
      const character = sourceCharacters[baseStart] ?? "";
      const isBaseCharacter = useHanOnly
        ? isHanCharacter({ character })
        : isWordCharacter({ character });

      if (!isBaseCharacter) {
        break;
      }

      baseStart -= 1;
    }

    return {
      base: sourceCharacters.slice(baseStart + 1).join(""),
      prefix: sourceCharacters.slice(0, baseStart + 1).join(""),
    };
  };

  const pushText = ({ source }: { readonly source: string }) => {
    if (source === "") {
      return;
    }

    const previousSegment = segments[segments.length - 1];

    if (previousSegment?.type === "text") {
      segments[segments.length - 1] = {
        text: `${previousSegment.text}${source}`,
        type: "text",
      };
      return;
    }

    segments.push({
      text: source,
      type: "text",
    });
  };

  while (index < characters.length) {
    const character = characters[index] ?? "";

    if (character !== "[") {
      pending = `${pending}${character}`;
      index += 1;
      continue;
    }

    const closingIndex = characters.indexOf("]", index + 1);

    if (closingIndex === -1) {
      pending = `${pending}${character}`;
      index += 1;
      continue;
    }

    const reading = characters.slice(index + 1, closingIndex).join("");
    const literalAnnotation = characters
      .slice(index, closingIndex + 1)
      .join("");

    if (reading === "") {
      pending = `${pending}${literalAnnotation}`;
      index = closingIndex + 1;
      continue;
    }

    const annotationBase = trailingBase({ source: pending });

    if (annotationBase.base === "") {
      pending = `${pending}${literalAnnotation}`;
      index = closingIndex + 1;
      continue;
    }

    pushText({ source: annotationBase.prefix });
    segments.push({
      base: annotationBase.base,
      reading,
      type: "ruby",
    });
    pending = "";
    index = closingIndex + 1;
  }

  pushText({ source: pending });

  return segments;
};

export const toPlainText = ({ text }: { readonly text: string }) =>
  parse({ text })
    .map((segment) => (segment.type === "text" ? segment.text : segment.base))
    .join("");

export const normalizePlainText = ({ text }: { readonly text: string }) =>
  toPlainText({ text }).trim().normalize("NFKC");
