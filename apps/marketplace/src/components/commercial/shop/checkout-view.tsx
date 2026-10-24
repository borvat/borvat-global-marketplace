import { useShopCopy, useShopMoney } from "./i18n";
import { useShopText } from "./i18n";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Lock } from "lucide-react";
import { formatEur } from "../../../lib/format";
import {
  validateCheckout,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutInput,
} from "../../../lib/commercial/checkout-validation";
import {
  SHIPPING_METHODS,
  shippingCents,
  orderTotals,
  type ShippingMethodId,
  type TestPaymentMethod,
} from "../../../lib/commercial/shop-pricing";
import { LocalLink, useShop } from "./shop-context";
import { cartLines, RestoringState } from "./cart-view";
import { TestNotice, TotalsBlock, primaryButton } from "./shop-parts";
import { nl } from "./nl";

const SUBMIT_DELAY_MS = 600;
const FIELD_ORDER: CheckoutField[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "street",
  "houseNumber",
  "addition",
  "postalCode",
  "city",
  "country",
  "shippingMethod",
  "paymentMethod",
  "acceptTest",
];

function Field({
  id,
  label,
  error,
  children,
  optional,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  optional?: boolean;
}) {
  const copy = useShopCopy();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}{" "}
        {optional && (
          <span className="font-normal text-muted-foreground">{copy("(optioneel)")}</span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} data-testid={`${id}-error`} className="mt-1 text-sm text-destructive">
          {copy(error)}
        </p>
      )}
    </div>
  );
}
const inputClass = (error?: string) =>
  `h-11 w-full rounded-md border bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring ${error ? "border-destructive" : "border-border"}`;

