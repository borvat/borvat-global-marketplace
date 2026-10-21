import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Globe,
  Info,
  Menu,
  Search,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useActiveSellerWorkspace } from "@/hooks/useSellerData";


export type Classification = "DEMO DATA" | "REAL READ-ONLY" | "PLACEHOLDER";

/* ------------------------------------------------------------------ */
/* Workspace identity                                                  */
/* ------------------------------------------------------------------ */

export type Workspace = "seller" | "admin" | "support";

const workspaceTheme: Record<
  Workspace,
  { bar: string; sub: string; accent: string; chip: string; label: string; rule: string; ruleAfter: string }
> = {
  seller: {
    bar: "bg-ink text-ink-foreground",
    sub: "bg-ink-soft text-ink-foreground/85",
    accent: "text-accent",
    chip: "bg-accent/20 text-ink-foreground",
    label: "Seller Manager",
    rule: "bg-accent",
    ruleAfter: "after:bg-accent",
  },
  admin: {
    bar: "bg-ink text-ink-foreground",
    sub: "bg-ink-soft text-ink-foreground/85",
    accent: "text-amber-400",
    chip: "bg-amber-400/20 text-amber-100",
    label: "Borvat Admin",
    rule: "bg-amber-400",
    ruleAfter: "after:bg-amber-400",
  },
  support: {
    bar: "bg-ink text-ink-foreground",
    sub: "bg-ink-soft text-ink-foreground/85",
    accent: "text-teal-300",
    chip: "bg-teal-400/20 text-teal-100",
    label: "Customer Service",
    rule: "bg-teal-300",
    ruleAfter: "after:bg-teal-300",
  },
};

export type NavItem = { to: string; label: string; children?: NavItem[]; badge?: number };

/* ------------------------------------------------------------------ */
/* Chrome pieces                                                       */
/* ------------------------------------------------------------------ */

function DemoModeChip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-sm border border-white/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10"
      >
        Demo mode
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-sm border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
          Frontend fixtures — no production writes. Nothing on these screens reads
          from or writes to the database.
        </div>
      ) : null}
    </div>
  );
}

export function ClassificationChip({
  classification = "DEMO DATA",
}: {
  classification?: Classification;
}) {
  const style =
    classification === "DEMO DATA"
      ? "border-border bg-muted text-muted-foreground"
      : classification === "REAL READ-ONLY"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        style,
      )}
    >
      {classification}
    </span>
  );
}

/** Kept for compatibility; renders a single compact inline note. */
export function DemoBanner({ note }: { note?: string; classification?: Classification }) {
  if (!note) return null;
  return <p className="text-xs text-muted-foreground">{note}</p>;
}

