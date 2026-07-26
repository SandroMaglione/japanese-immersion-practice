export const WordMarker = "{{word}}";

export const WordMarkerPattern =
  /^(?:(?!\{\{word\}\})[\s\S])*\{\{word\}\}(?:(?!\{\{word\}\})[\s\S])*$/;

const _shuffle = <Value>({
  seed,
  values,
}: {
  readonly seed: string;
  readonly values: readonly Value[];
}) => {
  const shuffled = [...values];
  let randomState = 2_166_136_261;

  for (let index = 0; index < seed.length; index += 1) {
    randomState = Math.imul(randomState ^ seed.charCodeAt(index), 16_777_619);
  }

  randomState >>>= 0;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = randomState % (index + 1);
    const selectedValue = shuffled[index];
    const swapValue = shuffled[swapIndex];

    if (selectedValue !== undefined && swapValue !== undefined) {
      shuffled[index] = swapValue;
      shuffled[swapIndex] = selectedValue;
    }
  }

  return shuffled;
};

export const selectExample = <Example>({
  attemptCount,
  examples,
  wordId,
}: {
  readonly attemptCount: number;
  readonly examples: readonly Example[];
  readonly wordId: string;
}): Example | undefined => {
  if (examples.length < 2) {
    return examples[0];
  }

  if (examples.length === 2) {
    const order = _shuffle({
      seed: `${wordId}:0`,
      values: examples,
    });

    return order[attemptCount % order.length];
  }

  const cycle = Math.floor(attemptCount / examples.length);
  const position = attemptCount % examples.length;
  const order = _shuffle({
    seed: `${wordId}:${cycle}`,
    values: examples,
  });

  if (cycle > 0) {
    const previousOrder = _shuffle({
      seed: `${wordId}:${cycle - 1}`,
      values: examples,
    });
    const previousLast = previousOrder[previousOrder.length - 1];

    if (order[0] === previousLast) {
      const first = order[0];
      const second = order[1];

      if (first !== undefined && second !== undefined) {
        order[0] = second;
        order[1] = first;
      }
    }
  }

  return order[position];
};
