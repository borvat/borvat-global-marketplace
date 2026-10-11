import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ManagerShell,
  SELLER_NAV,
  Card,
  StatusBadge,
  toneForStatus,
  EmptyState,
} from "@/components/demo/shell";
import { Button } from "@/components/ui/button";
import { useActiveSellerWorkspace } from "@/hooks/useSellerData";
import {
  applicationErrorMessage,
  useSaveSellerApplication,
  useSellerApplication,
  useSubmitSellerApplication,
} from "@/hooks/useSellerApplication";

export const Route = createFileRoute("/_authenticated/seller/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Seller onboarding — Borvat Seller Manager" },
      {
        name: "description",
        content:
          "Complete and submit your Borvat seller application for legal verification review.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Seller onboarding — Borvat Seller Manager" },
      {
        property: "og:description",
        content: "Seller application and verification status.",
      },
    ],
  }),
  component: SellerOnboarding,
});

const STEP_ORDER = [
  "draft",
  "submitted",
  "under_review",
  "approved",
] as const;

const STEP_LABEL: Record<string, string> = {
  draft: "Prepare",
  submitted: "Submitted",
  under_review: "In review",
  approved: "Verified seller",
};

function Progress({ status }: { status: string }) {
  const idx =
    status === "approved"
      ? 3
      : status === "under_review"
        ? 2
        : status === "submitted"
          ? 1
          : 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEP_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span
            className={
              "rounded-md px-2 py-1 text-[12px] font-medium " +
              (i <= idx
                ? "bg-ink text-ink-foreground"
                : "border border-border bg-card text-muted-foreground")
            }
          >
            {STEP_LABEL[s]}
          </span>
          {i < STEP_ORDER.length - 1 ? (
            <span className="text-muted-foreground">→</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1 py-2">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-[13px] outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60";

function SellerOnboarding() {
  const { active, isLoading: wsLoading, error: wsError } = useActiveSellerWorkspace();
  const companyId = active?.company_id ?? null;
  const app = useSellerApplication(companyId);
  const save = useSaveSellerApplication(companyId);
  const submit = useSubmitSellerApplication(companyId);

  const [form, setForm] = useState({
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    categories: "",
    expected_monthly_orders: "",
    business_summary: "",
    seller_note: "",
  });

  const data = app.data ?? null;
  const status = data?.status ?? "draft";
  const editable = !data || status === "draft" || status === "information_required" || status === "rejected";

  useEffect(() => {
    if (!data) return;
    setForm({
      contact_name: data.contact_name ?? "",
      contact_email: data.contact_email ?? "",
      contact_phone: data.contact_phone ?? "",
      categories: (data.intended_categories ?? []).join(", "),
      expected_monthly_orders:
        data.expected_monthly_orders != null ? String(data.expected_monthly_orders) : "",
      business_summary: data.business_summary ?? "",
      seller_note: data.seller_note ?? "",
    });
  }, [data]);

  function onSave() {
    save.mutate(
      {
        store_id: active?.store_id ?? null,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        intended_categories: form.categories
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        expected_monthly_orders: form.expected_monthly_orders
          ? Number(form.expected_monthly_orders)
          : null,
        business_summary: form.business_summary || null,
        seller_note: form.seller_note || null,
      },
      {
        onSuccess: () => toast.success("Application saved"),
        onError: (e) => toast.error(applicationErrorMessage(e)),
      },
    );
  }

  function onSubmit() {
    submit.mutate(undefined, {
      onSuccess: () => toast.success("Application submitted for review"),
      onError: (e) => toast.error(applicationErrorMessage(e)),
    });
  }

  const shopName = active?.store_name ?? active?.company_name ?? "Seller Manager";

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={shopName}
      nav={SELLER_NAV}
      classification="REAL READ-ONLY"
      title="Onboarding"
      subtitle="Seller application and legal verification"
    >
      {wsError ? (
        <Card title="Data unavailable">
          <p className="text-[13px] text-muted-foreground">{wsError.message}</p>
        </Card>
      ) : !wsLoading && !companyId ? (
        <EmptyState title="No shop linked" hint="Your account is not linked to a seller company yet." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Card title="Application status">
              <div className="space-y-3 py-1">
                <Progress status={status} />
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <StatusBadge tone={toneForStatus(status)}>{status}</StatusBadge>
                  <span className="text-muted-foreground">
                    Legal identity: {data?.legal_status ?? "not started"}
                  </span>
                </div>
                {data?.information_required_reason && status === "information_required" ? (
                  <p className="rounded-md border border-border bg-muted p-2 text-[13px]">
                    <strong>Information requested:</strong> {data.information_required_reason}
                  </p>
                ) : null}
                {data?.rejection_reason && status === "rejected" ? (
                  <p className="rounded-md border border-border bg-muted p-2 text-[13px]">
                    <strong>Rejected:</strong> {data.rejection_reason}
                  </p>
                ) : null}
                {data?.suspension_reason && status === "suspended" ? (
                  <p className="rounded-md border border-border bg-muted p-2 text-[13px]">
                    <strong>Suspended:</strong> {data.suspension_reason}
                  </p>
                ) : null}
              </div>
            </Card>

            <Card title="Application details">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Contact name">
                  <input
                    className={inputCls}
                    disabled={!editable}
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  />
                </Field>
                <Field label="Contact e-mail">
                  <input
                    className={inputCls}
                    type="email"
                    disabled={!editable}
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  />
                </Field>
                <Field label="Contact phone">
                  <input
                    className={inputCls}
                    disabled={!editable}
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  />
                </Field>
                <Field label="Expected monthly orders">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    disabled={!editable}
                    value={form.expected_monthly_orders}
                    onChange={(e) =>
                      setForm({ ...form, expected_monthly_orders: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </Field>
              </div>
              <Field label="Intended categories" hint="Comma separated, maximum 20.">
                <input
                  className={inputCls}
                  disabled={!editable}
                  value={form.categories}
                  onChange={(e) => setForm({ ...form, categories: e.target.value })}
                />
              </Field>
              <Field label="Business summary">
                <textarea
                  className={inputCls + " h-24 py-2"}
                  disabled={!editable}
                  value={form.business_summary}
                  onChange={(e) => setForm({ ...form, business_summary: e.target.value })}
                />
              </Field>
              <Field label="Note to the review team">
                <textarea
                  className={inputCls + " h-20 py-2"}
                  disabled={!editable}
                  value={form.seller_note}
                  onChange={(e) => setForm({ ...form, seller_note: e.target.value })}
                />
              </Field>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" disabled={!editable || save.isPending} onClick={onSave}>
                  {save.isPending ? "Saving…" : "Save application"}
                </Button>
                <Button
                  size="sm"
                  disabled={
                    !data ||
                    submit.isPending ||
                    !(status === "draft" || status === "information_required")
                  }
                  onClick={onSubmit}
                >
                  {submit.isPending ? "Submitting…" : "Submit for review"}
                </Button>
              </div>
              <p className="pt-2 text-[11px] text-muted-foreground">
                Submission requires a complete legal identity with an active KvK number and VAT
                number. Approval is granted by Borvat platform administrators only.
              </p>
            </Card>
          </div>

          <Card title="History">
            {(data?.history ?? []).length === 0 ? (
              <p className="py-2 text-[13px] text-muted-foreground">No activity yet.</p>
            ) : (
              <ol className="space-y-2 py-1">
                {(data?.history ?? []).map((e, i) => (
                  <li key={i} className="border-b border-border pb-2 text-[12px] last:border-0">
                    <div className="font-medium">{e.event_type.replace(/_/g, " ")}</div>
                    <div className="text-muted-foreground">
                      {new Date(e.occurred_at).toLocaleString("en-GB")} · {e.actor_role}
                    </div>
                    {e.reason ? <div className="mt-1">{e.reason}</div> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </ManagerShell>
  );
}