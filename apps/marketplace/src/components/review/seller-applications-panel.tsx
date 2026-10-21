import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  FilterSelect,
  EmptyState,
  LoadingRows,
  Drawer,
} from "@/components/demo/shell";
import { Button } from "@/components/ui/button";
import {
  applicationErrorMessage,
  useAdminApplication,
  useAdminApplications,
  useReviewApplication,
  type ReviewAction,
} from "@/hooks/useSellerApplication";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "information_required", label: "Information required" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
  { value: "draft", label: "Draft" },
];

const ACTIONS_BY_STATUS: Record<
  string,
  { action: ReviewAction; label: string; needsReason: boolean; destructive?: boolean }[]
> = {
  submitted: [
    { action: "start_review", label: "Start review", needsReason: false },
    { action: "reject", label: "Reject", needsReason: true, destructive: true },
  ],
  under_review: [
    { action: "approve", label: "Approve", needsReason: false },
    { action: "request_information", label: "Request information", needsReason: true },
    { action: "reject", label: "Reject", needsReason: true, destructive: true },
  ],
  information_required: [
    { action: "reject", label: "Reject", needsReason: true, destructive: true },
  ],
  approved: [{ action: "suspend", label: "Suspend", needsReason: true, destructive: true }],
  suspended: [{ action: "reinstate", label: "Reinstate", needsReason: true }],
};

function fmt(v?: string | null) {
  return v ? new Date(v).toLocaleString("en-GB") : "—";
}

export function SellerApplicationsPanel() {
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const list = useAdminApplications(status);
  const detail = useAdminApplication(selected);
  const review = useReviewApplication();

  const current = detail.data ?? null;
  const actions = current ? (ACTIONS_BY_STATUS[current.status] ?? []) : [];

  function run(action: ReviewAction, needsReason: boolean) {
    if (!selected) return;
    if (needsReason && !reason.trim()) {
      toast.error("A reason is required for this decision.");
      return;
    }
    review.mutate(
      { applicationId: selected, action, reason: needsReason ? reason : null },
      {
        onSuccess: () => {
          toast.success("Decision recorded");
          setReason("");
        },
        onError: (e) => toast.error(applicationErrorMessage(e)),
      },
    );
  }

  return (
    <div className="space-y-3">
      <Card
        title="Verification queue"
        action={
          <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        }
      >
        {list.error ? (
          <p className="py-2 text-[13px] text-muted-foreground">
            {applicationErrorMessage(list.error)}
          </p>
        ) : (
          <DataTable
            columns={["Company", "Legal name", "Country", "Store", "Status", "Submitted", "Updated", ""]}
          >
            {list.isLoading ? (
              <LoadingRows rows={4} cols={8} />
            ) : (list.data ?? []).length === 0 ? null : (
              (list.data ?? []).map((r) => (
                <Row key={r.application_id}>
                  <Cell className="text-xs font-medium">{r.company_name ?? r.company_id}</Cell>
                  <Cell className="text-xs">{r.legal_name ?? "—"}</Cell>
                  <Cell className="text-xs">{r.registration_country ?? "—"}</Cell>
                  <Cell className="text-xs">{r.store_name ?? "—"}</Cell>
                  <Cell>
                    <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge>
                  </Cell>
                  <Cell className="text-xs">{fmt(r.submitted_at)}</Cell>
                  <Cell className="text-xs">{fmt(r.updated_at)}</Cell>
                  <Cell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelected(r.application_id);
                        setReason("");
                      }}
                    >
                      Review
                    </Button>
                  </Cell>
                </Row>
              ))
            )}
          </DataTable>
        )}
        {!list.isLoading && (list.data ?? []).length === 0 && !list.error ? (
          <EmptyState title="No applications" hint="No seller applications match this filter." />
        ) : null}
      </Card>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={current?.company_name ?? "Application"}
      >
        {detail.isLoading || !current ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge tone={toneForStatus(current.status)}>{current.status}</StatusBadge>
              <span className="text-[12px] text-muted-foreground">
                Legal identity: {current.legal_status ?? "—"}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
              <div>
                <dt className="text-muted-foreground">Legal name</dt>
                <dd>{current.legal_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Country</dt>
                <dd>{current.registration_country ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Contact</dt>
                <dd>{current.contact_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Expected monthly orders</dt>
                <dd>{current.expected_monthly_orders ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Categories</dt>
                <dd>{(current.intended_categories ?? []).join(", ") || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Business summary</dt>
                <dd className="whitespace-pre-wrap">{current.business_summary ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Seller note</dt>
                <dd className="whitespace-pre-wrap">{current.seller_note ?? "—"}</dd>
              </div>
            </dl>

            <div className="space-y-2 border-t border-border pt-3">
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-muted-foreground">
                  Reason / reviewer note
                </span>
                <textarea
                  className="h-20 w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] outline-none focus:ring-2 focus:ring-ring/40"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required for information requests, rejection, suspension and reinstatement."
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {actions.length === 0 ? (
                  <span className="text-[12px] text-muted-foreground">
                    No review action available in this state.
                  </span>
                ) : (
                  actions.map((a) => (
                    <Button
                      key={a.action}
                      size="sm"
                      variant={
                        a.destructive ? "destructive" : a.action === "approve" ? "default" : "outline"
                      }
                      disabled={review.isPending}
                      onClick={() => run(a.action, a.needsReason)}
                    >
                      {a.label}
                    </Button>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Reviewers cannot decide on applications for companies they are a member of.
              </p>
            </div>

            <div className="border-t border-border pt-3">
              <div className="mb-2 text-[12px] font-medium">History</div>
              <ol className="space-y-2">
                {(current.history ?? []).map((e, i) => (
                  <li key={i} className="border-b border-border pb-2 text-[12px] last:border-0">
                    <div className="font-medium">{e.event_type.replace(/_/g, " ")}</div>
                    <div className="text-muted-foreground">
                      {fmt(e.occurred_at)} · {e.actor_role}
                    </div>
                    {e.reason ? <div className="mt-1">{e.reason}</div> : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