export function CheckoutView() {
  const copy = useShopCopy();
  const formatEur = useShopMoney();
  const nl = useShopText();
  const { adapter, snapshot, route, link, navigate } = useShop();
  const [form, setForm] = useState<CheckoutInput>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    street: "",
    houseNumber: "",
    addition: "",
    postalCode: "",
    city: "",
    country: route.country,
    shippingMethod: "standaard",
    paymentMethod: "test-ideal",
    acceptTest: false,
  });
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placedId, setPlacedId] = useState("");
  const busy = useRef(false);
  const key = useRef<string | null>(null);
  if (!snapshot.restored) return <RestoringState />;
  if (placedId)
    return (
      <p role="status" className="py-10 text-center">
        {nl.placing}
      </p>
    );
  const lines = cartLines(snapshot);
  if (!lines.length)
    return (
      <div data-testid="checkout-empty" className="space-y-3 py-10 text-center">
        <h1 tabIndex={-1} className="text-2xl font-bold">
          {nl.emptyCart}
        </h1>
        <LocalLink href={link("/discover")}>{nl.backToShop}</LocalLink>
      </div>
    );
  const blocked = lines.some((l) => l.issue);
  const set = <K extends CheckoutField>(field: K, value: CheckoutInput[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };
  const blur = (field: CheckoutField) => {
    const message = validateCheckout(form)[field];
    setErrors((e) => ({ ...e, [field]: message }));
  };
  const text = (
    field: CheckoutField,
    label: string,
    extra: Record<string, string> = {},
    optional = false,
  ) => (
    <Field id={`checkout-${field}`} label={label} error={errors[field]} optional={optional}>
      <input
        id={`checkout-${field}`}
        data-testid={`checkout-${field}`}
        value={form[field] as string}
        aria-invalid={!!errors[field]}
        aria-describedby={errors[field] ? `checkout-${field}-error` : undefined}
        aria-required={!optional}
        onChange={(e) => set(field, e.target.value as never)}
        onBlur={() => blur(field)}
        className={inputClass(errors[field])}
        {...extra}
      />
    </Field>
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    setSubmitError("");
    const found = validateCheckout(form);
    setErrors(found);
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) {
      setSubmitError(nl.fixErrors);
      document.getElementById(`checkout-${first}`)?.focus();
      return;
    }
    busy.current = true;
    key.current ??= globalThis.crypto.randomUUID();
    setSubmitting(true);
    setTimeout(async () => {
      try {
        const id = adapter.placeServerOrder
          ? await adapter.placeServerOrder(form, key.current!)
          : adapter.placeTestOrder(form, key.current!);
        setPlacedId(id);
        navigate(link(`/bestelling/${encodeURIComponent(id)}`));
      } catch (cause) {
        setSubmitError(
          cause instanceof Error ? cause.message : "De testbestelling kon niet worden geplaatst.",
        );
        busy.current = false;
        setSubmitting(false);
      }
    }, SUBMIT_DELAY_MS);
  };
  const subtotal = orderTotals(lines, "standaard").subtotalCents;
  const radio =
    "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 has-[:checked]:border-accent has-[:checked]:ring-1 has-[:checked]:ring-accent";
  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-6"
      data-testid="checkout-form"
      aria-busy={submitting}
    >
      <h1 tabIndex={-1} className="text-2xl font-bold sm:text-3xl">
        {nl.checkoutTitle}
      </h1>
      <TestNotice />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <fieldset className="space-y-4 rounded-xl border border-border bg-card p-5">
            <legend className="px-1 text-lg font-bold">{nl.yourDetails}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("firstName", copy("Voornaam"), { autoComplete: "given-name" })}
              {text("lastName", copy("Achternaam"), { autoComplete: "family-name" })}
              {text("email", copy("E-mailadres"), {
                type: "email",
                autoComplete: "email",
                inputMode: "email",
              })}
              {text("phone", copy("Telefoonnummer"), {
                type: "tel",
                autoComplete: "tel",
                inputMode: "tel",
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {copy(
                "Vul gerust fictieve gegevens in. Er wordt geen e-mail of bericht verstuurd.",
              )}{" "}
            </p>
          </fieldset>
          <fieldset className="space-y-4 rounded-xl border border-border bg-card p-5">
            <legend className="px-1 text-lg font-bold">{nl.address}</legend>
            <Field id="checkout-country" label={copy("Land")} error={errors.country}>
              <select
                id="checkout-country"
                data-testid="checkout-country"
                value={form.country}
                onChange={(e) => set("country", e.target.value as "NL" | "BE")}
                className={inputClass(errors.country)}
              >
                <option value="NL">{nl.nl}</option>
                <option value="BE">{nl.be}</option>
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem_10.5rem]">
              {text("street", copy("Straat"), { autoComplete: "address-line1" })}
              {text("houseNumber", copy("Huisnummer"), { inputMode: "numeric" })}
              {text("addition", copy("Toevoeging"), {}, true)}
            </div>
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              {text("postalCode", copy("Postcode"), {
                autoComplete: "postal-code",
                placeholder: form.country === "NL" ? "1234 AB" : "1000",
              })}
              {text("city", copy("Plaats"), { autoComplete: "address-level2" })}
            </div>
          </fieldset>
          <fieldset
            className="space-y-3 rounded-xl border border-border bg-card p-5"
            aria-describedby={errors.shippingMethod ? "checkout-shippingMethod-error" : undefined}
          >
            <legend className="px-1 text-lg font-bold">{nl.shippingMethod}</legend>
            {(Object.keys(SHIPPING_METHODS) as ShippingMethodId[]).map((m) => {
              const cost = shippingCents(m, subtotal);
              return (
                <label key={m} className={radio}>
                  <input
                    type="radio"
                    name="shipping"
                    data-testid={`shipping-${m}`}
                    checked={form.shippingMethod === m}
                    onChange={() => set("shippingMethod", m)}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="flex-1">
                    <span className="flex justify-between font-semibold">
                      <span>
                        {m === "express" ? nl.express : nl.standard} {copy("(test)")}
                      </span>
                      <span>{cost === 0 ? nl.free : formatEur(cost)}</span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {copy("Levering binnen")} {copy(SHIPPING_METHODS[m].deliveryDays)}
                      {m === "standaard"
                        ? ` · gratis vanaf ${formatEur(SHIPPING_METHODS.standaard.freeFromCents)}`
                        : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <fieldset className="space-y-3 rounded-xl border border-border bg-card p-5">
            <legend className="px-1 text-lg font-bold">{nl.paymentMethod}</legend>
            {(
              [
                ["test-ideal", nl.testIdeal, nl.testIdealHint],
                ["test-card", nl.testCard, nl.testCardHint],
              ] as [TestPaymentMethod, string, string][]
            ).map(([m, label, hint]) => (
              <label key={m} className={radio}>
                <input
                  type="radio"
                  name="payment"
                  data-testid={`payment-${m}`}
                  checked={form.paymentMethod === m}
                  onChange={() => set("paymentMethod", m)}
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <aside
          aria-label={nl.overview}
          className="space-y-4 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24"
        >
          <h2 className="text-lg font-bold">{nl.overview}</h2>
          <ul className="space-y-2 text-sm" data-testid="checkout-lines">
            {lines.map((l) => (
              <li key={l.offerId} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {l.quantity} × {l.product?.title}
                  <span className="block text-xs text-muted-foreground">
                    {l.offer?.variant} · {l.offer?.sellerName}
                  </span>
                </span>
                <span className="shrink-0 font-medium">{formatEur(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-border pt-3">
            <TotalsBlock lines={lines} method={form.shippingMethod} prefix="checkout" />
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              id="checkout-acceptTest"
              data-testid="checkout-acceptTest"
              checked={form.acceptTest}
              aria-invalid={!!errors.acceptTest}
              aria-describedby={errors.acceptTest ? "checkout-acceptTest-error" : undefined}
              onChange={(e) => set("acceptTest", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>{nl.acceptTest}</span>
          </label>
          {errors.acceptTest && (
            <p
              id="checkout-acceptTest-error"
              data-testid="checkout-acceptTest-error"
              className="text-sm text-destructive"
            >
              {copy(errors.acceptTest)}
            </p>
          )}
          {submitError && (
            <p
              role="alert"
              data-testid="checkout-submit-error"
              className="rounded-lg border border-destructive p-3 text-sm text-destructive"
            >
              {copy(submitError)}
            </p>
          )}
          {blocked && (
            <p role="alert" className="text-sm text-destructive">
              {copy("Een artikel in je mandje is niet meer beschikbaar.")}{" "}
              <LocalLink href={link("/cart")}>{copy("Naar mandje")}</LocalLink>
            </p>
          )}
          <button
            type="submit"
            data-testid="place-order-button"
            className={`${primaryButton} w-full`}
            disabled={submitting || blocked}
            aria-disabled={submitting || blocked}
          >
            {submitting ? (
              <>
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> {nl.placing}
              </>
            ) : (
              <>
                <Lock aria-hidden className="h-4 w-4" /> {nl.placeOrder}
              </>
            )}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            {copy("Er wordt niets afgeschreven.")}
          </p>
        </aside>
      </div>
    </form>
  );
}
