import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ManagerShell,
  SUPPORT_NAV,
  Card,
  StatusBadge,
  toneForStatus,
  DemoAction,
  EmptyState,
} from "@/components/demo/shell";
import {
  caseById,
  conversationById,
  messagesFor,
  demoCases,
} from "@/demo/messages";
import { productById } from "@/demo/products";
import { quoteById } from "@/demo/quotes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/support/cases/$caseId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Case workspace (demo) — Borvat Customer Service" },
      { name: "description", content: "Demo dual-channel case: customer side and merchant side bridged by Borvat staff." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Case workspace (demo) — Borvat" },
      { property: "og:description", content: "Demo dual-channel support case." },
    ],
  }),
  component: CaseWorkspace,
});

function Thread({
  title,
  note,
  conversationId,
}: {
  title: string;
  note: string;
  conversationId: string | null;
}) {
  const conv = conversationId ? conversationById(conversationId) : undefined;
  const messages = conversationId ? messagesFor(conversationId) : [];
  return (
    <Card title={title} description={note}>
      {!conv ? (
        <p className="text-sm text-muted-foreground">No conversation on this channel.</p>
      ) : (
        <>
          <div className="mb-3">
            <StatusBadge tone={toneForStatus(conv.status)}>{conv.status}</StatusBadge>
          </div>
          <ul className="space-y-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "max-w-[90%] rounded border border-border px-3 py-2 text-sm",
                  m.author === "borvat_agent" ? "ml-auto bg-muted" : "bg-background",
                )}
              >
                <div className="mb-1 text-xs text-muted-foreground">
                  {m.authorLabel} · {m.at}
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
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              rows={2}
              placeholder="Reply as Borvat (demo — not sent)"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <DemoAction label="Send" variant="primary" />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function CaseWorkspace() {
  const { caseId } = useParams({ from: "/_authenticated/support/cases/$caseId" });
  const c = caseById(caseId);

  if (!c) {
    return (
      <ManagerShell navTitle="Customer Service" nav={SUPPORT_NAV} title="Case not found">
        <EmptyState title="This demo case does not exist" hint="Pick a case from one of the inboxes." />
      </ManagerShell>
    );
  }

  const product = c.links.productId ? productById(c.links.productId) : undefined;
  const quote = c.links.quoteRequestId ? quoteById(c.links.quoteRequestId) : undefined;

  return (
    <ManagerShell
      navTitle="Customer Service"
      nav={SUPPORT_NAV}
      title={c.title}
      subtitle="Internal bridge — staff sees both channels; customer and seller never talk directly."
      actions={<DemoAction label="Resolve case" variant="primary" />}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {demoCases.map((x) => (
          <Link
            key={x.id}
            to="/support/cases/$caseId"
            params={{ caseId: x.id }}
            className={cn(
              "rounded border border-border px-2.5 py-1.5 text-xs",
              x.id === c.id ? "bg-brand text-brand-foreground" : "bg-card text-muted-foreground",
            )}
          >
            {x.id}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Case details" className="lg:col-span-1">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge tone={toneForStatus(c.status)}>{c.status}</StatusBadge>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Priority</span>
              <StatusBadge tone={c.priority === "high" ? "bad" : c.priority === "normal" ? "warn" : "neutral"}>
                {c.priority}
              </StatusBadge>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Type</span>
              <span>{c.type.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Opened</span>
              <span>{c.openedAt}</span>
            </div>
            <p className="pt-2 text-muted-foreground">{c.summary}</p>
          </div>
        </Card>

        <Card title="Linked records" className="lg:col-span-2">
          <ul className="space-y-2 text-sm">
            {product ? (
              <li>
                <span className="text-muted-foreground">Product:</span> {product.title} ({product.sku})
              </li>
            ) : null}
            {quote ? (
              <li>
                <span className="text-muted-foreground">Quote request:</span> {quote.id} ·{" "}
                <StatusBadge tone={toneForStatus(quote.status)}>{quote.status}</StatusBadge>
              </li>
            ) : null}
            {c.links.quoteOfferId ? (
              <li>
                <span className="text-muted-foreground">Offer:</span> {c.links.quoteOfferId}
              </li>
            ) : null}
            {c.links.orderPlaceholder ? (
              <li>
                <span className="text-muted-foreground">Order:</span> {c.links.orderPlaceholder}{" "}
                <StatusBadge tone="neutral">demo placeholder</StatusBadge>
              </li>
            ) : null}
            {!product && !quote && !c.links.orderPlaceholder ? (
              <li className="text-muted-foreground">No linked records.</li>
            ) : null}
          </ul>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Thread
          title="Customer ↔ Borvat"
          note="Visible to the customer"
          conversationId={c.customerConversationId}
        />
        <Thread
          title="Borvat ↔ Merchant"
          note="Internal to Borvat and the seller — never shown to the customer"
          conversationId={c.merchantConversationId}
        />
      </div>
    </ManagerShell>
  );
}
