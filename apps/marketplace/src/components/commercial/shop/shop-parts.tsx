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
  const box =
    size === "sm"
      ? "h-20 w-20"
      : size === "lg"
        ? "aspect-[4/3] max-h-[30rem] w-full"
        : "aspect-[4/3] w-full";
  return (
    <figure className={`relative overflow-hidden rounded-lg bg-muted ${box}`}>
      <img src={productImage(null, seed)} alt="" className="h-full w-full object-cover" />
      {size !== "sm" && (
        <figcaption className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-md bg-background/85 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
          <ImageOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span>{nl.mediaMissing}</span>
        </figcaption>
      )}
      <span className="sr-only">{`${title} — ${nl.mediaMissing}`}</span>
    </figure>
  );
}

export function AvailabilityBadge({ available, testId }: { available: number; testId?: string }) {
  const [label, tone] =
    available < 1
      ? [nl.outOfStock, "text-destructive"]
      : available <= 3
        ? [nl.lowStock(available), "text-amber-700 dark:text-amber-400"]
        : [nl.inStockLabel, "text-emerald-700 dark:text-emerald-400"];
  return (
    <p data-testid={testId} className={`text-sm font-semibold ${tone}`}>
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
  const btn =
    "flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
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
        className="h-10 w-14 rounded-md border border-border bg-background text-center font-semibold [appearance:textfield] focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-inner-spin-button]:appearance-none"
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
  return (
    <div
      role="note"
      data-testid={testId}
      className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <FlaskConical aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
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
  const t = orderTotals(lines, method);
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt>{nl.subtotal}</dt>
        <dd data-testid={`${prefix}-subtotal`}>{formatEur(t.subtotalCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>
          {nl.shipping} ({method === "express" ? nl.express : nl.standard})
        </dt>
        <dd data-testid={`${prefix}-shipping`}>
          {t.shippingCents === 0 ? nl.free : formatEur(t.shippingCents)}
        </dd>
      </div>
      <div className="flex justify-between border-t border-border pt-3 text-base font-bold">
        <dt>{nl.total}</dt>
        <dd data-testid={`${prefix}-total`}>{formatEur(t.totalCents)}</dd>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <dt>{nl.vatIncluded}</dt>
        <dd>{formatEur(t.vatIncludedCents)}</dd>
      </div>
    </dl>
  );
}

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 font-bold text-accent-foreground transition-[background-color,transform] hover:bg-accent/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
