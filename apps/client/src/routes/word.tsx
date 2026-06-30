import { createFileRoute } from "@tanstack/react-router";

import { WordLibraryContent } from "../lib/library-content.tsx";

export const Route = createFileRoute("/word")({
  component: WordRoute,
});

function WordRoute() {
  return <WordLibraryContent />;
}
