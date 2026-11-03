import { useShopText, useShopMoney } from "./i18n";
import { Minus, Plus, Star, Truck, Store, ImageOff, FlaskConical, Heart } from "lucide-react";
import { formatEur } from "../../../lib/format";
import { orderTotals, type ShippingMethodId } from "../../../lib/commercial/shop-pricing";
import { LocalLink } from "./shop-context";
import { demoMedia } from "./demo-media";

export type CardProduct = {
  id: string;
  title: string;
  category: string;
  priceCents: number;
  fromCents: number;
  available: number;
  rating: number | null;
  reviewCount: number | null;
  seller: string | null;
  offerCount: number;
  delivery: string;
  href: string;
};

/** Product image plate. Licensed demo photography where the fixture has it, an
 *  honest empty plate where it does not. */
export function ProductMedia({
  seed,
  title,
  size = "md",
  priority,
}: {
  seed: string;
  title: string;
  size?: "sm" | "md" | "lg";
  priority?: boolean;
}) {
  const photo = demoMedia(seed);
  const box =
    size === "sm" ? "aspect-square" : size === "md" ? "aspect-square" : "aspect-[4/5] max-h-[560px]";
  return (
    <figure className={`relative ${box} w-full overflow-hidden rounded border border-border bg-white`}>
      {photo ? (
        <img
          src={photo}
          alt={title}
          loading={priority ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-contain p-3"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-muted text-muted-foreground">
          <ImageOff className={size === "sm" ? "h-4 w-4" : "h-7 w-7"} />
          <span className="text-[11px]">Geen productfoto</span>
        </div>
      )}
    </figure>
  );
}

export function Rating({ rating, count }: { rating: number | null; count: number | null }) {
  if (rating == null) return null;
  return (
    <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
      <Star aria-hidden className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="brv-num font-semibold text-foreground">{rating.toFixed(1)}</span>
      <span className="brv-num">({count ?? 0})</span>
    </p>
  );
}

/** Dense marketplace card: fixed rows so prices, delivery and seller line up
 *  across a whole row regardless of title length. */
export function ProductCard({ p }: { p: CardProduct }) {
  const formatEur = useShopMoney();
  const hasDeal = p.priceCents < p.fromCents;
  const pct = hasDeal && p.fromCents > 0 ? Math.round((1 - p.priceCents / p.fromCents) * 100) : 0;
  return (
    <article className="brv-card" data-testid="discovery-product">
      <LocalLink href={p.href} className="plate">
        {demoMedia(p.id) ? (
          <img src={demoMedia(p.id) as string} alt={p.title} loading="lazy" />
        ) : (
          <span className="text-[11px] text-muted-foreground">Geen productfoto</span>
        )}
        {pct > 0 && <span className="deal">-{pct}%</span>}
        <span className="fav" aria-hidden>
          <Heart className="h-3.5 w-3.5" />
        </span>
      </LocalLink>
      <div className="body">
        <LocalLink href={p.href} className="brv-title-link">
          {p.title}
        </LocalLink>
        <Rating rating={p.rating} count={p.reviewCount} />
        <p className="brv-offers">
          {p.offerCount} {p.offerCount === 1 ? "aanbieder" : "aanbieders"}
        </p>
        <div className="mt-auto pt-1">
          <p className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="brv-price text-[16px]">{formatEur(p.priceCents)}</span>
            {hasDeal && <span className="brv-strike">{formatEur(p.fromCents)}</span>}
          </p>
          <p className="brv-delivery">
            <Truck aria-hidden className="h-3.5 w-3.5" />
            {p.delivery}
          </p>
          <p className="brv-seller">
            Verkocht door <b>{p.seller ?? "BORVAT"}</b>
          </p>
        </div>
      </div>
    </article>
  );
}


export function DeliveryLine({ available, compact }: { available: number; compact?: boolean }) {
  const nl = useShopText();
  if (available < 1)
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-destructive">
        <Truck aria-hidden className="h-3.5 w-3.5" /> {nl.outOfStock}
      </p>
    );
  return (
    <p className="brv-delivery">
      <Truck aria-hidden className="h-3.5 w-3.5" />
      <span>{compact ? nl.deliveryShort : nl.deliveryLong}</span>
    </p>
  );
}

export function AvailabilityBadge({ available, testId }: { available: number; testId?: string }) {
  const nl = useShopText();
  const [label, tone] =
    available < 1
      ? [nl.outOfStock, "text-destructive"]
      : available <= 3
        ? [nl.lowStock(available), "text-amber-700"]
        : [nl.inStockLabel, "text-success"];
  return (
    <p data-testid={testId} className={`text-[13px] font-semibold ${tone}`}>
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
  const nl = useShopText();
  const btn =
    "flex h-11 w-10 items-center justify-center border border-border bg-white hover:border-ink disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center" role="group" aria-label={label}>
      <button
        type="button"
        className={`${btn} rounded-l`}
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
        className="brv-num h-11 w-12 border-y border-border bg-white text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        className={`${btn} rounded-r`}
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
  const nl = useShopText();
  return (
    <div
      role="note"
      data-testid={testId}
      className="flex gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950"
    >
      <FlaskConical aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
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
  const nl = useShopText();
  const formatEur = useShopMoney();
  const t = orderTotals(lines, method);
  return (
    <dl className="brv-num space-y-2 text-[13px]">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{nl.subtotal}</dt>
        <dd data-testid={`${prefix}-subtotal`}>{formatEur(t.subtotalCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">
          {nl.shipping} ({method === "express" ? nl.express : nl.standard})
        </dt>
        <dd data-testid={`${prefix}-shipping`} className={t.shippingCents === 0 ? "text-success" : ""}>
          {t.shippingCents === 0 ? nl.free : formatEur(t.shippingCents)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-border pt-2.5 text-[16px] font-bold">
        <dt>{nl.total}</dt>
        <dd data-testid={`${prefix}-total`}>{formatEur(t.totalCents)}</dd>
      </div>
      <div className="flex justify-between text-[11.5px] text-muted-foreground">
        <dt>{nl.vatIncluded}</dt>
        <dd>{formatEur(t.vatIncludedCents)}</dd>
      </div>
    </dl>
  );
}

export const primaryButton = "brv-cta w-full";
export const secondaryButton = "brv-cta-quiet";

export { Store };
