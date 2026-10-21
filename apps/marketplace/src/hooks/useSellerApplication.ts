import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* M1V-1D — Seller application & verification workflow                 */
/* Every read and write goes through a security-definer RPC.           */
/* No client-supplied approval metadata, no direct table access.       */
/* ------------------------------------------------------------------ */

export type SellerApplicationEvent = {
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_role: string;
  reason: string | null;
  occurred_at: string;
};

export type SellerApplication = {
  id: string;
  company_id: string;
  store_id: string | null;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  intended_categories: string[];
  expected_monthly_orders: number | null;
  business_summary: string | null;
  seller_note: string | null;
  reviewer_note: string | null;
  information_required_reason: string | null;
  rejection_reason: string | null;
  suspension_reason: string | null;
  submitted_at: string | null;
  review_started_at: string | null;
  information_requested_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
  company_name: string | null;
  legal_name: string | null;
  registration_country: string | null;
  legal_status: string | null;
  history: SellerApplicationEvent[];
};

export type AdminApplicationRow = {
  application_id: string;
  company_id: string;
  company_name: string | null;
  legal_name: string | null;
  registration_country: string | null;
  store_id: string | null;
  store_name: string | null;
  status: string;
  legal_status: string | null;
  contact_name: string | null;
  submitted_at: string | null;
  review_started_at: string | null;
  updated_at: string;
  created_at: string;
};

export type ReviewAction =
  | "start_review"
  | "request_information"
  | "approve"
  | "reject"
  | "suspend"
  | "reinstate";

async function rpcOne<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

async function rpcMany<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

/* ---------------------------- seller side --------------------------- */

export function useSellerApplication(companyId?: string | null) {
  return useQuery({
    queryKey: ["seller", "application", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rpcOne<SellerApplication>("seller_get_application", { p_company_id: companyId }),
  });
}

export type SellerApplicationDraft = {
  store_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  intended_categories?: string[] | null;
  expected_monthly_orders?: number | null;
  business_summary?: string | null;
  seller_note?: string | null;
};

export function useSaveSellerApplication(companyId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: SellerApplicationDraft) =>
      rpcOne<SellerApplication>("seller_upsert_application", {
        p_company_id: companyId,
        p_store_id: draft.store_id ?? null,
        p_contact_name: draft.contact_name ?? null,
        p_contact_email: draft.contact_email ?? null,
        p_contact_phone: draft.contact_phone ?? null,
        p_intended_categories: draft.intended_categories ?? null,
        p_expected_monthly_orders: draft.expected_monthly_orders ?? null,
        p_business_summary: draft.business_summary ?? null,
        p_seller_note: draft.seller_note ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seller", "application", companyId] }),
  });
}

export function useSubmitSellerApplication(companyId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      rpcOne<SellerApplication>("seller_submit_application", { p_company_id: companyId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seller", "application", companyId] }),
  });
}

/* ---------------------------- admin side ---------------------------- */

export function useAdminApplications(status?: string | null) {
  return useQuery({
    queryKey: ["admin", "seller-applications", status ?? "all"],
    queryFn: () =>
      rpcMany<AdminApplicationRow>("admin_list_seller_applications", {
        p_status: status && status !== "all" ? status : null,
        p_limit: 200,
        p_offset: 0,
      }),
  });
}

export function useAdminApplication(applicationId?: string | null) {
  return useQuery({
    queryKey: ["admin", "seller-application", applicationId],
    enabled: Boolean(applicationId),
    queryFn: () =>
      rpcOne<SellerApplication>("admin_get_seller_application", {
        p_application_id: applicationId,
      }),
  });
}

export function useReviewApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { applicationId: string; action: ReviewAction; reason?: string | null }) =>
      rpcOne<SellerApplication>("admin_review_seller_application", {
        p_application_id: input.applicationId,
        p_action: input.action,
        p_reason: input.reason?.trim() ? input.reason.trim() : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "seller-applications"] });
      qc.invalidateQueries({ queryKey: ["admin", "seller-application"] });
    },
  });
}

/** Human-readable message for the RPC error codes raised by the workflow. */
export function applicationErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const map: Record<string, string> = {
    not_authorised: "You are not a member of this company.",
    not_authenticated: "Please sign in again.",
    not_platform_admin: "This action is restricted to platform administrators.",
    self_review_forbidden:
      "You cannot review an application for a company you are a member of.",
    application_missing: "Save the application before submitting it.",
    application_incomplete:
      "Contact name, contact e-mail and at least one category are required.",
    legal_identity_incomplete:
      "Complete the legal identity (legal name, country, address, city) first.",
    legal_identifiers_incomplete: "An active KvK number and VAT number are required.",
    application_not_editable: "This application can no longer be edited.",
    not_submittable: "This application cannot be submitted in its current state.",
    reason_required: "A reason is required for this decision.",
    invalid_transition: "That action is not allowed from the current state.",
    application_not_found: "Application not found.",
    store_not_in_company: "The selected store does not belong to this company.",
  };
  for (const key of Object.keys(map)) if (raw.includes(key)) return map[key];
  return raw || "Something went wrong.";
}