function TopNavLink({
  item,
  pathname,
  theme,
}: {
  item: NavItem;
  pathname: string;
  theme: (typeof workspaceTheme)[Workspace];
}) {
  const [open, setOpen] = useState(false);
  const active =
    pathname === item.to ||
    pathname.startsWith(item.to + "/") ||
    (item.children ?? []).some((c) => pathname === c.to || pathname.startsWith(c.to + "/"));

  const base = cn(
    "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium leading-5 text-white/75 transition-colors hover:text-white",
    active && "font-semibold text-white",
    active &&
      cn(
        "after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full",
        theme.ruleAfter,
      ),
  );

  if (!item.children?.length) {
    return (
      <Link to={item.to} className={base}>
        {item.label}
        {item.badge ? (
          <span className={cn("rounded-sm px-1 text-[10px] font-bold", theme.chip)}>
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" onClick={() => setOpen((v) => !v)} className={base}>
        {item.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 min-w-56 rounded-sm border border-border bg-popover py-1 shadow-xl">
          {item.children.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-[13px] text-popover-foreground hover:bg-muted"
            >
              {c.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ShopSwitcher({ shopName }: { shopName: string }) {
  const [open, setOpen] = useState(false);
  const { workspaces, active, select } = useActiveSellerWorkspace();
  const label = active?.store_name ?? active?.company_name ?? shopName;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[220px] items-center gap-1.5 rounded-sm bg-white/10 px-2 py-1 text-[13px] text-white hover:bg-white/15"
      >
        <Store className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-sm border border-border bg-popover py-1 text-popover-foreground shadow-xl">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Current shop
          </div>
          <div className="px-3 pb-2 text-sm font-semibold">{label}</div>
          <div className="border-t border-border" />
          {workspaces.length > 0 ? (
            <div className="max-h-56 overflow-auto py-1">
              {workspaces.map((w) => {
                const isActive =
                  active?.company_id === w.company_id && active?.store_id === w.store_id;
                return (
                  <button
                    key={`${w.company_id}:${w.store_id ?? "none"}`}
                    type="button"
                    onClick={() => {
                      select(w);
                      setOpen(false);
                    }}
                    className={cn(
                      "block w-full truncate px-3 py-1.5 text-left text-[13px] hover:bg-muted",
                      isActive && "font-semibold",
                    )}
                  >
                    {w.store_name ?? w.company_name}
                    <span className="block text-[11px] text-muted-foreground">
                      {w.company_name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-2 text-[12px] text-muted-foreground">
              No authorised shop found for this account.
            </div>
          )}
          <div className="border-t border-border" />
          <Link to="/seller/store" className="block px-3 py-1.5 text-[13px] hover:bg-muted">
            Store settings
          </Link>
          <Link to="/seller/settings" className="block px-3 py-1.5 text-[13px] hover:bg-muted">
            Apps &amp; integrations
          </Link>
          <Link to="/account" className="block px-3 py-1.5 text-[13px] hover:bg-muted">
            Log out
          </Link>
        </div>
      ) : null}
    </div>
  );
}


export function ManagerShell({
  title,
  subtitle,
  nav,
  navTitle,
  children,
  actions,
  workspace,
  shopName,
  classification = "DEMO DATA",
  tabs,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  navTitle: string;
  children: ReactNode;
  actions?: ReactNode;
  workspace?: Workspace;
  shopName?: string;
  classification?: Classification;
  tabs?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ws: Workspace = workspace ?? (pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/support")
      ? "support"
      : "seller");
  const theme = workspaceTheme[ws];
  const [userMenu, setUserMenu] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const flat = nav.flatMap((n) => [n, ...(n.children ?? [])]);
  const current =
    flat.find((n) => n.to === pathname) ?? flat.find((n) => pathname.startsWith(n.to + "/"));

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      <header className="sticky top-0 z-40">
        <div className={theme.bar}>
          <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-3 py-2 xl:px-6">
            <button
              type="button"
              onClick={() => setMobileNav(true)}
              className="rounded-sm p-1 hover:bg-white/10 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" className="shrink-0 text-base font-black tracking-tight">
              borvat<span className={theme.accent}>.</span>
            </Link>
            <span className={cn("hidden rounded-sm px-1.5 py-0.5 text-[11px] font-semibold sm:inline", theme.chip)}>
              {theme.label}
            </span>
            {ws === "seller" && shopName ? (
              <div className="hidden md:block">
                <ShopSwitcher shopName={shopName} />
              </div>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden lg:block">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/60" />
                <input
                  placeholder="Search orders, SKU, EAN…"
                  className="w-56 rounded-sm border border-white/20 bg-white/10 py-1 pl-7 pr-2 text-[13px] text-white placeholder:text-white/55 focus:outline-none focus:ring-1 focus:ring-white/40"
                />
              </div>
              <DemoModeChip />
              <button
                type="button"
                onClick={() => toast.info("Demo notifications", { description: "3 unread items" })}
                className="relative rounded-sm p-1 hover:bg-white/10"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-red-400" />
              </button>
              <button
                type="button"
                onClick={() => toast.info("Help centre", { description: "Demo placeholder" })}
                className="hidden rounded-sm p-1 hover:bg-white/10 sm:block"
                aria-label="Help"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
              <span className="hidden items-center gap-1 text-[12px] text-white/80 sm:flex">
                <Globe className="h-3.5 w-3.5" /> NL
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenu((v) => !v)}
                  className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-[13px] text-white/85 hover:bg-white/10"
                >
                  {navTitle}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {userMenu ? (
                  <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-sm border border-border bg-popover py-1 text-popover-foreground shadow-xl">
                    <Link to="/owner-review" className="block px-3 py-1.5 text-[13px] hover:bg-muted">
                      Owner review hub
                    </Link>
                    <Link to="/seller/manager" className="block px-3 py-1.5 text-[13px] hover:bg-muted">
                      Seller Manager
                    </Link>
                    <Link to="/admin/dashboard" className="block px-3 py-1.5 text-[13px] hover:bg-muted">
                      Borvat Admin
                    </Link>
                    <Link
                      to="/support/inbox/customers"
                      className="block px-3 py-1.5 text-[13px] hover:bg-muted"
                    >
                      Customer Service
                    </Link>
                    <div className="border-t border-border" />
                    <Link to="/account" className="block px-3 py-1.5 text-[13px] hover:bg-muted">
                      Account
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className={cn(theme.sub, "hidden lg:block")}>
          <div className="mx-auto flex w-full max-w-[1600px] items-center px-3 xl:px-6">
            <nav className="flex flex-1 items-center overflow-x-auto">
              {nav.map((n) => (
                <TopNavLink key={n.to} item={n} pathname={pathname} theme={theme} />
              ))}
            </nav>
          </div>
        </div>
      </header>

      {mobileNav ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" onClick={() => setMobileNav(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative flex h-full w-72 flex-col overflow-y-auto bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn("flex items-center justify-between px-3 py-2", theme.bar)}>
              <span className="text-sm font-bold">{theme.label}</span>
              <button type="button" onClick={() => setMobileNav(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="p-2">
              {nav.map((n) => (
                <div key={n.to} className="mb-1">
                  <Link
                    to={n.to}
                    onClick={() => setMobileNav(false)}
                    className={cn(
                      "block rounded-sm px-2 py-1.5 text-sm",
                      pathname === n.to ? "bg-muted font-semibold" : "hover:bg-muted",
                    )}
                  >
                    {n.label}
                  </Link>
                  {n.children?.map((c) => (
                    <Link
                      key={c.to}
                      to={c.to}
                      onClick={() => setMobileNav(false)}
                      className="block rounded-sm px-4 py-1.5 text-[13px] text-muted-foreground hover:bg-muted"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      <div className="border-b border-border bg-background">
        <div className="mx-auto w-full max-w-[1600px] px-3 pt-3 xl:px-6">
          <nav className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Link to={nav[0].to} className="hover:underline">
              {navTitle}
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{current?.label ?? title}</span>
          </nav>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 pb-2">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
              {subtitle ? (
                <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <ClassificationChip classification={classification} />
              {actions}
            </div>
          </div>
          {tabs}
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-3 xl:px-6">{children}</main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

export function Card({
  title,
  description,
  children,
  className,
  action,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-md border border-border bg-card shadow-xs", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold">{title}</h2>
            {description ? (
              <p className="truncate text-[11px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: BadgeTone;
  to?: string;
}) {
  const border =
    tone === "bad"
      ? "border-l-red-500"
      : tone === "warn"
        ? "border-l-amber-500"
        : tone === "good"
          ? "border-l-emerald-500"
          : "border-l-brand";
  const body = (
    <div
      className={cn(
        "h-full rounded-md border border-l-4 border-border bg-card px-3 py-3 shadow-xs transition-colors",
        border,
        to && "hover:bg-muted/60",
      )}
    >
      <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-bold leading-tight tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

const toneMap: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  good: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  bad: "bg-red-50 text-red-800 border-red-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
};

export type BadgeTone = keyof typeof toneMap;

/**
 * BORVAT MANAGER VISUAL BASELINE V1 — single English label vocabulary.
 * Internal snake_case values stay as-is in data and code; only the rendered
 * label is humanised so no screen mixes raw keys with prose.
 */
const STATUS_LABELS: Record<string, string> = {
  new: "New",
  open: "Open",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return: "Return",
  resolved: "Resolved",
  waiting_customer: "Waiting on customer",
  waiting_merchant: "Waiting on seller",
  waiting_borvat: "Waiting on Borvat",
  not_created: "Not created",
  created: "Created",
  handed_over: "Handed over",
  published: "Published",
  active: "Active",
  paused: "Paused",
  draft: "Draft",
  review: "In review",
  under_review: "Under review",
  pending: "Pending",
  submitted: "Submitted",
  offered: "Offered",
  awaiting_offer: "Awaiting offer",
  accepted: "Accepted",
  expired: "Expired",
  superseded: "Superseded",
  verified: "Verified",
  connected: "Connected",
  sandbox: "Sandbox",
  blocked: "Blocked",
  breached: "Breached",
  at_risk: "At risk",
  ok: "On target",
  low: "Low",
  normal: "Normal",
  high: "High",
  good_standing: "Good standing",
  winning: "Winning",
  paid: "Paid",
  unpaid: "Unpaid",
  shipping_issue: "Shipping issue",
  product_question: "Product question",
  quote_followup: "Quote follow-up",
  dispute: "Dispute",
  out_of_stock: "Out of stock",
  in_stock: "In stock",
  low_stock: "Low stock",
};

export function statusLabel(value: string): string {
  return (
    STATUS_LABELS[value] ??
    value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
        toneMap[tone],
      )}
    >
      {typeof children === "string" ? statusLabel(children) : children}
    </span>
  );
}

export function toneForStatus(status: string): BadgeTone {
  if (
    [
      "published",
      "active",
      "verified",
      "accepted",
      "connected",
      "good_standing",
      "resolved",
      "winning",
      "delivered",
      "paid",
      "ok",
    ].includes(status)
  )
    return "good";
  if (
    [
      "review",
      "pending",
      "offered",
      "awaiting_offer",
      "submitted",
      "waiting_merchant",
      "waiting_customer",
      "sandbox",
      "paused",
      "under_review",
      "losing",
      "processing",
      "shipped",
      "at_risk",
    ].includes(status)
  )
    return "warn";
  if (
    ["expired", "action_required", "unpublished", "not_connected", "superseded", "cancelled", "breached", "failed"].includes(
      status,
    )
  )
    return "bad";
  if (["open", "draft", "new", "requested"].includes(status)) return "info";
  return "neutral";
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 shadow-xs">
      {children}
    </div>
  );
}

export function DataTable({
  columns,
  children,
  minWidth = 900,
}: {
  columns: (string | ReactNode)[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card shadow-xs">
      <table className="w-full text-[13px] [&_tbody_tr]:border-b [&_tbody_tr]:border-border [&_tbody_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-muted/40" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-border bg-muted/70 text-left">
            {columns.map((c, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({
  children,
  onClick,
  selected,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border last:border-0 hover:bg-muted/50",
        onClick && "cursor-pointer",
        selected && "bg-sky-50/70",
      )}
    >
      {children}
    </tr>
  );
}

export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-middle", className)}>{children}</td>;
}

export function Pagination({ total, page = 1, pageSize = 25 }: { total: number; page?: number; pageSize?: number }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <DemoAction label="Previous" size="sm" />
        <span className="rounded-sm border border-border bg-card px-2 py-1 text-foreground">{page}</span>
        <DemoAction label="Next" size="sm" />
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card px-4 py-14 text-center">
      <Info className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      {hint ? <div className="mt-1 text-[12px] text-muted-foreground">{hint}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function LoadingRows({ rows = 3, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border last:border-0">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-2 py-2">
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

/* Unified action hierarchy used across every manager surface. */
export type ActionVariant = "primary" | "secondary" | "ghost" | "destructive" | "icon";
export type ActionSize = "sm" | "md" | "lg";

const actionSize: Record<ActionSize, string> = {
  sm: "h-7 px-2 text-[12px]",
  md: "h-8 px-3 text-[13px]",
  lg: "h-9 px-4 text-[13px]",
};

const actionVariant: Record<ActionVariant, string> = {
  primary:
    "bg-ink text-ink-foreground shadow-sm hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-accent",
  secondary:
    "border border-border bg-card text-foreground shadow-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90",
  icon: "h-8 w-8 justify-center border border-border bg-card p-0 text-muted-foreground hover:bg-muted hover:text-foreground",
};

/** Any control that is intentionally not wired to the backend. */
export function DemoAction({
  label,
  variant = "secondary",
  size = "md",
  className,
  icon,
  disabled,
  title,
}: {
  label: string;
  variant?: ActionVariant;
  size?: ActionSize;
  className?: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={variant === "icon" ? label : undefined}
      title={title ?? (disabled ? "Unavailable in this demo" : "Demo action — not persisted")}
      onClick={(e) => {
        e.stopPropagation();
        toast.info("Demo action — not persisted", { description: label });
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium leading-none transition-colors outline-none disabled:pointer-events-none disabled:opacity-45",
        variant === "icon" ? actionVariant.icon : cn(actionSize[size], actionVariant[variant]),
        className,
      )}
    >
      {icon}
      {variant === "icon" ? null : label}
    </button>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-[200px] flex-1", className)}>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-[13px] outline-none focus:ring-2 focus:ring-ring/40"
      />
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-ring/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px flex items-center gap-1 whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[13px]",
            active === t.id
              ? "border-brand font-semibold text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {typeof t.count === "number" ? (
            <span className="rounded-sm bg-muted px-1 text-[11px] tabular-nums">{t.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {subtitle ? (
              <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border px-1.5 py-1 text-[12px] hover:bg-muted"
          >
            Close
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap gap-1.5 border-t border-border bg-muted/40 px-3 py-2">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Reporting chart: y-axis ticks, gridlines, optional comparison series,
 * legend, hover tooltip, range selector and an export action.
 */
export function BarChart({
  data,
  format,
  seriesLabel = "This period",
  compareLabel = "Previous period",
  ranges = ["7d", "30d", "12m"],
  onRangeChange,
  height = 200,
}: {
  data: { label: string; value: number; compare?: number }[];
  format?: (v: number) => string;
  seriesLabel?: string;
  compareLabel?: string;
  ranges?: string[];
  onRangeChange?: (range: string) => void;
  height?: number;
}) {
  const fmt = format ?? ((v: number) => String(v));
  const [range, setRange] = useState(ranges[1] ?? ranges[0]);
  const [hover, setHover] = useState<number | null>(null);
  const hasCompare = data.some((d) => typeof d.compare === "number");
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.compare ?? 0)));
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const total = data.reduce((s, d) => s + d.value, 0);
  const compareTotal = data.reduce((s, d) => s + (d.compare ?? 0), 0);
  const delta = compareTotal ? ((total - compareTotal) / compareTotal) * 100 : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-ink" />
            {seriesLabel}
          </span>
          {hasCompare ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-muted-foreground/35" />
              {compareLabel}
            </span>
          ) : null}
          {delta !== null ? (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
              )}
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-md border border-border">
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(r);
                  onRangeChange?.(r);
                }}
                className={cn(
                  "px-2 py-1 text-[12px] transition-colors",
                  range === r
                    ? "bg-ink text-ink-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <DemoAction label="Export CSV" size="sm" />
        </div>
      </div>

      <div className="flex gap-2">
        <div
          className="flex w-14 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-muted-foreground"
          style={{ height }}
        >
          {ticks.map((t) => (
            <span key={t}>{fmt(Math.round(max * t))}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0 flex flex-col justify-between" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="border-t border-dashed border-border/70" />
            ))}
          </div>
          <div className="relative flex items-end gap-1.5" style={{ height }}>
            {data.map((d, i) => (
              <div
                key={d.label}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className="group relative flex h-full flex-1 items-end justify-center gap-0.5"
              >
                {hasCompare ? (
                  <div
                    className="w-1/3 rounded-t-[3px] bg-muted-foreground/25"
                    style={{ height: `${Math.max(2, ((d.compare ?? 0) / max) * 100)}%` }}
                  />
                ) : null}
                <div
                  className={cn(
                    "rounded-t-[3px] bg-ink transition-colors",
                    hasCompare ? "w-1/3" : "w-2/3",
                    hover === i && "bg-accent",
                  )}
                  style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
                />
                {hover === i ? (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-40 -translate-x-1/2 rounded-md border border-border bg-popover p-2 text-left text-[11px] shadow-lg">
                    <div className="mb-1 font-semibold">{d.label}</div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{seriesLabel}</span>
                      <span className="font-semibold tabular-nums">{fmt(d.value)}</span>
                    </div>
                    {typeof d.compare === "number" ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{compareLabel}</span>
                        <span className="tabular-nums">{fmt(d.compare)}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 border-t border-border pt-1">
            {data.map((d) => (
              <span
                key={d.label}
                className="flex-1 truncate text-center text-[10px] text-muted-foreground"
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Three-column operational inbox layout: list · thread · context. */
export function InboxLayout({
  list,
  thread,
  context,
}: {
  list: ReactNode;
  thread: ReactNode;
  context: ReactNode;
}) {
  return (
    <div className="grid min-h-[560px] grid-cols-1 gap-2 lg:h-[calc(100vh-250px)] lg:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
        {list}
      </aside>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
        {thread}
      </section>
      <aside className="flex min-h-0 flex-col overflow-y-auto rounded-md border border-border bg-card">
        {context}
      </aside>
    </div>
  );
}

export function useLocalToggle(initial = false) {
  return useState(initial);
}

/* ------------------------------------------------------------------ */
/* Navigation definitions                                              */
/* ------------------------------------------------------------------ */

export const SELLER_NAV: NavItem[] = [
  { to: "/seller/manager", label: "Dashboard" },
  {
    to: "/seller/catalog",
    label: "Products",
    children: [
      { to: "/seller/catalog", label: "My products" },
      { to: "/seller/products", label: "Live catalog (real data)" },
      { to: "/seller/inventory", label: "Inventory" },
    ],
  },
  {
    to: "/seller/order-desk",
    label: "Orders",
    children: [
      { to: "/seller/order-desk", label: "Order desk" },
      { to: "/seller/orders", label: "Live orders (real data)" },
      { to: "/seller/quotes", label: "Manual quotes" },
    ],
  },
  {
    to: "/seller/questions",
    label: "Customers",
    children: [
      { to: "/seller/questions", label: "Customer questions" },
      { to: "/seller/messages", label: "Messages with Borvat" },
      { to: "/seller/reviews", label: "Reviews" },
    ],
  },
  {
    to: "/seller/shipping",
    label: "Operations",
    children: [
      { to: "/seller/shipping", label: "Shipping & delivery" },
      { to: "/seller/inventory", label: "Inventory" },
      { to: "/seller/performance", label: "Service standards" },
    ],
  },
  {
    to: "/seller/promotions",
    label: "Growth",
    children: [
      { to: "/seller/promotions", label: "Promotions" },
      { to: "/seller/advertising", label: "Advertising" },
      { to: "/seller/suggestions", label: "Suggestions" },
    ],
  },
  { to: "/seller/finances", label: "Finance" },
  {
    to: "/seller/analysis",
    label: "Analytics",
    children: [
      { to: "/seller/analysis", label: "Sales analysis" },
      { to: "/seller/performance", label: "Performance" },
    ],
  },
  {
    to: "/seller/settings",
    label: "Settings",
    children: [
      { to: "/seller/onboarding", label: "Onboarding & verification" },
      { to: "/seller/settings", label: "Shop settings" },
      { to: "/seller/store", label: "Store profile" },
      { to: "/seller/stores", label: "All shops" },
    ],
  },
];

export const ADMIN_NAV: NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard" },
  {
    to: "/admin/companies",
    label: "Merchants",
    children: [
      { to: "/admin/companies", label: "Companies" },
      { to: "/admin/stores", label: "Stores" },
      { to: "/admin/seller-applications", label: "Seller applications" },
      { to: "/admin/users", label: "Users" },
    ],
  },
  {
    to: "/admin/products",
    label: "Catalog",
    children: [
      { to: "/admin/products", label: "Listings" },
      { to: "/admin/listings", label: "Draft listings" },
    ],
  },
  { to: "/admin/orders", label: "Orders" },
  { to: "/admin/shipping", label: "Shipping" },
  { to: "/admin/quotes", label: "Manual quotes" },
  { to: "/admin/support", label: "Support" },
  { to: "/admin/security", label: "Security" },
  { to: "/admin/channels", label: "Integrations" },
  { to: "/admin/audit", label: "Audit" },
  { to: "/admin/health", label: "Platform health" },
];

export const SUPPORT_NAV: NavItem[] = [
  { to: "/support/queue", label: "Case queue" },
  { to: "/support/inbox/customers", label: "Customer inbox" },
  { to: "/support/inbox/merchants", label: "Merchant inbox" },
  { to: "/support/cases/case_1001", label: "Case workspace" },
];
