import { useState } from "react";

export const STATUS_OPTIONS = ["", "draft", "active", "inactive", "archived"] as const;
export type StatusFilter = (typeof STATUS_OPTIONS)[number];

export function useCursorStack() {
  const [stack, setStack] = useState<Array<{ created_at: string; id: string } | null>>([null]);
  const current = stack[stack.length - 1];
  const push = (c: { created_at: string; id: string }) => setStack((s) => [...s, c]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const reset = () => setStack([null]);
  return { current, push, back, reset, canBack: stack.length > 1 };
}

export function Toolbar({
  search,
  setSearch,
  status,
  setStatus,
  onApply,
}: {
  search: string;
  setSearch: (v: string) => void;
  status: StatusFilter;
  setStatus: (v: StatusFilter) => void;
  onApply: () => void;
}) {
  return (
    <form
      className="flex flex-wrap gap-2 mb-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <input
        type="text"
        maxLength={100}
        placeholder="Search (company, store, slug…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="px-3 py-2 text-sm border border-border rounded bg-background flex-1 min-w-[200px]"
      />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as StatusFilter)}
        className="px-3 py-2 text-sm border border-border rounded bg-background"
      >
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="archived">Archived</option>
      </select>
      <button
        type="submit"
        className="px-3 py-2 text-sm rounded bg-foreground text-background hover:opacity-90"
      >
        Apply
      </button>
    </form>
  );
}

export function Pager({
  canBack,
  hasMore,
  onBack,
  onNext,
}: {
  canBack: boolean;
  hasMore: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 mt-3">
      <button
        onClick={onBack}
        disabled={!canBack}
        className="px-3 py-1.5 text-sm rounded border border-border disabled:opacity-40"
      >
        Previous
      </button>
      <button
        onClick={onNext}
        disabled={!hasMore}
        className="px-3 py-1.5 text-sm rounded border border-border disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
      {value}
    </span>
  );
}

export function fmtDate(iso: string) {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

export function friendlyError(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? "";
  if (msg.includes("not_authenticated")) return "Session expired. Please sign in again.";
  if (msg.includes("not_platform_admin") || msg.includes("insufficient_privilege"))
    return "Access denied.";
  if (msg.includes("search_too_long")) return "Search must be 100 characters or fewer.";
  if (msg.includes("invalid_status_filter")) return "Invalid status filter.";
  if (msg.includes("invalid_cursor")) return "Invalid pagination cursor.";
  return "Read failed.";
}
