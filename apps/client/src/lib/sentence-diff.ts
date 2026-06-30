type Token = {
  readonly comparable: string;
  readonly text: string;
};

export type SentenceDiffPart = {
  readonly changeId: number | null;
  readonly changed: boolean;
  readonly text: string;
};

export type SentenceDiff = {
  readonly original: readonly SentenceDiffPart[];
  readonly rewrite: readonly SentenceDiffPart[];
};

const japaneseTokenPattern =
  /(\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30fc]|[\p{Script=Latin}\p{N}]+(?:['\u2019][\p{Script=Latin}\p{N}]+)*|[^\s])/gu;

const _tokenize = ({ text }: { readonly text: string }) => {
  const tokens: Token[] = [];

  for (const match of text.matchAll(japaneseTokenPattern)) {
    const token = match[0];

    if (token !== undefined) {
      tokens.push({
        comparable:
          token.trim().length === 0 ? token : token.toLocaleLowerCase(),
        text: token,
      });
    }
  }

  return tokens;
};

const _parts = ({
  changeIdsByIndex,
  tokens,
}: {
  readonly changeIdsByIndex: readonly (number | null)[];
  readonly tokens: readonly Token[];
}) => {
  const parts: SentenceDiffPart[] = [];

  for (const [index, token] of tokens.entries()) {
    const changeId = changeIdsByIndex[index] ?? null;
    const changed = changeId !== null;
    const previousPart = parts.at(-1);

    if (
      previousPart !== undefined &&
      previousPart.changed === changed &&
      previousPart.changeId === changeId
    ) {
      parts[parts.length - 1] = {
        changeId,
        changed,
        text: `${previousPart.text}${token.text}`,
      };
    } else {
      parts.push({ changeId, changed, text: token.text });
    }
  }

  return parts;
};

const _tableIndex = ({
  columns,
  originalIndex,
  rewriteIndex,
}: {
  readonly columns: number;
  readonly originalIndex: number;
  readonly rewriteIndex: number;
}) => originalIndex * columns + rewriteIndex;

const _tableValue = ({
  columns,
  originalIndex,
  rewriteIndex,
  table,
}: {
  readonly columns: number;
  readonly originalIndex: number;
  readonly rewriteIndex: number;
  readonly table: Uint32Array;
}) =>
  table[
    _tableIndex({
      columns,
      originalIndex,
      rewriteIndex,
    })
  ] ?? 0;

export const diffJapaneseSentence = ({
  original,
  rewrite,
}: {
  readonly original: string;
  readonly rewrite: string;
}): SentenceDiff => {
  if (original === rewrite) {
    const unchanged = [{ changeId: null, changed: false, text: original }];

    return { original: unchanged, rewrite: unchanged };
  }

  const originalTokens = _tokenize({ text: original });
  const rewriteTokens = _tokenize({ text: rewrite });
  const columns = rewriteTokens.length + 1;
  const table = new Uint32Array((originalTokens.length + 1) * columns);

  for (
    let originalIndex = originalTokens.length - 1;
    originalIndex >= 0;
    originalIndex -= 1
  ) {
    for (
      let rewriteIndex = rewriteTokens.length - 1;
      rewriteIndex >= 0;
      rewriteIndex -= 1
    ) {
      const originalToken = originalTokens[originalIndex];
      const rewriteToken = rewriteTokens[rewriteIndex];
      const currentIndex = _tableIndex({
        columns,
        originalIndex,
        rewriteIndex,
      });

      if (
        originalToken !== undefined &&
        rewriteToken !== undefined &&
        originalToken.comparable === rewriteToken.comparable
      ) {
        table[currentIndex] =
          _tableValue({
            columns,
            originalIndex: originalIndex + 1,
            rewriteIndex: rewriteIndex + 1,
            table,
          }) + 1;
      } else {
        table[currentIndex] = Math.max(
          _tableValue({
            columns,
            originalIndex: originalIndex + 1,
            rewriteIndex,
            table,
          }),
          _tableValue({
            columns,
            originalIndex,
            rewriteIndex: rewriteIndex + 1,
            table,
          })
        );
      }
    }
  }

  const operations: (
    | {
        readonly originalIndex: number;
        readonly rewriteIndex: number;
        readonly type: "equal";
      }
    | {
        readonly originalIndex: number;
        readonly type: "delete";
      }
    | {
        readonly rewriteIndex: number;
        readonly type: "insert";
      }
  )[] = [];
  let originalIndex = 0;
  let rewriteIndex = 0;

  while (
    originalIndex < originalTokens.length &&
    rewriteIndex < rewriteTokens.length
  ) {
    const originalToken = originalTokens[originalIndex];
    const rewriteToken = rewriteTokens[rewriteIndex];

    if (originalToken === undefined || rewriteToken === undefined) {
      break;
    }

    if (originalToken.comparable === rewriteToken.comparable) {
      operations.push({
        originalIndex,
        rewriteIndex,
        type: "equal",
      });
      originalIndex += 1;
      rewriteIndex += 1;
    } else if (
      _tableValue({
        columns,
        originalIndex: originalIndex + 1,
        rewriteIndex,
        table,
      }) >=
      _tableValue({
        columns,
        originalIndex,
        rewriteIndex: rewriteIndex + 1,
        table,
      })
    ) {
      operations.push({
        originalIndex,
        type: "delete",
      });
      originalIndex += 1;
    } else {
      operations.push({
        rewriteIndex,
        type: "insert",
      });
      rewriteIndex += 1;
    }
  }

  while (originalIndex < originalTokens.length) {
    const token = originalTokens[originalIndex];

    if (token !== undefined) {
      operations.push({
        originalIndex,
        type: "delete",
      });
    }

    originalIndex += 1;
  }

  while (rewriteIndex < rewriteTokens.length) {
    const token = rewriteTokens[rewriteIndex];

    if (token !== undefined) {
      operations.push({
        rewriteIndex,
        type: "insert",
      });
    }

    rewriteIndex += 1;
  }

  const changeIdsByOriginalIndex = Array.from(
    { length: originalTokens.length },
    (): number | null => null
  );
  const changeIdsByRewriteIndex = Array.from(
    { length: rewriteTokens.length },
    (): number | null => null
  );
  let currentChangeId: number | null = null;
  let nextChangeId = 0;

  for (const operation of operations) {
    if (operation.type === "equal") {
      currentChangeId = null;
    } else {
      const changeId: number = currentChangeId ?? nextChangeId;

      if (currentChangeId === null) {
        nextChangeId += 1;
      }

      currentChangeId = changeId;

      if (operation.type === "delete") {
        changeIdsByOriginalIndex[operation.originalIndex] = changeId;
      } else {
        changeIdsByRewriteIndex[operation.rewriteIndex] = changeId;
      }
    }
  }

  return {
    original: _parts({
      changeIdsByIndex: changeIdsByOriginalIndex,
      tokens: originalTokens,
    }),
    rewrite: _parts({
      changeIdsByIndex: changeIdsByRewriteIndex,
      tokens: rewriteTokens,
    }),
  };
};
