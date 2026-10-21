import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ShellSkeleton } from "./components/demo/skeleton";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Keep the previous screen visible briefly instead of flashing a blank page,
    // then show a shell-shaped skeleton (never a white page).
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
    defaultPendingComponent: ShellSkeleton,
  });

  return router;
};
