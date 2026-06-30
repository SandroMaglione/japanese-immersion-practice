import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { WordImportJsonSchemaDefinitionText } from "../src/library-machine.ts";
import { PracticeImportJsonSchemaDefinitionText } from "../src/practice-import-machine.ts";

const schemaDefinitions = [
  {
    fileUrl: new URL("../practice-import.schema.json", import.meta.url),
    text: PracticeImportJsonSchemaDefinitionText,
  },
  {
    fileUrl: new URL("../word-import.schema.json", import.meta.url),
    text: WordImportJsonSchemaDefinitionText,
  },
];

for (const schemaDefinition of schemaDefinitions) {
  await writeFile(schemaDefinition.fileUrl, `${schemaDefinition.text}\n`);
  console.log(`Wrote ${fileURLToPath(schemaDefinition.fileUrl)}`);
}
