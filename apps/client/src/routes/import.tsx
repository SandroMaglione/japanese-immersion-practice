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
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-black leading-tight">Import CSV</h1>
        <p className="text-sm font-semibold leading-6 text-ink-muted">
          Paste a drill export with English cue, User attempt, Result,
          Correction, Reason, and Pattern tag columns.
        </p>
      </section>
      <section className="rounded-md border border-line bg-panel p-4 sm:p-5">
        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-black">Source name</span>
            <input
              className="h-11 rounded-md border border-line bg-field px-3 text-sm font-bold outline-none transition placeholder:text-ink-muted/70 focus:border-ink"
              placeholder="meeting-small-talk.csv"
              value={snapshot.context.sourceFileName}
              onChange={(event) => {
                actor.trigger.changeSourceFileName({
                  sourceFileName: event.currentTarget.value,
                });
              }}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-black">CSV</span>
            <textarea
              className="min-h-80 resize-y rounded-md border border-line bg-field px-3 py-3 font-mono text-sm leading-6 outline-none transition placeholder:text-ink-muted/70 focus:border-ink"
              placeholder="No,English cue,User attempt,Result,Correction,Reason,Pattern tag"
              value={snapshot.context.csvText}
              onChange={(event) => {
                actor.trigger.changeCsvText({
                  csvText: event.currentTarget.value,
                });
              }}
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5 text-sm font-bold text-ink-muted">
              {snapshot.context.message}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-10 rounded-md border border-line bg-panel px-4 text-sm font-black text-ink-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
                disabled={importing}
                onClick={() => {
                  actor.trigger.reset();
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-black text-panel transition hover:bg-accent/90 disabled:opacity-50"
                disabled={importing}
                onClick={() => {
                  actor.trigger.importCsv();
                }}
              >
                <Upload size={16} strokeWidth={2.5} />
                {importing ? "Importing" : "Import"}
              </button>
            </div>
          </div>
        </div>
      </section>
      {snapshot.matches("Imported") ? (
        <section className="flex flex-col gap-3 rounded-md border border-teal/20 bg-teal-soft p-4 text-teal sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} strokeWidth={2.5} />
            <div className="text-sm font-black">
              {snapshot.context.importedCount} attempts are ready in history.
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-teal/25 bg-panel px-4 text-sm font-black"
          >
            View history
          </Link>
        </section>
      ) : null}
    </div>
  );
}
