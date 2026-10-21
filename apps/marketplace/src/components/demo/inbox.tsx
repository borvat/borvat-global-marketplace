// DEMO UI — frontend only. Shared three-column inbox pieces for the
// Customer Service and Seller messaging workspaces.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  DemoAction,
  InboxLayout,
  SearchInput,
  StatusBadge,
  toneForStatus,
} from "@/components/demo/shell";
import {
  caseById,
  conversationsByChannel,
  messagesFor,
  type DemoChannel,
  type DemoConversation,
} from "@/demo/messages";

const FILTERS = ["All", "Unassigned", "SLA risk", "Waiting", "Resolved"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(c: DemoConversation, f: Filter) {
  switch (f) {
    case "Unassigned":
      return !c.assignee;
    case "SLA risk":
      return Boolean(c.slaBreached) || (c.sla ?? "").startsWith("0h");
    case "Waiting":
      return c.status === "waiting_customer" || c.status === "waiting_merchant";
    case "Resolved":
      return c.status === "resolved";
    default:
      return true;
  }
}

export function ChannelInbox({
  channel,
  emptyHint,
  composerHint,
  viewer = "support",
}: {
  channel: DemoChannel;
  emptyHint: string;
  composerHint: string;
  /** "merchant" hides every trace of customer identity from the seller workspace. */
  viewer?: "support" | "merchant";
}) {
  const isMerchantView = viewer === "merchant";
  const anonymise = (label: string) =>
    isMerchantView && /\(customer\)|customer/i.test(label) ? "Borvat customer" : label;
  const all = useMemo(() => conversationsByChannel(channel), [channel]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [selected, setSelected] = useState(all[0]?.id ?? "");

  const rows = all.filter(
    (c) =>
      matchesFilter(c, filter) &&
      (q.trim() === "" ||
        (c.subject + c.participantLabel).toLowerCase().includes(q.trim().toLowerCase())),
  );
  const active = all.find((c) => c.id === selected) ?? rows[0];
  const thread = active ? messagesFor(active.id) : [];
  const kase = active ? caseById(active.caseId) : undefined;

  return (
    <InboxLayout
      list={
        <>
          <div className="space-y-2 border-b border-border p-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search conversations…" />
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                    filter === f
                      ? "border-ink bg-ink text-ink-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="p-4 text-[13px] text-muted-foreground">{emptyHint}</p>
            ) : (
              rows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={cn(
                    "block w-full border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    active?.id === c.id && "bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold">{anonymise(c.participantLabel)}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {c.lastActivity.slice(5)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{c.subject}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <StatusBadge tone={toneForStatus(c.status)}>{c.status}</StatusBadge>
                    {c.sla ? (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          c.slaBreached
                            ? "bg-red-50 text-red-700"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        SLA {c.sla}
                      </span>
                    ) : null}
                    {c.unread ? (
                      <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                        {c.unread}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      }
      thread={
        active ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-semibold">{active.subject}</h2>
                <p className="truncate text-[12px] text-muted-foreground">
                  {anonymise(active.participantLabel)} · {kase?.title ?? active.caseId}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <DemoAction label="Assign" size="sm" />
                <DemoAction label="Snooze" size="sm" />
                <DemoAction label="Resolve" size="sm" variant="primary" />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/25 p-3">
              {thread.map((m) => {
                const mine = m.author === "borvat_agent";
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-md border px-3 py-2 text-[13px] shadow-xs",
                        mine
                          ? "border-ink/15 bg-ink text-ink-foreground"
                          : "border-border bg-card text-foreground",
                      )}
                    >
                      <div
                        className={cn(
                          "mb-1 flex items-center gap-2 text-[11px]",
                          mine ? "text-ink-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        <span className="font-semibold">{m.author === "customer" ? anonymise(m.authorLabel) : m.authorLabel}</span>
                        <span>{m.at}</span>
                      </div>
                      <p className="leading-relaxed">{m.body}</p>
                      {m.attachment ? (
                        <p
                          className={cn(
                            "mt-1.5 text-[11px]",
                            mine ? "text-ink-foreground/70" : "text-muted-foreground",
                          )}
                        >
                          📎 {m.attachment.name} · {m.attachment.sizeKb} KB
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border p-2">
              <textarea
                rows={3}
                readOnly
                placeholder={composerHint}
                className="w-full resize-none rounded-md border border-border bg-background p-2 text-[13px] outline-none"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  <DemoAction label="Template" size="sm" variant="ghost" />
                  <DemoAction label="Attach" size="sm" variant="ghost" />
                  <DemoAction label="Internal note" size="sm" variant="ghost" />
                </div>
                <DemoAction label="Send reply" size="sm" variant="primary" />
              </div>
            </div>
          </>
        ) : (
          <p className="p-6 text-[13px] text-muted-foreground">{emptyHint}</p>
        )
      }
      context={
        active && kase ? (
          <div className="space-y-4 p-3 text-[13px]">
            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Case
              </h3>
              <p className="font-semibold">{kase.title}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{kase.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <StatusBadge tone={toneForStatus(kase.status)}>{kase.status}</StatusBadge>
                <StatusBadge tone={kase.priority === "high" ? "danger" : "neutral"}>
                  {kase.priority}
                </StatusBadge>
                <StatusBadge tone="info">{kase.type}</StatusBadge>
              </div>
            </section>
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Handling
              </h3>
              {isMerchantView ? null : (
                <Field label="Assignee" value={active.assignee ?? "Unassigned"} />
              )}
              <Field label="SLA remaining" value={active.sla ?? "—"} />
              <Field label="Opened" value={kase.openedAt} />
              <Field label="Channel" value={channel === "customer_borvat" ? "Customer ↔ Borvat" : "Borvat ↔ Seller"} />
            </section>
            {active.tags?.length ? (
              <section>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-1">
                  {active.tags.map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Linked records
              </h3>
              {Object.entries(kase.links).map(([k, v]) => (
                <Field key={k} label={k} value={String(v)} />
              ))}
            </section>
            <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
              {isMerchantView ? (
                <DemoAction label="Request Borvat callback" size="md" />
              ) : (
                <Link
                  to="/support/cases/$caseId"
                  params={{ caseId: kase.id }}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted"
                >
                  Open full case
                </Link>
              )}
              {isMerchantView ? null : <DemoAction label="Escalate" size="md" />}
            </div>
          </div>
        ) : null
      }
    />
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="truncate text-right text-[12px] font-medium">{value}</span>
    </div>
  );
}
