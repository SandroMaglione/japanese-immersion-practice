#!/usr/bin/env -S node --experimental-strip-types

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { Schema } from "effect";

import * as Domain from "../../../../packages/data/src/domain.ts";
import * as FuriganaText from "../../../../packages/services/src/furigana-text.ts";
import * as WordMemoryScheduler from "../../../../packages/services/src/word-memory-scheduler.ts";

type JsonRecord = Record<string, unknown>;

type ExampleInput = {
  readonly answer: string;
  readonly note?: string;
  readonly template: string;
  readonly translationTarget: string;
  readonly translationTemplate: string;
};

type AddWordInput = {
  readonly description?: string;
  readonly examples?: readonly ExampleInput[];
  readonly text: string;
  readonly translation: string;
};

type AddExamplesInput = {
  readonly examples: readonly ExampleInput[];
  readonly text: string;
};

type Operation =
  | {
      readonly kind: "addExamples";
      readonly words: readonly AddExamplesInput[];
    }
  | {
      readonly kind: "addWords";
      readonly words: readonly AddWordInput[];
    }
  | {
      readonly kind: "replaceExamples";
      readonly words: readonly AddExamplesInput[];
    };

type StoredWord = {
  readonly archivedAt?: number;
  readonly createdAt: number;
  readonly description?: string;
  readonly examples?: readonly ExampleInput[];
  readonly id: string;
  readonly text: string;
  readonly translation: string;
  readonly updatedAt: number;
};

const _repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const _defaultBaseUrl =
  "https://japanese-immersion-practice.lass-maglio.workers.dev";
const _translationTargetMarker = "{{target}}";
const _wordMarker = "{{word}}";

const _fail = (message: string): never => {
  throw new Error(message);
};

const _isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const _record = ({
  path,
  value,
}: {
  readonly path: string;
  readonly value: unknown;
}) => (_isRecord(value) ? value : _fail(`${path}: expected an object`));

const _strictKeys = ({
  allowed,
  path,
  value,
}: {
  readonly allowed: readonly string[];
  readonly path: string;
  readonly value: JsonRecord;
}) => {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));

  if (unexpected.length > 0) {
    _fail(`${path}: unexpected properties: ${unexpected.join(", ")}`);
  }
};

const _string = ({
  path,
  value,
}: {
  readonly path: string;
  readonly value: unknown;
}) => {
  if (typeof value !== "string" || value.trim() === "") {
    return _fail(`${path}: expected a non-empty string`);
  }

  if (value !== value.trim()) {
    return _fail(`${path}: remove leading or trailing whitespace`);
  }

  return value;
};

const _optionalString = ({
  path,
  value,
}: {
  readonly path: string;
  readonly value: unknown;
}) => (value === undefined ? undefined : _string({ path, value }));

const _array = ({
  path,
  value,
}: {
  readonly path: string;
  readonly value: unknown;
}) => {
  if (!Array.isArray(value) || value.length === 0) {
    return _fail(`${path}: expected a non-empty array`);
  }

  return value;
};

const _markerCount = ({
  marker,
  template,
}: {
  readonly marker: string;
  readonly template: string;
}) => template.split(marker).length - 1;

const _validateFurigana = ({
  path,
  text,
}: {
  readonly path: string;
  readonly text: string;
}) => {
  const openingCount = text.split("[").length - 1;
  const closingCount = text.split("]").length - 1;

  if (openingCount !== closingCount) {
    _fail(`${path}: unmatched furigana brackets`);
  }

  if (text.includes("[]")) {
    _fail(`${path}: empty furigana reading`);
  }

  FuriganaText.parse({ text });
};

