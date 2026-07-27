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
- accept the canonical word unchanged at that marker;
- use per-character furigana for other kanji;
- demonstrate a natural, distinct construction or collocation;
- include a faithful English translation; and
- include a concise Japanese note when it teaches nuance, register, grammar,
  or a fixed pairing.

Across three examples, prefer coverage such as an adverbial construction, a
fixed collocation, and an attributive or conversational use. Avoid merely
changing names or nouns in otherwise identical sentences.

## Add-word payload

```json
{
  "formatVersion": 1,
  "words": [
    {
      "text": "不[ふ]意[い]",
      "translation": "unexpected; unforeseen; sudden",
      "description": "予想も準備もしていないときに、突然何かが起こること。",
      "examples": [
        {
          "template": "{{word}}に名[な]前[まえ]を呼[よ]ばれて、びっくりした。",
          "translation": "I was startled when someone suddenly called my name.",
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
  "formatVersion": 1,
  "operation": "addExamples",
  "words": [
    {
      "text": "不[ふ]意[い]",
      "examples": [
        {
          "template": "背[はい]後[ご]から{{word}}に声[こえ]をかけられた。",
          "translation": "Someone suddenly spoke to me from behind.",
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
