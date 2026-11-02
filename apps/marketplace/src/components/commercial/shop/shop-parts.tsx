import { useShopCopy, useShopMoney } from "./i18n";
import { useShopText } from "./i18n";
import { Minus, Plus, ImageOff, FlaskConical } from "lucide-react";
import { formatEur, productImage } from "../../../lib/format";
import { orderTotals, type ShippingMethodId } from "../../../lib/commercial/shop-pricing";
import { nl } from "./nl";

export function ProductMedia({
  seed,
  title,
  size = "md",
}: {
  seed: string;
  title: string;
  size?: "sm" | "md" | "lg";
}) {
  const copy = useShopCopy();
  const nl = useShopText();
  const box =
    size === "sm"
      ? "h-20 w-20"
      : size === "lg"
        ? "aspect-[4/5] max-h-[36rem] w-full"
        : "aspect-[4/5] w-full";
  return (
    <figure className={`brv-media relative overflow-hidden bg-surface ${box}`}>
      <img src={productImage(null, seed)} alt="" className="h-full w-full object-cover" />
      {size !== "sm" && (
        <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <ImageOff aria-hidden className="h-3 w-3 shrink-0" />
          <span>{nl.mediaMissing}</span>
        </figcaption>
      )}
      <span className="sr-only">{`${title} — ${nl.mediaMissing}`}</span>
    </figure>
  );
}

export function AvailabilityBadge({ available, testId }: { available: number; testId?: string }) {
  const copy = useShopCopy();
  const nl = useShopText();
  const [label, tone] =
    available < 1
      ? [nl.outOfStock, "text-destructive"]
      : available <= 3
        ? [nl.lowStock(available), "text-accent"]
        : [nl.inStockLabel, "text-emerald-700 dark:text-emerald-400"];
  return (
    <p
      data-testid={testId}
      className={`text-[11px] font-medium uppercase tracking-[0.12em] ${tone}`}
    >
      {label}
    </p>
  );
}

export function QuantityStepper({
  id,
  value,
  max,
  onChange,
  label,
  disabled,
}: {
  id: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const copy = useShopCopy();
  const nl = useShopText();
  const btn =
    "flex h-11 w-11 items-center justify-center border border-border bg-transparent transition-colors hover:border-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <div className="flex items-center" role="group" aria-label={label}>
      <button
        type="button"
        className={btn}
        aria-label={`${nl.decrease} · ${label}`}
        data-testid={`${id}-decrease`}
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus aria-hidden className="h-4 w-4" />
      </button>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        data-testid={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={Math.max(1, max)}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(next)) onChange(next);
        }}
        className="brv-price h-11 w-14 border-y border-border bg-transparent text-center text-sm focus-visible:outline-2 focus-visible:outline-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        className={btn}
        aria-label={`${nl.increase} · ${label}`}
        data-testid={`${id}-increase`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

export function TestNotice({ testId = "test-notice" }: { testId?: string }) {
  const copy = useShopCopy();
  const nl = useShopText();
  return (
    <div
      role="note"
      data-testid={testId}
      className="flex gap-3 border-l-2 border-accent bg-accent-soft/60 px-4 py-3 text-[12px] leading-relaxed text-foreground"
    >
      <FlaskConical aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <p>{nl.testNotice}</p>
    </div>
  );
}

export function TotalsBlock({
  lines,
  method,
  prefix,
}: {
  lines: { unitPriceCents: number; quantity: number }[];
  method: ShippingMethodId;
  prefix: string;
}) {
  const copy = useShopCopy();
  const formatEur = useShopMoney();
  const nl = useShopText();
  const t = orderTotals(lines, method);
  return (
    <dl className="brv-price space-y-2.5 text-[13px]">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{nl.subtotal}</dt>
        <dd data-testid={`${prefix}-subtotal`}>{formatEur(t.subtotalCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">
          {nl.shipping} ({method === "express" ? nl.express : nl.standard})
        </dt>
        <dd data-testid={`${prefix}-shipping`}>
          {t.shippingCents === 0 ? nl.free : formatEur(t.shippingCents)}
        </dd>
      </div>
      <div className="flex justify-between border-t border-border pt-3 text-[15px] font-medium">
        <dt>{nl.total}</dt>
        <dd data-testid={`${prefix}-total`}>{formatEur(t.totalCents)}</dd>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <dt>{nl.vatIncluded}</dt>
        <dd>{formatEur(t.vatIncludedCents)}</dd>
      </div>
    </dl>
  );
}

export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-primary bg-primary px-6 py-3 text-[12px] font-medium uppercase tracking-[0.08em] text-primary-foreground transition-colors hover:bg-ink-soft hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-border bg-transparent px-5 py-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-foreground transition-colors hover:border-foreground disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
