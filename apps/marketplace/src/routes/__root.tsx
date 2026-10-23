import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  notFound,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";
import { IsolatedCommerceProvider } from "../components/commercial/application-provider";
import { ISOLATED_COMMERCE, isIsolatedCommercePath } from "../lib/commercial/runtime-mode";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Pagina niet gevonden.</p>
        <a href="/" className="mt-6 inline-block bg-brand text-brand-foreground px-4 py-2 rounded">
          Naar de homepage
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Er ging iets mis</h1>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 bg-brand text-brand-foreground px-4 py-2 rounded"
        >
          Opnieuw proberen
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: ({ location }) => {
    if (ISOLATED_COMMERCE && !isIsolatedCommercePath(location.pathname)) throw notFound();
    return {};
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "marktje — koop en verkoop alles online" },
      {
        name: "description",
        content:
          "Ontdek deals op boeken, elektronica, mode en meer. Snelle bezorging, veilig betalen.",
      },
      { property: "og:title", content: "marktje — koop en verkoop alles online" },
      {
        property: "og:description",
        content: "Ontdek deals op boeken, elektronica, mode en meer. Snelle bezorging, veilig betalen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "marktje — koop en verkoop alles online" },
      { name: "twitter:description", content: "Ontdek deals op boeken, elektronica, mode en meer. Snelle bezorging, veilig betalen." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0d98e7f7-6cfe-41bd-954a-eb88b64ad76b/id-preview-a3cb0167--092a5ea2-1dc1-4ffd-a4b4-efe2d3237298.lovable.app-1784817611933.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0d98e7f7-6cfe-41bd-954a-eb88b64ad76b/id-preview-a3cb0167--092a5ea2-1dc1-4ffd-a4b4-efe2d3237298.lovable.app-1784817611933.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      ...(ISOLATED_COMMERCE ? [] : [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      ]),
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const country = useRouterState({ select: (s) => s.location.searchStr });
  return (
    <html lang={ISOLATED_COMMERCE ? (new URLSearchParams(country).get("country") === "BE" ? "nl-BE" : "nl-NL") : "nl"}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NavProgress() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const isLoading = useRouterState({ select: (s) => s.status === "pending" || s.isLoading });
  if (!hydrated || !isLoading) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-transparent">
      <div className="brv-progress h-full w-1/3 bg-accent" />
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isManagerSurface =
    pathname === "/owner-review" ||
    pathname.startsWith("/seller/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/review/") ||
    pathname.startsWith("/support/");

  useEffect(() => {
    if (ISOLATED_COMMERCE) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);
  if (ISOLATED_COMMERCE) return (
    <QueryClientProvider client={queryClient}>
      <IsolatedCommerceProvider><Outlet /></IsolatedCommerceProvider>
    </QueryClientProvider>
  );
  return (
    <QueryClientProvider client={queryClient}>
      <div
        className={
          isManagerSurface
            ? "flex min-h-screen flex-col bg-surface"
            : "flex min-h-screen flex-col bg-background"
        }
      >
        <NavProgress />
        {isManagerSurface ? null : <SiteHeader />}
        <main className="flex-1">
          <Outlet />
        </main>
        {isManagerSurface ? null : <SiteFooter />}
        <Toaster position="top-center" richColors />
      </div>
    </QueryClientProvider>
  );
}

