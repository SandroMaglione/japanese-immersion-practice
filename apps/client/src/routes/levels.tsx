import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/levels")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
