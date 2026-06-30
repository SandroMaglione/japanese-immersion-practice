import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PracticeImportJsonSchemaDefinitionText } from "../src/practice-import-machine.ts";

const schemaFileUrl = new URL(
  "../practice-import.schema.json",
  import.meta.url
);

await writeFile(schemaFileUrl, `${PracticeImportJsonSchemaDefinitionText}\n`);

console.log(`Wrote ${fileURLToPath(schemaFileUrl)}`);
