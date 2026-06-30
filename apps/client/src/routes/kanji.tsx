import { createFileRoute } from "@tanstack/react-router";

import { KanjiLibraryContent } from "../lib/library-content.tsx";

export const Route = createFileRoute("/kanji")({
  component: KanjiRoute,
});

function KanjiRoute() {
  return <KanjiLibraryContent />;
}
