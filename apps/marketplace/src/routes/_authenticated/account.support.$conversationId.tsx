import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  DemoBanner,
  Card,
  StatusBadge,
  toneForStatus,
  DemoAction,
  EmptyState,
} from "@/components/demo/shell";
import { conversationById, messagesFor, caseById } from "@/demo/messages";
import { productById } from "@/demo/products";
import { quoteById } from "@/demo/quotes";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account/support/$conversationId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Support conversation (demo) — Borvat" },
      { name: "description", content: "Demo conversation between a customer and Borvat support." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Support conversation (demo) — Borvat" },
      { property: "og:description", content: "Demo conversation with Borvat support." },
    ],
  }),
  component: CustomerThread,
});

function CustomerThread() {
  const { conversationId } = useParams({
    from: "/_authenticated/account/support/$conversationId",
  });
  const conv = conversationById(conversationId);

  if (!conv || conv.channel !== "customer_borvat") {
    return (
      <div className="mx-auto max-w-3xl px-3 py-8">
        <EmptyState title="Conversation not found" hint="Go back to the overview." />
      </div>
    );
  }

  const messages = messagesFor(conv.id);
  const c = caseById(conv.caseId);
  const product = c?.links.productId ? productById(c.links.productId) : undefined;
  const quote = c?.links.quoteRequestId ? quoteById(c.links.quoteRequestId) : undefined;
  const offer = quote?.offers[quote.offers.length - 1];

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 md:px-4">
      <DemoBanner note="Customer view. Internal messages between Borvat and the seller are never shown here." />
      <div className="mb-3 mt-3">
        <Link to="/account/support" className="text-sm text-brand underline">
          ← Terug naar mijn support
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{conv.subject}</h1>
        <StatusBadge tone={toneForStatus(conv.status)}>{conv.status}</StatusBadge>
      </div>

      {product || offer ? (
        <Card className="mb-3" title="What this conversation is about">
          {product ? <div className="text-sm">{product.title}</div> : null}
          {product ? (
            <div className="text-xs text-muted-foreground">
              Prijs {formatEur(product.priceCents)} incl. btw · verzending apart · levering:{" "}
              {product.deliveryPromise}
            </div>
          ) : null}
          {offer ? (
            <div className="mt-2 rounded border border-border p-2 text-sm">
              Shipping quote v{offer.version}: {formatEur(offer.priceCents)} — {offer.etaText}
              <div className="mt-1 text-xs text-muted-foreground">
                Geldig tot {offer.expiresAt} ·{" "}
                <StatusBadge tone={toneForStatus(offer.status)}>{offer.status}</StatusBadge>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-[85%] rounded border border-border px-3 py-2 text-sm",
                m.author === "customer" ? "ml-auto bg-muted" : "bg-background",
              )}
            >
              <div className="mb-1 text-xs text-muted-foreground">
                {m.author === "customer" ? "Jij" : m.authorLabel} · {m.at}
              </div>
              {m.body}
              {m.attachment ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  📎 {m.attachment.name} ({m.attachment.sizeKb} kB)
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <textarea
            rows={3}
            placeholder="Type your message (demo — not sent)"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <DemoAction label="Versturen" variant="primary" />
          </div>
        </div>
      </Card>
    </div>
  );
}