const _example = ({
  index,
  path,
  value,
}: {
  readonly index: number;
  readonly path: string;
  readonly value: unknown;
}): ExampleInput => {
  const examplePath = `${path}[${index}]`;
  const source = _record({ path: examplePath, value });
  _strictKeys({
    allowed: [
      "answer",
      "note",
      "template",
      "translationTarget",
      "translationTemplate",
    ],
    path: examplePath,
    value: source,
  });
  const template = _string({
    path: `${examplePath}.template`,
    value: source.template,
  });

  if (_markerCount({ marker: _wordMarker, template }) !== 1) {
    _fail(`${examplePath}.template: expected exactly one ${_wordMarker}`);
  }

  _validateFurigana({ path: `${examplePath}.template`, text: template });
  const answer = _string({
    path: `${examplePath}.answer`,
    value: source.answer,
  });
  _validateFurigana({ path: `${examplePath}.answer`, text: answer });
  const translationTemplate = _string({
    path: `${examplePath}.translationTemplate`,
    value: source.translationTemplate,
  });

  if (
    _markerCount({
      marker: _translationTargetMarker,
      template: translationTemplate,
    }) !== 1
  ) {
    _fail(
      `${examplePath}.translationTemplate: expected exactly one ${_translationTargetMarker}`
    );
  }

  const note = _optionalString({
    path: `${examplePath}.note`,
    value: source.note,
  });

  return {
    answer,
    ...(note === undefined ? {} : { note }),
    template,
    translationTarget: _string({
      path: `${examplePath}.translationTarget`,
      value: source.translationTarget,
    }),
    translationTemplate,
  };
};

const _examples = ({
  path,
  value,
}: {
  readonly path: string;
  readonly value: unknown;
}) => {
  const examples = _array({ path, value }).map((candidate, index) =>
    _example({ index, path, value: candidate })
  );
  const normalizedTemplates = examples.map((example) =>
    example.template.normalize("NFKC")
  );

  if (new Set(normalizedTemplates).size !== normalizedTemplates.length) {
    _fail(`${path}: repeated example template`);
  }

  return examples;
};

const _examplesEqual = ({
  left,
  right,
}: {
  readonly left: readonly ExampleInput[] | undefined;
  readonly right: readonly ExampleInput[] | undefined;
}) =>
  left?.length === right?.length &&
  left?.every((example, index) => {
    const candidate = right?.[index];

    return (
      candidate !== undefined &&
      example.answer === candidate.answer &&
      example.note === candidate.note &&
      example.template === candidate.template &&
      example.translationTarget === candidate.translationTarget &&
      example.translationTemplate === candidate.translationTemplate
    );
  });

const _parseOperation = (value: unknown): Operation => {
  const root = _record({ path: "payload", value });
  const formatVersion = root.formatVersion;

  if (formatVersion !== 3) {
    _fail("payload.formatVersion: expected 3");
  }

  const sourceWords = _array({ path: "payload.words", value: root.words });

  if (
    root.operation === "addExamples" ||
    root.operation === "replaceExamples"
  ) {
    _strictKeys({
      allowed: ["formatVersion", "operation", "words"],
      path: "payload",
      value: root,
    });
    const words = sourceWords.map((candidate, index): AddExamplesInput => {
      const path = `payload.words[${index}]`;
      const source = _record({ path, value: candidate });
      _strictKeys({ allowed: ["examples", "text"], path, value: source });
      const text = _string({ path: `${path}.text`, value: source.text });
      _validateFurigana({ path: `${path}.text`, text });

      return {
        examples: _examples({
          path: `${path}.examples`,
          value: source.examples,
        }),
        text,
      };
    });

    return { kind: root.operation, words };
  }

  if (root.operation !== undefined) {
    _fail(
      "payload.operation: expected addExamples, replaceExamples, or no operation"
    );
  }

  _strictKeys({
    allowed: ["formatVersion", "words"],
    path: "payload",
    value: root,
  });
  const words = sourceWords.map((candidate, index): AddWordInput => {
    const path = `payload.words[${index}]`;
    const source = _record({ path, value: candidate });
    _strictKeys({
      allowed: ["description", "examples", "text", "translation"],
      path,
      value: source,
    });
    const text = _string({ path: `${path}.text`, value: source.text });
    _validateFurigana({ path: `${path}.text`, text });
    const description = _optionalString({
      path: `${path}.description`,
      value: source.description,
    });
    const examples =
      source.examples === undefined
        ? undefined
        : _examples({ path: `${path}.examples`, value: source.examples });

    return {
      ...(description === undefined ? {} : { description }),
      ...(examples === undefined ? {} : { examples }),
      text,
      translation: _string({
        path: `${path}.translation`,
        value: source.translation,
      }),
    };
  });

  return { kind: "addWords", words };
};

