/** Isolated test order service. Stock and financial documents are external references only. */
import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { CommandJournal } from "../integration-contracts/command-journal.mjs";

export class CommerceError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}
const fail = (code, status) => {
  throw new CommerceError(code, status);
};
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  fail("INVALID_JSON");
}
const id = (value) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value
    : fail("INVALID_ID");
const integer = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : fail("INVALID_NUMBER");
const secret = () => randomBytes(32).toString("base64url");
const parse = (text) => JSON.parse(text);

export class CommerceStore {
  constructor({ path, now = Date.now, receivers = {} }) {
    // Deliberate local/test deployment opt-in. Refuse an arbitrary existing cloud DB or repository path.
    if (
      !isAbsolute(path) ||
      !existsSync(join(dirname(path), ".borvat-synthetic-only")) ||
      statSync(dirname(path)).mode & 0o077 ||
      realpathSync(dirname(path)) !== dirname(path)
    )
      throw Error(
        "A private, explicitly marked synthetic data directory is required",
      );
    this.now = now;
    this.receivers = receivers;
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sellers(id TEXT PRIMARY KEY,company TEXT UNIQUE NOT NULL,name TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('review','approved','suspended')));
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('seller','admin')),seller TEXT REFERENCES sellers(id),enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,owner TEXT NOT NULL,user TEXT REFERENCES users(id),expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,until_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS offers(id TEXT PRIMARY KEY,product TEXT NOT NULL,sku TEXT NOT NULL,seller TEXT NOT NULL REFERENCES sellers(id),price INTEGER NOT NULL CHECK(price>0),pack INTEGER NOT NULL CHECK(pack>0),version INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('draft','published')),info TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,owner TEXT NOT NULL,body TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,owner TEXT NOT NULL,external_key TEXT NOT NULL,body_hash TEXT NOT NULL,quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),body TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(owner,external_key));
      CREATE TABLE IF NOT EXISTS portions(order_id TEXT NOT NULL REFERENCES orders(id),seller TEXT NOT NULL REFERENCES sellers(id),company TEXT NOT NULL,state TEXT NOT NULL,refs TEXT NOT NULL,PRIMARY KEY(order_id,seller));
      CREATE TABLE IF NOT EXISTS payment_events(event_id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),body_hash TEXT NOT NULL,status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS payments(order_id TEXT PRIMARY KEY REFERENCES orders(id),status TEXT NOT NULL CHECK(status IN ('not_started','pending','failed','cancelled','succeeded','refund_pending','refunded')),reference TEXT);
      CREATE TABLE IF NOT EXISTS order_lifecycle(order_id TEXT PRIMARY KEY REFERENCES orders(id),cancel_requested INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL,reason TEXT);
      INSERT OR IGNORE INTO order_lifecycle(order_id,expires) SELECT id,created+900000 FROM orders;
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,resource TEXT NOT NULL,at INTEGER NOT NULL,change TEXT NOT NULL);
    `);
    this.journal = new CommandJournal({
      path,
      now,
      authorize: (principal, company) =>
        principal === this.worker &&
        this.db
          .prepare("SELECT 1 FROM sellers WHERE company=?")
          .get(company) !== undefined,
    });
    this.worker = Object.freeze({ internalWorker: randomUUID() });
  }
  close() {
    this.journal.close();
    this.db.close();
  }
  tx(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  audit(actor, action, resource, change) {
    this.db
      .prepare(
        "INSERT INTO audit(actor,action,resource,at,change) VALUES (?,?,?,?,?)",
      )
      .run(actor, action, resource, this.now(), canonical(change));
  }
  /** Bootstrap is a local operator API, NEVER an HTTP route; password must not be committed. */
  bootstrap({ sellers, users, offers }) {
    if (this.db.prepare("SELECT 1 FROM users LIMIT 1").get())
      fail("ALREADY_INITIALIZED", 409);
    this.tx(() => {
      for (const s of sellers)
        this.db
          .prepare("INSERT INTO sellers VALUES (?,?,?,?)")
          .run(id(s.id), id(s.company), s.name, "review");
      for (const u of users) {
        if (
          !["admin", "seller"].includes(u.role) ||
          (u.role === "seller" && !u.seller) ||
          typeof u.password !== "string" ||
          u.password.length < 16 ||
          u.password.length > 128
        )
          fail("INVALID_BOOTSTRAP");
        const salt = secret();
        this.db
          .prepare("INSERT INTO users VALUES (?,?,?,?,?,?,1)")
          .run(
            id(u.id),
            u.email.toLowerCase(),
            salt,
            scryptSync(u.password, salt, 64).toString("hex"),
            u.role,
            u.seller ?? null,
          );
      }
      for (const o of offers)
        this.db
          .prepare("INSERT INTO offers VALUES (?,?,?,?,?,?,1,?,?)")
          .run(
            id(o.id),
            id(o.product),
            id(o.sku),
            id(o.seller),
            integer(o.price, 1, 100_000_000),
            integer(o.pack, 1, 100),
            "published",
            canonical(o.info),
          );
      this.audit("local-bootstrap", "initialize", "synthetic-test", {
        sellers: sellers.map((s) => s.id),
        users: users.map((u) => u.id),
      });
    });
  }
  createSession(user = null) {
    const token = secret(),
      owner = user ? "user:" + user : "guest:" + randomUUID();
    this.db
      .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
      .run(hash(token), owner, user, this.now() + 30 * 86400_000);
    return { token, principal: this.identity(token) };
  }
  identity(token) {
    if (typeof token !== "string" || token.length > 100) return null;
    const row = this.db
      .prepare(
        `SELECT s.owner,s.expires,s.user,u.role,u.seller,u.enabled FROM sessions s LEFT JOIN users u ON u.id=s.user WHERE s.token=?`,
      )
      .get(hash(token));
    if (!row || row.expires <= this.now() || (row.user && !row.enabled))
      return null;
    return {
      owner: row.owner,
      user: row.user,
      role: row.role ?? "guest",
      seller: row.seller,
    };
  }
  require(token, role) {
    const p = this.identity(token);
    if (!p) fail("AUTH_REQUIRED", 401);
    if (role && p.role !== role) fail("FORBIDDEN", 403);
    return p;
  }
  login(email, password, oldToken, clientKey) {
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      typeof password !== "string" ||
      password.length > 128
    )
      fail("INVALID_LOGIN", 401);
    const bucket = hash(String(clientKey));
    const attempt = this.db
      .prepare("SELECT * FROM login_attempts WHERE key=?")
      .get(bucket);
    if (attempt && attempt.until_at > this.now() && attempt.attempts >= 8)
      fail("LOGIN_RATE_LIMIT", 429);
    const u = this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.toLowerCase());
    const candidate = scryptSync(password, u?.salt ?? "invalid-user-salt", 64);
    if (
      !u?.enabled ||
      !timingSafeEqual(candidate, Buffer.from(u.password, "hex"))
    ) {
      this.db
        .prepare(
          `INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN until_at<=? THEN 1 ELSE attempts+1 END,until_at=?`,
        )
        .run(bucket, this.now() + 900_000, this.now(), this.now() + 900_000);
      fail("INVALID_LOGIN", 401);
    }
    return this.tx(() => {
      if (oldToken)
        this.db
          .prepare("DELETE FROM sessions WHERE token=?")
          .run(hash(oldToken));
      this.db.prepare("DELETE FROM login_attempts WHERE key=?").run(bucket);
      const s = this.createSession(u.id);
      this.audit(u.id, "login", u.id, {});
      return s;
    });
  }
  logout(token) {
    if (token)
      this.db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  }
  approve(token, seller, state) {
    const p = this.require(token, "admin");
    if (!["approved", "suspended"].includes(state)) fail("INVALID_STATE");
    return this.tx(() => {
      const old = this.db
        .prepare("SELECT * FROM sellers WHERE id=?")
        .get(id(seller));
      if (!old) fail("NOT_FOUND", 404);
      this.db
        .prepare("UPDATE sellers SET state=? WHERE id=?")
        .run(state, seller);
      this.audit(p.user, "seller-review", seller, {
        before: old.state,
        after: state,
      });
      return { id: seller, state };
    });
  }
  setUserEnabled(token, user, enabled) {
    const p = this.require(token, "admin");
    if (user === p.user || typeof enabled !== "boolean")
      fail("INVALID_USER_CHANGE");
    return this.tx(() => {
      if (!this.db.prepare("SELECT 1 FROM users WHERE id=?").get(id(user)))
        fail("NOT_FOUND", 404);
      this.db
        .prepare("UPDATE users SET enabled=? WHERE id=?")
        .run(enabled ? 1 : 0, user);
      this.audit(p.user, "user-enabled", user, { enabled });
    });
  }
  setPrice(token, offerId, price, version) {
    const p = this.require(token);
    integer(price, 1, 100_000_000);
    integer(version, 1, 1_000_000);
    return this.tx(() => {
      const o = this.db
        .prepare("SELECT * FROM offers WHERE id=?")
        .get(id(offerId));
      if (
        !o ||
        (p.role !== "admin" && (p.role !== "seller" || p.seller !== o.seller))
      )
        fail("NOT_FOUND", 404);
      if (o.version !== version) fail("STALE_OFFER", 409);
      this.db
        .prepare("UPDATE offers SET price=?,version=version+1 WHERE id=?")
        .run(price, offerId);
      this.audit(p.user, "offer-price", offerId, {
        before: o.price,
        after: price,
        version: version + 1,
      });
      return { id: offerId, price, version: version + 1 };
    });
  }
  catalog() {
    return this.db
      .prepare(
        `SELECT o.*,s.company,s.name seller_name FROM offers o JOIN sellers s ON s.id=o.seller WHERE o.state='published' AND s.state='approved' ORDER BY o.id`,
      )
      .all()
      .map((o) => ({ ...o, info: parse(o.info) }));
  }
  async quote(token, { lines, shippingMethod = "standaard" }) {
    const p = this.require(token);
    if (
      !Array.isArray(lines) ||
      lines.length < 1 ||
      lines.length > 30 ||
      new Set(lines.map((l) => l?.offerId)).size !== lines.length ||
      !["standaard", "express"].includes(shippingMethod)
    )
      fail("INVALID_CART");
    const offers = this.catalog();
    const accepted = lines.map((l) => {
      const o = offers.find((o) => o.id === l.offerId);
      if (!o) fail("OFFER_UNAVAILABLE", 409);
      return {
        offerId: o.id,
        productId: o.product,
        skuId: o.sku,
        sellerId: o.seller,
        company: o.company,
        title: o.info.title,
        sellerName: o.seller_name,
        variant: o.info.variant,
        packQuantity: o.pack,
        unitPriceCents: o.price,
        quantity: integer(l.quantity, 1, 10),
        version: o.version,
      };
    });
    // Availability is read from WMS, never a local quantity/reservation table. Receiver rechecks atomically at reserve.
    for (const company of new Set(accepted.map((l) => l.company))) {
      const receiver = this.receivers[company];
      if (!receiver) fail("WMS_NOT_CONNECTED", 503);
      const availability = await receiver.availability();
      const totals = new Map();
      for (const l of accepted.filter((l) => l.company === company))
        totals.set(
          l.skuId,
          (totals.get(l.skuId) ?? 0) + l.quantity * l.packQuantity,
        );
      for (const [sku, quantity] of totals)
        if (!Number.isFinite(availability[sku]) || availability[sku] < quantity)
          fail("INSUFFICIENT_STOCK", 409);
    }
    const subtotal = accepted.reduce(
      (s, l) => s + l.unitPriceCents * l.quantity,
      0,
    );
    const shipping =
      shippingMethod === "express" ? 795 : subtotal >= 5000 ? 0 : 495;
    const quote = {
      id: "quote-" + randomUUID(),
      lines: accepted,
      subtotalCents: subtotal,
      shippingCents: shipping,
      totalCents: subtotal + shipping,
      shippingMethod,
      expiresAt: this.now() + 300_000,
      currency: "EUR",
      tax: "synthetic-native-zero-v1",
    };
    this.db
      .prepare("INSERT INTO quotes VALUES (?,?,?,?)")
      .run(quote.id, p.owner, canonical(quote), quote.expiresAt);
    return quote;
  }
  place(token, { quoteId, checkout, idempotencyKey }) {
    const p = this.require(token);
    id(idempotencyKey);
    id(quoteId);
    if (!checkout || typeof checkout !== "object" || Array.isArray(checkout))
      fail("INVALID_ADDRESS");
    const fields = [
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
    ];
    if (Object.keys(checkout).some((k) => !fields.includes(k)))
      fail("UNEXPECTED_CHECKOUT_FIELD");
    for (const field of fields)
      if (
        typeof checkout[field] !== "string" ||
        checkout[field].length > 200 ||
        (!["addition"].includes(field) && !checkout[field].trim())
      )
        fail("INVALID_ADDRESS");
    checkout = Object.fromEntries(
      fields.map((field) => [field, checkout[field].trim()]),
    );
    if (
      Object.values(checkout).some((value) =>
        /[\u0000-\u001f\u007f]/.test(value),
      )
    )
      fail("INVALID_ADDRESS");
    checkout.email = checkout.email.toLowerCase();
    checkout.country = checkout.country.toUpperCase();
    checkout.postalCode = checkout.postalCode.toUpperCase();
    const person = /^[\p{L}][\p{L}\s'.-]{0,59}$/u;
    if (
      !person.test(checkout.firstName) ||
      !person.test(checkout.lastName) ||
      checkout.email.length > 120 ||
      checkout.phone.length > 30 ||
      !/^\d{1,5}$/.test(checkout.houseNumber) ||
      (checkout.addition && !/^[\p{L}\d-]{1,6}$/u.test(checkout.addition)) ||
      !/^(\+31|\+32|0031|0032|0)[1-9]\d{7,9}$/.test(
        checkout.phone.replace(/[\s()-]/g, ""),
      )
    )
      fail("INVALID_ADDRESS");
    if (
      checkout.country === "NL"
        ? !/^[1-9]\d{3}\s?[A-Z]{2}$/.test(checkout.postalCode)
        : !/^[1-9]\d{3}$/.test(checkout.postalCode)
    )
      fail("INVALID_ADDRESS");
    if (
      !/^[^\s@]+@[^\s@]+[.]test$/.test(checkout.email) ||
      !["NL", "BE"].includes(checkout.country)
    )
      fail("SYNTHETIC_ADDRESS_REQUIRED");
    const bodyHash = hash(canonical({ quoteId, checkout }));
    return this.tx(() => {
      const old = this.db
        .prepare("SELECT * FROM orders WHERE owner=? AND external_key=?")
        .get(p.owner, idempotencyKey);
      if (old) {
        if (old.body_hash !== bodyHash) fail("IDEMPOTENCY_CONFLICT", 409);
        return this.order(token, old.id);
      }
      const q = this.db
        .prepare("SELECT * FROM quotes WHERE id=? AND owner=?")
        .get(quoteId, p.owner);
      if (!q || q.expires <= this.now()) fail("QUOTE_EXPIRED", 409);
      if (this.db.prepare("SELECT 1 FROM orders WHERE quote_id=?").get(quoteId))
        fail("QUOTE_ALREADY_USED", 409);
      const quote = parse(q.body);
      for (const l of quote.lines) {
        const offer = this.db
          .prepare(
            `SELECT o.*,s.state seller_state FROM offers o JOIN sellers s ON s.id=o.seller WHERE o.id=?`,
          )
          .get(l.offerId);
        if (
          !offer ||
          offer.version !== l.version ||
          offer.price !== l.unitPriceCents ||
          offer.state !== "published" ||
          offer.seller_state !== "approved"
        )
          fail("QUOTE_CHANGED", 409);
      }
      const orderId = "BVT-TEST-" + randomUUID();
      this.db
        .prepare("INSERT INTO orders VALUES (?,?,?,?,?,?,?)")
        .run(
          orderId,
          p.owner,
          idempotencyKey,
          bodyHash,
          quoteId,
          canonical({ ...quote, checkout }),
          this.now(),
        );
      for (const seller of new Set(quote.lines.map((l) => l.sellerId)))
        this.db
          .prepare(
            "INSERT INTO portions VALUES (?,?,?,'pending_reservation','{}')",
          )
          .run(
            orderId,
            seller,
            quote.lines.find((l) => l.sellerId === seller).company,
          );
      this.db
        .prepare("INSERT INTO payments VALUES (?,'not_started',NULL)")
        .run(orderId);
      this.db
        .prepare("INSERT INTO order_lifecycle(order_id,expires) VALUES (?,?)")
        .run(orderId, this.now() + 900000);
      this.audit(p.user ?? p.owner, "order-created", orderId, {
        quote: quoteId,
      });
      return this.order(token, orderId);
    });
  }
  order(token, orderId) {
    const p = this.require(token);
    const row = this.db
      .prepare("SELECT * FROM orders WHERE id=?")
      .get(id(orderId));
    if (!row) fail("NOT_FOUND", 404);
    const body = parse(row.body);
    const allowed =
      p.role === "admin" ||
      row.owner === p.owner ||
      (p.role === "seller" && body.lines.some((l) => l.sellerId === p.seller));
    if (!allowed) fail("NOT_FOUND", 404);
    const sellerView = p.role === "seller";
    const portions = this.db
      .prepare("SELECT * FROM portions WHERE order_id=?")
      .all(orderId)
      .filter((x) => !sellerView || x.seller === p.seller)
      .map((x) => ({
        sellerId: x.seller,
        company: x.company,
        state: x.state,
        references: parse(x.refs),
      }));
    const lines = body.lines.filter(
      (l) => !sellerView || l.sellerId === p.seller,
    );
    const subtotal = lines.reduce(
      (s, l) => s + l.quantity * l.unitPriceCents,
      0,
    );
    const payment = this.db
      .prepare("SELECT status,reference FROM payments WHERE order_id=?")
      .get(orderId);
    const lifecycle = this.db
      .prepare("SELECT * FROM order_lifecycle WHERE order_id=?")
      .get(orderId);
    return {
      id: orderId,
      cancellationRequested: !!lifecycle.cancel_requested,
      reservationExpiresAt: new Date(lifecycle.expires).toISOString(),
      createdAt: new Date(row.created).toISOString(),
      lines,
      portions,
      subtotalCents: subtotal,
      shippingCents: sellerView ? null : body.shippingCents,
      totalCents: sellerView ? subtotal : body.totalCents,
      currency: "EUR",
      tax: body.tax,
      payment: { ...payment, mode: "simulator-no-provider" },
      checkout: sellerView
        ? {
            firstName: body.checkout.firstName,
            lastName: body.checkout.lastName,
            street: body.checkout.street,
            houseNumber: body.checkout.houseNumber,
            addition: body.checkout.addition,
            postalCode: body.checkout.postalCode,
            city: body.checkout.city,
            country: body.checkout.country,
          }
        : body.checkout,
    };
  }
  list(token) {
    const p = this.require(token);
    const rows =
      p.role === "admin"
        ? this.db
            .prepare("SELECT id FROM orders ORDER BY created DESC LIMIT 100")
            .all()
        : p.role === "seller"
          ? this.db
              .prepare(
                "SELECT o.id FROM orders o JOIN portions p ON p.order_id=o.id WHERE p.seller=? ORDER BY o.created DESC LIMIT 100",
              )
              .all(p.seller)
          : this.db
              .prepare(
                "SELECT id FROM orders WHERE owner=? ORDER BY created DESC LIMIT 100",
              )
              .all(p.owner);
    return rows.map((row) => this.order(token, row.id));
  }
  async reserveOrder(token, orderId) {
    const principal = this.require(token),
      order = this.order(token, orderId);
    if (
      principal.role !== "admin" &&
      this.db.prepare("SELECT owner FROM orders WHERE id=?").get(orderId)
        ?.owner !== principal.owner
    )
      fail("FORBIDDEN", 403);
    if (
      this.db
        .prepare(
          "SELECT cancel_requested FROM order_lifecycle WHERE order_id=?",
        )
        .get(orderId).cancel_requested
    )
      return this.cancelUnpaid(token, orderId, "retry-cancellation");
    const body = JSON.parse(
      this.db.prepare("SELECT body FROM orders WHERE id=?").get(orderId).body,
    );
    for (const portion of order.portions) {
      if (portion.state !== "pending_reservation") continue;
      const receiver = this.receivers[portion.company];
      if (!receiver) continue;
      const intent = this.journal.enqueue(this.worker, {
        company: portion.company,
        source: "borvat-test",
        operation: "reserve",
        externalKey: orderId + ":" + portion.sellerId + ":reserve",
        payload: {
          orderId,
          sellerId: portion.sellerId,
          lines: body.lines.filter((l) => l.sellerId === portion.sellerId),
          references: {},
        },
      });
      if (
        this.db
          .prepare(
            "SELECT cancel_requested FROM order_lifecycle WHERE order_id=?",
          )
          .get(orderId).cancel_requested
      )
        continue;
      const result = await this.journal.run(
        this.worker,
        portion.company,
        intent.id,
        receiver,
      );
      this.tx(() => {
        if (result.state === "completed" && result.result?.native) {
          const changed = this.db
            .prepare(
              "UPDATE portions SET state='reserved',refs=? WHERE order_id=? AND seller=? AND state='pending_reservation'",
            )
            .run(
              canonical({ reserve: result.result.native }),
              orderId,
              portion.sellerId,
            );
          if (changed.changes)
            this.audit(principal.user ?? principal.owner, "reserve", orderId, {
              seller: portion.sellerId,
              command: intent.id,
              references: result.result.references,
            });
        } else if (result.state === "rejected")
          this.db
            .prepare(
              "UPDATE portions SET state='reservation_rejected' WHERE order_id=? AND seller=? AND state='pending_reservation'",
            )
            .run(orderId, portion.sellerId);
      });
    }
    const portions = this.db
      .prepare("SELECT * FROM portions WHERE order_id=?")
      .all(orderId);
    if (portions.some((p) => p.state === "reservation_rejected")) {
      // Across independent companies, compensate confirmed holds before allowing payment.
      for (const portion of portions.filter((p) => p.state === "reserved")) {
        const receiver = this.receivers[portion.company];
        const intent = this.journal.enqueue(this.worker, {
          company: portion.company,
          source: "borvat-test",
          operation: "cancel",
          externalKey: orderId + ":" + portion.seller + ":cancel",
          payload: {
            orderId,
            sellerId: portion.seller,
            lines: body.lines.filter((l) => l.sellerId === portion.seller),
            references: JSON.parse(portion.refs),
          },
        });
        const result = await this.journal.run(
          this.worker,
          portion.company,
          intent.id,
          receiver,
        );
        if (result.state === "completed")
          this.tx(() => {
            this.db
              .prepare(
                "UPDATE portions SET state='cancelled',refs=? WHERE order_id=? AND seller=? AND state='reserved'",
              )
              .run(
                canonical({
                  ...JSON.parse(portion.refs),
                  cancel: result.result.native,
                }),
                orderId,
                portion.seller,
              );
            this.audit(
              "reservation-worker",
              "compensate-reservation",
              orderId,
              { seller: portion.seller, command: intent.id },
            );
          });
      }
    }
    if (
      this.db
        .prepare(
          "SELECT cancel_requested FROM order_lifecycle WHERE order_id=?",
        )
        .get(orderId).cancel_requested
    )
      return this.cancelUnpaid(token, orderId, "retry-cancellation");
    return this.order(token, orderId);
  }
  async cancelUnpaid(token, orderId, reason = "buyer-cancellation") {
    const principal = this.require(token);
    this.order(token, orderId);
    if (
      principal.role !== "admin" &&
      this.db.prepare("SELECT owner FROM orders WHERE id=?").get(orderId)
        ?.owner !== principal.owner
    )
      fail("FORBIDDEN", 403);
    if (typeof reason !== "string" || !reason.trim() || reason.length > 200)
      fail("INVALID_REASON");
    this.tx(() => {
      const payment = this.db
        .prepare("SELECT status FROM payments WHERE order_id=?")
        .get(orderId);
      if (!["not_started", "failed", "cancelled"].includes(payment.status))
        fail("PAYMENT_RECONCILIATION_REQUIRED", 409);
      const changed = this.db
        .prepare(
          "UPDATE order_lifecycle SET cancel_requested=1,reason=? WHERE order_id=? AND cancel_requested=0",
        )
        .run(reason.trim(), orderId);
      if (changed.changes)
        this.audit(
          principal.user ?? principal.owner,
          "cancellation-requested",
          orderId,
          { reason: reason.trim() },
        );
    });
    const body = JSON.parse(
      this.db.prepare("SELECT body FROM orders WHERE id=?").get(orderId).body,
    );
    for (let portion of this.db
      .prepare("SELECT * FROM portions WHERE order_id=?")
      .all(orderId)) {
      const receiver = this.receivers[portion.company];
      if (portion.state === "pending_reservation") {
        const reserve = this.db
          .prepare(
            "SELECT id FROM channel_commands WHERE company=? AND source='borvat-test' AND operation='reserve' AND external_key=?",
          )
          .get(portion.company, orderId + ":" + portion.seller + ":reserve");
        if (!reserve) {
          this.db
            .prepare(
              "UPDATE portions SET state='cancelled' WHERE order_id=? AND seller=? AND state='pending_reservation'",
            )
            .run(orderId, portion.seller);
          continue;
        }
        if (!receiver) continue;
        const known = await this.journal.run(
          this.worker,
          portion.company,
          reserve.id,
          receiver,
        );
        if (known.state === "rejected") {
          this.db
            .prepare(
              "UPDATE portions SET state='cancelled' WHERE order_id=? AND seller=? AND state='pending_reservation'",
            )
            .run(orderId, portion.seller);
          continue;
        }
        if (known.state !== "completed" || !known.result?.native) continue;
        this.db
          .prepare(
            "UPDATE portions SET state='reserved',refs=? WHERE order_id=? AND seller=? AND state='pending_reservation'",
          )
          .run(
            canonical({ reserve: known.result.native }),
            orderId,
            portion.seller,
          );
        portion = this.db
          .prepare("SELECT * FROM portions WHERE order_id=? AND seller=?")
          .get(orderId, portion.seller);
      }
      if (portion.state !== "reserved" || !receiver) continue;
      const intent = this.journal.enqueue(this.worker, {
        company: portion.company,
        source: "borvat-test",
        operation: "cancel",
        externalKey: orderId + ":" + portion.seller + ":cancel",
        payload: {
          orderId,
          sellerId: portion.seller,
          lines: body.lines.filter((l) => l.sellerId === portion.seller),
          references: JSON.parse(portion.refs),
        },
      });
      const result = await this.journal.run(
        this.worker,
        portion.company,
        intent.id,
        receiver,
      );
      if (result.state === "completed" && result.result?.native)
        this.tx(() => {
          const changed = this.db
            .prepare(
              "UPDATE portions SET state='cancelled',refs=? WHERE order_id=? AND seller=? AND state='reserved'",
            )
            .run(
              canonical({
                ...JSON.parse(portion.refs),
                cancel: result.result.native,
              }),
              orderId,
              portion.seller,
            );
          if (changed.changes)
            this.audit(
              "reservation-worker",
              "native-reservation-released",
              orderId,
              {
                seller: portion.seller,
                command: intent.id,
                references: result.result.references,
              },
            );
        });
    }
    return this.order(token, orderId);
  }
  async expireUnpaid(token) {
    this.require(token, "admin");
    const rows = this.db
      .prepare(
        "SELECT l.order_id FROM order_lifecycle l JOIN payments p ON p.order_id=l.order_id WHERE l.expires<=? AND p.status IN ('not_started','failed','cancelled') AND EXISTS(SELECT 1 FROM portions s WHERE s.order_id=l.order_id AND s.state IN ('reserved','pending_reservation')) ORDER BY l.expires LIMIT 100",
      )
      .all(this.now());
    const results = [];
    for (const row of rows) {
      const order = await this.cancelUnpaid(
        token,
        row.order_id,
        "reservation-expired",
      );
      results.push({
        order: order.id,
        states: order.portions.map((p) => p.state),
      });
    }
    return { mode: "manual-test-sweep; not a hosted scheduler", results };
  }
  async executePortion(
    token,
    orderId,
    sellerId,
    action,
    payload = {},
    externalKey = action,
  ) {
    const p = this.require(token);
    this.order(token, orderId);
    if (p.role !== "admin" && (p.role !== "seller" || p.seller !== sellerId))
      fail("FORBIDDEN", 403);
    if (
      p.role === "seller" &&
      this.db.prepare("SELECT state FROM sellers WHERE id=?").get(p.seller)
        ?.state !== "approved"
    )
      fail("SELLER_SUSPENDED", 403);
    const portion = this.db
      .prepare("SELECT * FROM portions WHERE order_id=? AND seller=?")
      .get(orderId, id(sellerId));
    if (!portion) fail("NOT_FOUND", 404);
    const receiver = this.receivers[portion.company];
    if (!receiver) fail("WMS_NOT_CONNECTED", 503);
    const refs = parse(portion.refs),
      body = parse(
        this.db.prepare("SELECT body FROM orders WHERE id=?").get(orderId).body,
      );
    const lifecycle = this.db
      .prepare("SELECT cancel_requested FROM order_lifecycle WHERE order_id=?")
      .get(orderId);
    if (lifecycle.cancel_requested && action !== "cancel")
      fail("ORDER_CANCELLATION_PENDING", 409);
    if (
      action === "cancel" &&
      !["not_started", "failed", "cancelled"].includes(
        this.db
          .prepare("SELECT status FROM payments WHERE order_id=?")
          .get(orderId).status,
      )
    )
      fail("PAYMENT_RECONCILIATION_REQUIRED", 409);
    const transitions = {
      reserve: ["pending_reservation", "reserved"],
      pick: ["reserved", "picked"],
      pack: ["picked", "packed"],
      ship: ["packed", "shipped"],
      invoice: ["shipped", "invoiced"],
      receipt: ["invoiced", "receipted"],
      return: ["receipted", "returned"],
      credit: ["returned", "credited"],
      refund: ["credited", "refund_recorded"],
      cancel: ["reserved", "cancelled"],
    };
    const transition = transitions[action];
    if (!transition) fail("INVALID_ACTION");
    const commandKey = orderId + ":" + sellerId + ":" + id(externalKey);
    const commandPayload = {
      orderId,
      sellerId,
      lines: body.lines.filter((l) => l.sellerId === sellerId),
      references: refs,
      ...payload,
    };
    // Refuse client field overriding the trusted order/identity/document bindings.
    if (
      Object.keys(payload).some(
        (k) => !["quantity", "lineId", "reason"].includes(k),
      )
    )
      fail("INVALID_ACTION_PAYLOAD");
    const oldCommand = this.db
      .prepare(
        "SELECT id,state,envelope FROM channel_commands WHERE company=? AND source=? AND operation=? AND external_key=?",
      )
      .get(portion.company, "borvat-test", action, commandKey);
    if (portion.state !== transition[0] && !oldCommand)
      fail("INVALID_TRANSITION", 409);
    if (
      ["pick", "pack", "ship"].includes(action) &&
      this.db
        .prepare("SELECT status FROM payments WHERE order_id=?")
        .get(orderId).status !== "succeeded"
    )
      fail("PAYMENT_NOT_CONFIRMED", 409);
    if (action === "invoice" && body.shippingCents !== 0)
      fail("SHIPPING_ACCOUNTING_BINDING_REQUIRED", 409);
    // Freeze original dependencies on replay; only external command metadata can advance asynchronously.
    const frozen = oldCommand
      ? parse(oldCommand.envelope).payload
      : commandPayload;
    if (
      oldCommand &&
      canonical({ ...frozen, references: {} }) !==
        canonical({ ...commandPayload, references: {} })
    )
      fail("IDEMPOTENCY_CONFLICT", 409);
    const intent = this.journal.enqueue(this.worker, {
      company: portion.company,
      source: "borvat-test",
      operation: action,
      externalKey: commandKey,
      payload: frozen,
    });
    const result = await this.journal.run(
      this.worker,
      portion.company,
      intent.id,
      receiver,
    );
    // Reauthorize after I/O, not a stale role snapshot. Native completion remains durable even if actor revoked.
    const currentPrincipal = this.require(token);
    this.order(token, orderId);
    if (
      currentPrincipal.role !== "admin" &&
      (currentPrincipal.role !== "seller" ||
        currentPrincipal.seller !== sellerId ||
        this.db
          .prepare("SELECT state FROM sellers WHERE id=?")
          .get(currentPrincipal.seller)?.state !== "approved")
    )
      fail("FORBIDDEN", 403);
    this.tx(() => {
      const current = this.db
        .prepare("SELECT * FROM portions WHERE order_id=? AND seller=?")
        .get(orderId, sellerId);
      const currentRefs = parse(current.refs);
      if (result.state === "completed") {
        const native = result.result.native;
        if (!native || typeof native !== "object")
          fail("NATIVE_EVIDENCE_MISSING", 502);
        if (current.state === transition[0]) {
          this.db
            .prepare(
              "UPDATE portions SET state=?,refs=? WHERE order_id=? AND seller=?",
            )
            .run(
              transition[1],
              canonical({ ...currentRefs, [action]: native }),
              orderId,
              sellerId,
            );
          this.audit(p.user, action, orderId, {
            seller: sellerId,
            command: intent.id,
            references: result.result.references,
          });
        }
      }
    });
    return { command: result, order: this.order(token, orderId) };
  }
  /** Named simulation only. No browser webhook can mark native/provider money received. */
  simulatePayment(token, orderId, { eventId, status, reference }) {
    const p = this.require(token, "admin");
    this.order(token, orderId);
    id(eventId);
    id(reference);
    if (
      ![
        "pending",
        "failed",
        "cancelled",
        "succeeded",
        "refund_pending",
        "refunded",
      ].includes(status)
    )
      fail("INVALID_PAYMENT_STATE");
    const digest = hash(canonical({ orderId, status, reference }));
    return this.tx(() => {
      const old = this.db
        .prepare("SELECT * FROM payment_events WHERE event_id=?")
        .get(eventId);
      if (old) {
        if (old.body_hash !== digest) fail("IDEMPOTENCY_CONFLICT", 409);
        return this.order(token, orderId);
      }
      const current = this.db
        .prepare("SELECT * FROM payments WHERE order_id=?")
        .get(orderId);
      const allowed = {
        not_started: ["pending", "failed", "cancelled", "succeeded"],
        pending: ["failed", "cancelled", "succeeded"],
        succeeded: ["refund_pending"],
        refund_pending: ["refunded"],
        failed: [],
        cancelled: [],
        refunded: [],
      };
      if (!allowed[current.status].includes(status))
        fail("INVALID_PAYMENT_TRANSITION", 409);
      const parts = this.db
        .prepare("SELECT state FROM portions WHERE order_id=?")
        .all(orderId);
      if (status === "succeeded" && parts.some((x) => x.state !== "reserved"))
        fail("RESERVATION_NOT_CONFIRMED", 409);
      if (
        status === "succeeded" &&
        this.db
          .prepare(
            "SELECT cancel_requested FROM order_lifecycle WHERE order_id=?",
          )
          .get(orderId).cancel_requested
      )
        fail("ORDER_CANCELLATION_PENDING", 409);
      if (
        ["refund_pending", "refunded"].includes(status) &&
        parts.some((x) => x.state !== "credited")
      )
        fail("CREDIT_NOT_CONFIRMED", 409);
      this.db
        .prepare("INSERT INTO payment_events VALUES (?,?,?,?)")
        .run(eventId, orderId, digest, status);
      this.db
        .prepare("UPDATE payments SET status=?,reference=? WHERE order_id=?")
        .run(status, reference, orderId);
      this.audit(p.user, "simulator-payment", orderId, {
        status,
        eventId,
        reference,
        provider: false,
      });
      return this.order(token, orderId);
    });
  }
  admin(token) {
    this.require(token, "admin");
    return {
      sellers: this.db.prepare("SELECT * FROM sellers ORDER BY id").all(),
      audit: this.db
        .prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT 100")
        .all()
        .map((x) => ({ ...x, change: parse(x.change) })),
      source:
        "marketplace-order-projections; financial balances unavailable; native documents referenced only",
      orders: this.list(token),
    };
  }
}
