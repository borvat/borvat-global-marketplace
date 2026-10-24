import {
  PAYMENT_METHODS,
  isShippingMethod,
  type ShippingMethodId,
  type TestPaymentMethod,
} from "./shop-pricing";

export type CheckoutInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  addition: string;
  postalCode: string;
  city: string;
  country: "NL" | "BE";
  shippingMethod: ShippingMethodId;
  paymentMethod: TestPaymentMethod;
  acceptTest: boolean;
};
export type CheckoutField = keyof CheckoutInput;
export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

const name = /^[\p{L}][\p{L}\s'.-]{0,59}$/u;
export function validateCheckout(input: CheckoutInput): CheckoutErrors {
  const e: CheckoutErrors = {};
  const v = (s: string) => s.trim();
  if (!v(input.firstName)) e.firstName = "Vul je voornaam in.";
  else if (!name.test(v(input.firstName))) e.firstName = "Gebruik alleen letters (max. 60 tekens).";
  if (!v(input.lastName)) e.lastName = "Vul je achternaam in.";
  else if (!name.test(v(input.lastName))) e.lastName = "Gebruik alleen letters (max. 60 tekens).";
  if (!v(input.email)) e.email = "Vul je e-mailadres in.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v(input.email)) || v(input.email).length > 120)
    e.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@voorbeeld.nl.";
  const digits = input.phone.replace(/[\s()-]/g, "");
  if (!digits) e.phone = "Vul je telefoonnummer in.";
  else if (v(input.phone).length > 30 || !/^(\+31|\+32|0031|0032|0)[1-9]\d{7,9}$/.test(digits))
    e.phone = "Vul een geldig Nederlands of Belgisch telefoonnummer in.";
  if (!v(input.street)) e.street = "Vul je straatnaam in.";
  else if (v(input.street).length > 200)
    e.street = "Gebruik maximaal 200 tekens voor de straatnaam.";
  if (!v(input.houseNumber)) e.houseNumber = "Vul je huisnummer in.";
  else if (!/^\d{1,5}$/.test(v(input.houseNumber))) e.houseNumber = "Gebruik alleen cijfers.";
  if (input.addition && !/^[\p{L}\d-]{1,6}$/u.test(v(input.addition)))
    e.addition = "Maximaal 6 letters of cijfers.";
  const pc = v(input.postalCode).toUpperCase();
  if (!pc) e.postalCode = "Vul je postcode in.";
  else if (input.country === "NL" ? !/^[1-9]\d{3}\s?[A-Z]{2}$/.test(pc) : !/^[1-9]\d{3}$/.test(pc))
    e.postalCode =
      input.country === "NL"
        ? "Gebruik het formaat 1234 AB."
        : "Gebruik een Belgische postcode van 4 cijfers.";
  if (!v(input.city)) e.city = "Vul je woonplaats in.";
  else if (v(input.city).length > 200) e.city = "Gebruik maximaal 200 tekens voor de woonplaats.";
  if (input.country !== "NL" && input.country !== "BE") e.country = "Kies Nederland of België.";
  if (!isShippingMethod(input.shippingMethod)) e.shippingMethod = "Kies een verzendmethode.";
  if (!PAYMENT_METHODS.includes(input.paymentMethod))
    e.paymentMethod = "Kies een testbetaalmethode.";
  if (!input.acceptTest) e.acceptTest = "Bevestig dat je begrijpt dat dit een testbestelling is.";
  return e;
}

export function normalizeCheckout(input: CheckoutInput): CheckoutInput {
  const pc = input.postalCode.trim().toUpperCase().replace(/\s+/g, "");
  return {
    ...input,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    street: input.street.trim(),
    houseNumber: input.houseNumber.trim(),
    addition: input.addition.trim(),
    postalCode: input.country === "NL" ? `${pc.slice(0, 4)} ${pc.slice(4)}` : pc,
    city: input.city.trim(),
  };
}
