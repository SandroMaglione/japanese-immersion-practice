import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const copiedDevelopmentSecrets = resolve(
  "dist/japanese_immersion_practice/.dev.vars"
);

await rm(copiedDevelopmentSecrets, { force: true });
