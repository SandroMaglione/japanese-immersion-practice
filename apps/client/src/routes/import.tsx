import { Button } from "@base-ui/react/button";
import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";
import { PracticeImportMachine } from "@jip/machines";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { CheckCircle2, Upload } from "lucide-react";

import { RuntimeClient } from "../lib/runtime-client.ts";

const importMachine = PracticeImportMachine.makePracticeImportMachine({
  runtime: RuntimeClient,
});

export const Route = createFileRoute("/import")({
  component: ImportRoute,
});

function ImportRoute() {
  const [snapshot, , actor] = useMachine(importMachine);
  const importing = snapshot.matches("Importing");

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            actor.trigger.importJson();
          }}
        >
          <Field.Root className="grid gap-2" disabled={importing}>
            <Field.Label className="text-sm font-black">JSON</Field.Label>
            <Field.Control
              render={<textarea />}
              className="min-h-80 resize-y rounded-md border border-line bg-field px-3 py-3 font-mono text-sm leading-6 outline-none transition placeholder:text-ink-muted/70 focus:border-ink-muted"
              disabled={importing}
              placeholder={PracticeImportMachine.PracticeImportJsonExample}
              value={snapshot.context.jsonText}
              onValueChange={(jsonText) => {
                actor.trigger.changeJsonText({
                  jsonText,
                });
              }}
            />
          </Field.Root>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="min-h-5 text-sm font-bold text-ink-muted"
              role="status"
            >
              {snapshot.context.message}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                className="h-10 rounded-md px-4 text-sm font-black text-ink-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50"
                disabled={importing}
                focusableWhenDisabled
                onClick={() => {
                  actor.trigger.reset();
                }}
              >
                Clear
              </Button>
              <Button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-action px-4 text-sm font-black text-action-ink transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50"
                disabled={importing}
                focusableWhenDisabled
              >
                <Upload size={16} strokeWidth={2.5} />
                {importing ? "Importing" : "Import"}
              </Button>
            </div>
          </div>
        </Form>
      </section>
      {snapshot.matches("Imported") ? (
        <section className="flex flex-col gap-3 py-4 text-teal sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} strokeWidth={2.5} />
            <div className="text-sm font-black">
              {snapshot.context.importedCount} attempts are ready in history.
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-black transition hover:bg-field"
          >
            View history
          </Link>
        </section>
      ) : null}
    </div>
  );
}