const _normalizedText = (text: string) =>
  FuriganaText.normalizePlainText({ text });

const _assertUniqueTargets = (operation: Operation) => {
  const targets = operation.words.map((word) => _normalizedText(word.text));

  if (new Set(targets).size !== targets.length) {
    _fail("payload.words: repeated normalized word target");
  }
};

const _parseDotenvValue = (source: string, key: string) => {
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(`${key}=`));

  if (line === undefined) {
    return undefined;
  }

  const raw = line.slice(key.length + 1).trim();

  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  return raw;
};

const _rpcClient = async ({ baseUrl }: { readonly baseUrl: string }) => {
  const devVars = await readFile(
    `${_repositoryRoot}apps/server/.dev.vars`,
    "utf8"
  );
  const password =
    process.env.JIP_AUTH_PASSWORD ??
    _parseDotenvValue(devVars, "AUTH_PASSWORD");

  if (password === undefined || password === "") {
    return _fail("AUTH_PASSWORD is missing from apps/server/.dev.vars");
  }

  const login = await fetch(`${baseUrl}/login`, {
    body: new URLSearchParams({ next: "/", password }),
    method: "POST",
    redirect: "manual",
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];

  if (login.status !== 303 || cookie === undefined) {
    return _fail(`Production login failed with HTTP ${login.status}`);
  }

  let requestNumber = 0;

  return async <Result>(tag: string, payload: unknown = null) => {
    requestNumber += 1;
    const response = await fetch(`${baseUrl}/api/rpc/`, {
      body: JSON.stringify({
        _tag: "Request",
        headers: [],
        id: String(requestNumber),
        payload,
        tag,
      }),
      headers: {
        "content-type": "application/json",
        cookie,
      },
      method: "POST",
    });

    if (!response.ok) {
      return _fail(`${tag}: RPC returned HTTP ${response.status}`);
    }

    const messages: unknown = await response.json();

    if (!Array.isArray(messages) || !_isRecord(messages[0])) {
      return _fail(`${tag}: malformed RPC response`);
    }

    const exit = _record({
      path: `${tag}.exit`,
      value: messages[0].exit,
    });

    if (exit._tag !== "Success") {
      return _fail(`${tag}: ${JSON.stringify(exit)}`);
    }

    return exit.value as Result;
  };
};

const _makeNewRecords = ({
  inputs,
  now,
}: {
  readonly inputs: readonly AddWordInput[];
  readonly now: number;
}) => {
  const words: JsonRecord[] = [];
  const states: JsonRecord[] = [];

  for (const input of inputs) {
    const id = crypto.randomUUID();
    const card = WordMemoryScheduler.initialCard({ now });
    const word = {
      id,
      createdAt: now,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.examples === undefined ? {} : { examples: input.examples }),
      text: input.text,
      translation: input.translation,
      updatedAt: now,
    };
    const state = {
      wordId: id,
      stage: "recognition",
      stageStartedAt: now,
      stageAttemptCount: 0,
      stageMasteryStreak: 0,
      phase: card.phase,
      dueAt: card.dueAtMillis,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
      repetitions: card.repetitions,
      lapses: card.lapses,
      attemptCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      lastPracticedAt: now,
      schedulerVersion: WordMemoryScheduler.SchedulerVersion,
      createdAt: now,
      updatedAt: now,
    };

    Schema.decodeUnknownSync(Domain.Word)(word);
    Schema.decodeUnknownSync(Domain.WordMemoryState)(state);
    words.push(word);
    states.push(state);
  }

  return { states, words };
};

const _asStoredWords = (value: unknown) => {
  if (!Array.isArray(value)) {
    return _fail("StoreListWords: expected an array");
  }

  return value as StoredWord[];
};

const _planAddWords = ({
  existing,
  inputs,
}: {
  readonly existing: readonly StoredWord[];
  readonly inputs: readonly AddWordInput[];
}) => {
  const existingTexts = new Set(
    existing.map((word) => _normalizedText(word.text))
  );
  const skipped = inputs
    .filter((input) => existingTexts.has(_normalizedText(input.text)))
    .map((input) => input.text);
  const additions = inputs.filter(
    (input) => !existingTexts.has(_normalizedText(input.text))
  );

  return { additions, skipped };
};

