import { useShopMoney, useShopText } from "./i18n";
import { Minus, Plus, Star, Truck, Store, ImageOff, FlaskConical, Heart } from "lucide-react";
import { formatEur, productImage } from "../../../lib/format";
import { orderTotals, type ShippingMethodId } from "../../../lib/commercial/shop-pricing";
import { LocalLink } from "./shop-context";
import { nl } from "./nl";

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
  variantLabel: string | null;
  href: string;
};

/** Product image slot. Real photography is not available in this catalogue, so the
 *  slot states that plainly instead of dressing a placeholder up as a product. */
export function ProductMedia({
  seed,
  title,
  size = "md",
}: {
  seed: string;
  title: string;
  size?: "sm" | "md" | "lg";
}) {
  const nl = useShopText();
  const box =
    size === "sm" ? "aspect-square" : size === "md" ? "aspect-square" : "aspect-[4/5] max-h-[560px]";
  return (
    <figure className={`brv-card-media relative ${box} w-full`}>
      <img
        src={productImage(null, seed)}
        alt=""
        aria-hidden
        className="h-full w-full object-cover opacity-90"
        loading="lazy"
      />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-white/85 px-2 py-1 text-[10px] leading-tight text-muted-foreground backdrop-blur-sm">
        <ImageOff aria-hidden className="h-3 w-3 shrink-0" />
        <span className="truncate">{nl.mediaMissing}</span>
      </figcaption>
      <span className="sr-only">{`${title} — ${nl.mediaMissing}`}</span>
    </figure>
  );
}

export function VendorLine({ seller }: { seller: string | null }) {
  const nl = useShopText();
  if (!seller) return null;
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <Store aria-hidden className="h-3.5 w-3.5" />
      <span className="truncate">
        {nl.soldBy} <span className="font-medium text-foreground">{seller}</span>
      </span>
    </p>
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

export function Rating({ rating, count }: { rating: number | null; count: number | null }) {
  const nl = useShopText();
  if (rating == null) return <p className="text-[12px] text-muted-foreground">{nl.noReviews}</p>;
  return (
    <p className="brv-stars">
      <Star aria-hidden className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="brv-num font-medium text-foreground">{rating.toFixed(1)}</span>
      <span className="brv-num">({count ?? 0})</span>
    </p>
  );
}

/** Dense marketplace card: fixed rows so prices and delivery lines align across
 *  the grid regardless of title length. */
export function ProductCard({ p }: { p: CardProduct }) {
  const nl = useShopText();
  const formatEur = useShopMoney();
  const hasDeal = p.priceCents < p.fromCents;
  const dealPct = hasDeal && p.fromCents > 0 ? Math.round((1 - p.priceCents / p.fromCents) * 100) : 0;
  return (
    <article className="brv-card group flex h-full flex-col overflow-hidden" data-testid="discovery-product">
      <LocalLink href={p.href} className="relative block">
        <ProductMedia seed={p.id} title={p.title} />
        {dealPct > 0 && (
          <span className="brv-deal absolute left-2 top-2">-{dealPct}%</span>
        )}
        <span
          aria-hidden
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-muted-foreground shadow-sm"
        >
          <Heart className="h-4 w-4" />
        </span>
      </LocalLink>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <LocalLink href={p.href} className="brv-title-link min-h-[38px]">
          {p.title}
        </LocalLink>
        <Rating rating={p.rating} count={p.reviewCount} />
        <div className="mt-auto space-y-1 pt-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="brv-price text-[17px]">{formatEur(p.priceCents)}</span>
            {hasDeal && <span className="brv-strike">{formatEur(p.fromCents)}</span>}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {p.variantLabel ? `${p.variantLabel} · ` : ""}
            {nl.perPack(1)}
          </p>
          <DeliveryLine available={p.available} compact />
          <VendorLine seller={p.seller} />
        </div>
      </div>
    </article>
  );
}

export function AvailabilityBadge({ available, testId }: { available: number; testId?: string }) {
  const nl = useShopText();
  const [label, tone] =
    available < 1
      ? [nl.outOfStock, "text-destructive"]
      : available <= 3
        ? [nl.lowStock(available), "text-amber-600"]
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
    "flex h-11 w-10 items-center justify-center border border-border bg-white transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center" role="group" aria-label={label}>
      <button
        type="button"
        className={`${btn} rounded-l-md`}
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
        className={`${btn} rounded-r-md`}
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
      className="flex gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-950"
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
    <dl className="brv-num space-y-2 text-[13.5px]">
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
