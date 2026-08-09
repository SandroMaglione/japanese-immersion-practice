# Vocabulary content guidelines

## Research standard

For every word, establish:

- canonical reading and spelling;
- relevant sense or senses;
- part of speech and grammatical behavior;
- register, tone, and common contexts;
- common collocations and constructions; and
- a useful contrast when a nearby synonym is easy to confuse.

Prefer authoritative monolingual Japanese dictionaries such as
Digital Daijisen, Meikyo, or resources that reproduce those dictionaries.
Use bilingual dictionaries only to refine the English gloss. Verify uncommon
collocations with a second reliable dictionary or corpus source.

Do not invent examples by translating English mechanically. Compose natural
Japanese around documented senses and constructions.

## Word fields

### `text`

Add furigana in square brackets immediately after each character it belongs to:

- `資[し]金[きん]`
- `不[ふ]意[い]`
- `ばったり会[あ]う`

Do not group a multi-kanji reading after the whole word. Leave kana-only words
unchanged.

### `translation`

Use compact English glosses separated by `; `:

```text
qualifications; requirements; capabilities
```

Do not add explanations, numbering, or a trailing semicolon.

### `description`

Write a Japanese definition-style recall clue that does not reveal the target
word. Include the most useful combination of meaning, natural context,
register, tone, collocations, and contrast with similar words.

### `examples`

Default to three examples for a new word. Each example must:

- contain exactly one `{{word}}` marker;
- include an `answer` containing the exact Japanese text inserted at that
  marker, including the complete conjugated form required by the sentence;
- keep the canonical word only in the parent word's `text` field rather than
  duplicating it as a separate canonical field in each example;
- use per-character furigana for other kanji;
- demonstrate a natural, distinct construction or collocation;
- include a natural English `translationTemplate` with exactly one
  `{{target}}` marker;
- include a concise `translationTarget` for the phrase corresponding
  specifically to the missing Japanese word; and
- include a concise Japanese note when it teaches nuance, register, grammar,
  or a fixed pairing.

The translation template owns all surrounding spacing and punctuation. The
target should read naturally when inserted and should identify the intended
semantic contribution of the blank:

```json
{
  "translationTemplate": "I was startled when someone {{target}} called my name.",
  "translationTarget": "suddenly"
}
```

The answer also owns any grammar needed inside the blank. For example, a word
stored as `主[しゅ]張[ちょう]する` can use
`"answer": "主[しゅ]張[ちょう]している"` in an example. Do not move `している`
outside the marker and do not add a separate `originalWord` or canonical-word
field to the example. When no inflection is needed, `answer` may naturally
equal the parent word's `text`.

Across three examples, prefer coverage such as an adverbial construction, a
fixed collocation, and an attributive or conversational use. Avoid merely
changing names or nouns in otherwise identical sentences.

## Add-word payload

```json
{
  "formatVersion": 3,
  "words": [
    {
      "text": "不[ふ]意[い]",
      "translation": "unexpected; unforeseen; sudden",
      "description": "予想も準備もしていないときに、突然何かが起こること。",
      "examples": [
        {
          "answer": "不[ふ]意[い]",
          "template": "{{word}}に名[な]前[まえ]を呼[よ]ばれて、びっくりした。",
          "translationTarget": "suddenly",
          "translationTemplate": "I was startled when someone {{target}} called my name.",
          "note": "「〜に」は、予想外の出来事が突然起こる様子を表す。"
        }
      ]
    }
  ]
}
```

Properties are strict. `description`, `examples`, and each example's `note`
are optional. When `examples` is present it must not be empty.

## Add-examples payload

Use the exact stored word text, including furigana:

```json
{
  "formatVersion": 3,
  "operation": "addExamples",
  "words": [
    {
      "text": "不[ふ]意[い]",
      "examples": [
        {
          "answer": "不[ふ]意[い]",
          "template": "背[はい]後[ご]から{{word}}に声[こえ]をかけられた。",
          "translationTarget": "suddenly",
          "translationTemplate": "Someone {{target}} spoke to me from behind.",
          "note": "予想していない瞬間だったことを強調する。"
        }
      ]
    }
  ]
}
```

The helper skips templates already stored on that word and preserves the word's
identity, timestamps other than `updatedAt`, archive status, practice events,
and memory state.

## Completion standard

A production operation is complete only when:

1. research supports the chosen reading, sense, and constructions;
2. local payload validation passes;
3. the dry run reports the intended targets and no unexpected skips;
4. the apply operation succeeds; and
5. the helper reads every inserted or enriched word back from production.