const _planAddExamples = ({
  existing,
  inputs,
  now,
}: {
  readonly existing: readonly StoredWord[];
  readonly inputs: readonly AddExamplesInput[];
  readonly now: number;
}) => {
  const missing: string[] = [];
  const unchanged: string[] = [];
  const updates: StoredWord[] = [];
  const addedCounts: Record<string, number> = {};

  for (const input of inputs) {
    const normalized = _normalizedText(input.text);
    const matches = existing.filter(
      (word) => _normalizedText(word.text) === normalized
    );

    if (matches.length === 0) {
      missing.push(input.text);
      continue;
    }

    if (matches.length > 1) {
      _fail(`${input.text}: multiple normalized production matches`);
    }

    const stored = matches[0];

    if (stored === undefined) {
      _fail(`${input.text}: missing production match`);
    }

    const currentExamples = stored.examples ?? [];
    const currentTemplates = new Set(
      currentExamples.map((example) => example.template.normalize("NFKC"))
    );
    const additions = input.examples.filter(
      (example) => !currentTemplates.has(example.template.normalize("NFKC"))
    );

    if (additions.length === 0) {
      unchanged.push(stored.text);
      continue;
    }

    const updated = {
      ...stored,
      examples: [...currentExamples, ...additions],
      updatedAt: now,
    };
    Schema.decodeUnknownSync(Domain.Word)(updated);
    updates.push(updated);
    addedCounts[stored.text] = additions.length;
  }

  return { addedCounts, missing, unchanged, updates };
};

const _planReplaceExamples = ({
  existing,
  inputs,
  now,
}: {
  readonly existing: readonly StoredWord[];
  readonly inputs: readonly AddExamplesInput[];
  readonly now: number;
}) => {
  const updates: StoredWord[] = [];

  for (const input of inputs) {
    const normalized = _normalizedText(input.text);
    const matches = existing.filter(
      (word) => _normalizedText(word.text) === normalized
    );

    if (matches.length !== 1) {
      _fail(`${input.text}: expected exactly one production word`);
    }

    const stored = matches[0];

    if (stored === undefined) {
      _fail(`${input.text}: missing production match`);
    }

    const currentTemplates = new Set(
      (stored.examples ?? []).map((example) =>
        example.template.normalize("NFKC")
      )
    );
    const replacementTemplates = new Set(
      input.examples.map((example) => example.template.normalize("NFKC"))
    );

    if (
      currentTemplates.size !== replacementTemplates.size ||
      [...currentTemplates].some(
        (template) => !replacementTemplates.has(template)
      )
    ) {
      _fail(`${input.text}: replacement templates do not match production`);
    }

    const updated = {
      ...stored,
      examples: input.examples,
      updatedAt: now,
    };
    Schema.decodeUnknownSync(Domain.Word)(updated);
    updates.push(updated);
  }

  return { updates };
};

