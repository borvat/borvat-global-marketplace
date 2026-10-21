import { createFileRoute, Link } from "@tanstack/react-router";
import { DemoBanner, Card, StatusBadge, toneForStatus, DemoAction } from "@/components/demo/shell";
import { conversationsByChannel, caseById } from "@/demo/messages";
import { productById } from "@/demo/products";
import { quoteById } from "@/demo/quotes";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/account/support/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mijn support (demo) — Borvat" },
      { name: "description", content: "Demo customer view of conversations with Borvat support." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Mijn support (demo) — Borvat" },
      { property: "og:description", content: "Demo customer view of support conversations." },
    ],
  }),
  component: AccountSupport,
});

function AccountSupport() {
  const threads = conversationsByChannel("customer_borvat");

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 md:px-4">
      <DemoBanner note="Customer view of the support area. Every conversation below is demo data." />
      <div className="mb-4 mt-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Mijn support</h1>
          <p className="text-sm text-muted-foreground">
            You always talk to Borvat. We contact the seller on your behalf when needed.
          </p>
        </div>
        <DemoAction label="Ask a new question" variant="primary" />
      </div>

      <div className="space-y-3">
        {threads.map((t) => {
          const c = caseById(t.caseId);
          const product = c?.links.productId ? productById(c.links.productId) : undefined;
          const quote = c?.links.quoteRequestId ? quoteById(c.links.quoteRequestId) : undefined;
          const offer = quote?.offers[quote.offers.length - 1];
          return (
            <Card key={t.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{t.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    Last message: {t.lastActivity}
                  </div>
                </div>
                <StatusBadge tone={toneForStatus(t.status)}>{t.status}</StatusBadge>
              </div>

              {product ? (
                <div className="mt-2 text-sm text-muted-foreground">Product: {product.title}</div>
              ) : null}
              {offer ? (
                <div className="mt-1 text-sm text-muted-foreground">
                  Shipping quote: {formatEur(offer.priceCents)} · {offer.etaText} ·{" "}
                  <StatusBadge tone={toneForStatus(offer.status)}>{offer.status}</StatusBadge>
                </div>
              ) : null}

              <div className="mt-3">
                <Link
                  to="/account/support/$conversationId"
                  params={{ conversationId: t.id }}
                  className="inline-block rounded bg-brand px-3 py-1.5 text-sm text-brand-foreground"
                >
                  Gesprek openen
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
