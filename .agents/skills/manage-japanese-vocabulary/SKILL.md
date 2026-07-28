---
name: manage-japanese-vocabulary
description: Research, generate, validate, and write Japanese vocabulary content to the production Japanese Immersion Practice D1 database. Use when the user asks to add, import, or push one or more Japanese words; enrich existing words with new examples; or generate readings, furigana, translations, Japanese recall clues, collocations, example sentences, and usage notes for the app.
---

# Manage Japanese Vocabulary

Maintain production vocabulary through the authenticated Effect RPC API while
preserving the app's content conventions and FSRS state invariants.

## Required workflow

1. Read [references/content-guidelines.md](references/content-guidelines.md)
   completely before generating content.
2. Classify the request:
   - Add one or more new words.
   - Add examples to one or more existing words.
   - Preview only when the user explicitly asks not to write.
3. Research every requested word before composing it:
   - Browse an authoritative Japanese dictionary for reading, senses, part of
     speech, register, and standard constructions.
   - Verify collocations and example patterns. Use a second reliable source
     when a sense or construction is uncommon or ambiguous.
   - Ask only when ambiguity would materially change the requested entry.
4. Generate a version 2 JSON payload using the reference schemas. Unless the
   user specifies otherwise, create three varied examples for each new word.
5. Create a temporary JSON file outside the repository with `apply_patch`.
6. Validate locally:

   ```sh
   node --experimental-strip-types \
     .agents/skills/manage-japanese-vocabulary/scripts/manage-vocabulary.ts \
     --input /absolute/path/to/payload.json \
     --validate-only
   ```

7. Inspect production duplicates and the planned changes without mutation:

   ```sh
   node --experimental-strip-types \
     .agents/skills/manage-japanese-vocabulary/scripts/manage-vocabulary.ts \
     --input /absolute/path/to/payload.json
   ```

8. When the user asked to add, import, or push the content, apply it without
   asking for another confirmation:

   ```sh
   node --experimental-strip-types \
     .agents/skills/manage-japanese-vocabulary/scripts/manage-vocabulary.ts \
     --input /absolute/path/to/payload.json \
     --apply
   ```

   Production network access may require tool escalation. Describe the exact
   vocabulary mutation in the approval request.

9. Remove the temporary payload. Report inserted/enriched words, examples,
   skips, and the read-back result. Cite the dictionary sources used.

## Operational rules

- Treat “add,” “import,” “push,” or equivalent language as authorization to
  mutate the production vocabulary named by the user.
- Never add a duplicate normalized word. Let the helper skip existing words
  and report them.
- For examples-only requests, update the existing word; never recreate it or
  reset its memory state.
- Never write vocabulary through raw SQL. Use the helper so writes pass through
  the authenticated Effect RPC API and use batch store operations.
- Never print, commit, or copy `AUTH_PASSWORD` or `AUTH_SIGNING_SECRET`. The
  helper reads the ignored `apps/server/.dev.vars` file directly.
- Do not build, deploy, commit, or push code for vocabulary-only changes.
- Stop on validation, authentication, RPC, or read-back failure. Do not report
  success from a partial result.

## Helper behavior

The helper:

- validates payload structure, markers, strings, and domain schemas;
- normalizes furigana text with the same service as the app;
- checks current production words before mutation;
- initializes new words with the app's current FSRS scheduler;
- appends only non-duplicate examples to existing words;
- performs batch insert/update RPCs; and
- reads production data back and verifies every requested change.
