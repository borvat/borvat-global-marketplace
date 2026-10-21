import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/review/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/review/seller-applications" });
  },
});
