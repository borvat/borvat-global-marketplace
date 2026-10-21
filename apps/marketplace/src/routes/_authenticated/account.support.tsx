import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/account/support")({
  ssr: false,
  component: () => <Outlet />,
});
