import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck, Store, Truck } from "lucide-react";
import { getPublicStoreProfile } from "@/lib/store-profile.functions";

const storeQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-store-profile", slug],
    queryFn: () => getPublicStoreProfile({ data: { slug } }),
  });

export const Route = createFileRoute("/store/$slug")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(storeQuery(params.slug)),
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Winkel op Borvat` },
      {
        name: "description",
        content: `De winkelpagina van ${params.slug} op Borvat. Smart living, made affordable.`,
      },
      { property: "og:title", content: `${params.slug} — Winkel op Borvat` },
      {
        property: "og:description",
        content: `Bekijk de winkelpagina van ${params.slug} op Borvat.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => <ComingSoon slug="" />,
  notFoundComponent: () => <ComingSoon slug="" />,
  component: StorePage,
});

function ComingSoon({ slug }: { slug: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Store className="h-8 w-8 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Winkel komt binnenkort</h1>
      <p className="mt-3 text-muted-foreground">
        {slug ? `De winkel "${slug}" is nog niet gepubliceerd.` : "Deze winkel is nog niet gepubliceerd."}{" "}
        Zodra de verkoper is geverifieerd en de winkel is vrijgegeven, verschijnt hier de
        volledige winkelpagina.
      </p>
    </main>
  );
}

function StorePage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(storeQuery(slug));

  if (!data) return <ComingSoon slug={slug} />;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-col gap-4 border-b pb-8 sm:flex-row sm:items-center">
        {data.logo_url ? (
          <img
            src={data.logo_url}
            alt={`Logo van ${data.display_name}`}
            className="h-20 w-20 rounded-2xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
            <Store className="h-8 w-8 text-muted-foreground" aria-hidden />
          </div>
        )}
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            {data.display_name}
            {data.verified_seller && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Geverifieerde verkoper
              </span>
            )}
          </h1>
          {data.short_description && (
            <p className="mt-2 text-muted-foreground">{data.short_description}</p>
          )}
        </div>
      </header>

      <section className="grid gap-8 py-8 sm:grid-cols-2">
        {data.full_description && (
          <article className="sm:col-span-2">
            <h2 className="mb-2 text-lg font-semibold">Over deze winkel</h2>
            <p className="whitespace-pre-line text-muted-foreground">{data.full_description}</p>
          </article>
        )}
        {data.shipping_countries.length > 0 && (
          <article>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <Truck className="h-4 w-4" aria-hidden /> Verzendlanden
            </h2>
            <p className="text-muted-foreground">{data.shipping_countries.join(", ")}</p>
          </article>
        )}
        {data.return_policy_summary && (
          <article>
            <h2 className="mb-2 text-lg font-semibold">Retourbeleid</h2>
            <p className="text-muted-foreground">{data.return_policy_summary}</p>
          </article>
        )}
        {data.warranty_summary && (
          <article>
            <h2 className="mb-2 text-lg font-semibold">Garantie</h2>
            <p className="text-muted-foreground">{data.warranty_summary}</p>
          </article>
        )}
        {data.customer_service_summary && (
          <article>
            <h2 className="mb-2 text-lg font-semibold">Klantenservice</h2>
            <p className="text-muted-foreground">{data.customer_service_summary}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Contact verloopt altijd via Borvat klantenservice.
            </p>
          </article>
        )}
      </section>

      {/* M1V-1D reserved: follow / follower count UI location. */}
    </main>
  );
}