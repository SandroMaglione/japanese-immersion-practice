import assert from "node:assert/strict";
import test from "node:test";

import { toPlainText, toReadingText } from "./furigana-text.ts";

test("plain and reading forms are derived from annotated Japanese", () => {
  assert.equal(toPlainText({ text: "促[うなが]す" }), "促す");
  assert.equal(toReadingText({ text: "促[うなが]す" }), "うながす");
  assert.equal(toReadingText({ text: "ばったり会[あ]う" }), "ばったりあう");
});