const _main = async () => {
  const { values } = parseArgs({
    options: {
      apply: { default: false, type: "boolean" },
      "base-url": { default: _defaultBaseUrl, type: "string" },
      input: { type: "string" },
      list: { default: false, type: "boolean" },
      "validate-only": { default: false, type: "boolean" },
    },
    strict: true,
  });
  const inputPath =
    values.input ??
    (values.list ? undefined : _fail("Pass --input /absolute/path.json"));

  if (values.list) {
    const baseUrl = values["base-url"]?.replace(/\/$/u, "") ?? _defaultBaseUrl;
    const rpc = await _rpcClient({ baseUrl });

    console.log(
      JSON.stringify({
        mode: "list",
        words: _asStoredWords(await rpc<unknown>("StoreListWords")),
      })
    );
    return;
  }

  if (inputPath === undefined) {
    return _fail("Pass --input /absolute/path.json");
  }

  const rawPayload = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const operation = _parseOperation(rawPayload);
  _assertUniqueTargets(operation);

  if (values["validate-only"]) {
    console.log(
      JSON.stringify({
        mode: "validate-only",
        operation: operation.kind,
        valid: true,
        words: operation.words.map((word) => word.text),
      })
    );
    return;
  }

  const baseUrl = values["base-url"]?.replace(/\/$/u, "") ?? _defaultBaseUrl;
  const rpc = await _rpcClient({ baseUrl });
  const existing = _asStoredWords(await rpc<unknown>("StoreListWords"));
  const now = Date.now();

  if (operation.kind === "addWords") {
    const plan = _planAddWords({ existing, inputs: operation.words });

    if (!values.apply) {
      console.log(
        JSON.stringify({
          additions: plan.additions.map((word) => ({
            examples: word.examples?.length ?? 0,
            text: word.text,
          })),
          mode: "dry-run",
          operation: operation.kind,
          skippedExisting: plan.skipped,
        })
      );
      return;
    }

    const records = _makeNewRecords({ inputs: plan.additions, now });

    if (records.words.length > 0) {
      await rpc("StoreInsertWordsWithMemoryStates", records);
    }

    const stored = _asStoredWords(await rpc<unknown>("StoreListWords"));
    const insertedIds = new Set(records.words.map((word) => word.id));
    const verified = stored.filter((word) => insertedIds.has(word.id));

    if (verified.length !== records.words.length) {
      _fail("Read-back verification failed for inserted words");
    }

    console.log(
      JSON.stringify({
        inserted: verified.map((word) => ({
          examples: word.examples?.length ?? 0,
          id: word.id,
          text: word.text,
        })),
        mode: "apply",
        operation: operation.kind,
        skippedExisting: plan.skipped,
        verified: true,
      })
    );
    return;
  }

  if (operation.kind === "replaceExamples") {
    const plan = _planReplaceExamples({
      existing,
      inputs: operation.words,
      now,
    });

    if (!values.apply) {
      console.log(
        JSON.stringify({
          mode: "dry-run",
          operation: operation.kind,
          updates: plan.updates.map((word) => ({
            examples: word.examples?.length ?? 0,
            text: word.text,
          })),
        })
      );
      return;
    }

    if (plan.updates.length > 0) {
      await rpc("StoreUpdateWords", { words: plan.updates });
    }

    const stored = _asStoredWords(await rpc<unknown>("StoreListWords"));

    for (const updated of plan.updates) {
      const readBack = stored.find((word) => word.id === updated.id);

      if (
        readBack === undefined ||
        !_examplesEqual({
          left: readBack.examples,
          right: updated.examples,
        })
      ) {
        _fail(`Read-back verification failed for ${updated.text}`);
      }
    }

    console.log(
      JSON.stringify({
        mode: "apply",
        operation: operation.kind,
        updated: plan.updates.map((word) => ({
          examples: word.examples?.length ?? 0,
          id: word.id,
          text: word.text,
        })),
        verified: true,
      })
    );
    return;
  }

  const plan = _planAddExamples({
    existing,
    inputs: operation.words,
    now,
  });

  if (!values.apply) {
    console.log(
      JSON.stringify({
        addedExampleCounts: plan.addedCounts,
        missingWords: plan.missing,
        mode: "dry-run",
        operation: operation.kind,
        unchanged: plan.unchanged,
        updates: plan.updates.map((word) => word.text),
      })
    );
    return;
  }

  if (plan.updates.length > 0) {
    await rpc("StoreUpdateWords", { words: plan.updates });
  }

  const stored = _asStoredWords(await rpc<unknown>("StoreListWords"));

  for (const updated of plan.updates) {
    const readBack = stored.find((word) => word.id === updated.id);

    if (
      readBack === undefined ||
      readBack.examples?.length !== updated.examples?.length
    ) {
      _fail(`Read-back verification failed for ${updated.text}`);
    }
  }

  console.log(
    JSON.stringify({
      addedExampleCounts: plan.addedCounts,
      missingWords: plan.missing,
      mode: "apply",
      operation: operation.kind,
      unchanged: plan.unchanged,
      updated: plan.updates.map((word) => ({
        examples: word.examples?.length ?? 0,
        id: word.id,
        text: word.text,
      })),
      verified: true,
    })
  );
};

await _main();
