/** Single synthetic shared points authority. Never a financial balance or wallet. */
import { DatabaseSync } from "node:sqlite";
import { canonical, hash } from "../commerce-server/store.mjs";

export class LoyaltyAuthority {
  constructor({ path, authorize, verify, now = Date.now }) {
    if (typeof authorize !== "function" || typeof verify !== "function")
      throw Error(
        "Current scoped authorization and native evidence verifier required",
      );
    this.authorize = authorize;
    this.verify = verify;
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS loyalty_accounts(id TEXT PRIMARY KEY,program TEXT NOT NULL,customer TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,UNIQUE(program,customer));
      CREATE TABLE IF NOT EXISTS loyalty_commands(id TEXT PRIMARY KEY,body_hash TEXT NOT NULL,result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS loyalty_lots(id TEXT PRIMARY KEY,account TEXT NOT NULL,company TEXT NOT NULL,invoice TEXT NOT NULL,line TEXT NOT NULL,rule TEXT NOT NULL,net INTEGER NOT NULL,points INTEGER NOT NULL,remaining INTEGER NOT NULL,reversed INTEGER NOT NULL DEFAULT 0,expired INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL,UNIQUE(account,company,invoice,line,rule));
      CREATE TABLE IF NOT EXISTS loyalty_movements(id TEXT PRIMARY KEY,account TEXT NOT NULL,kind TEXT NOT NULL,points INTEGER NOT NULL,reference TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS loyalty_credits(id TEXT PRIMARY KEY,lot TEXT NOT NULL,amount INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS loyalty_holds(id TEXT PRIMARY KEY,account TEXT NOT NULL,points INTEGER NOT NULL,expires INTEGER NOT NULL,state TEXT NOT NULL,allocation TEXT NOT NULL,quote TEXT NOT NULL);
    `);
  }
  close() {
    this.db.close();
  }
  account(principal, program, customer, operation) {
    for (const value of [program, customer])
      if (typeof value !== "string" || value.length < 1 || value.length > 128)
        throw Error("Invalid loyalty identity");
    if (this.authorize(principal, program, customer, operation) !== true)
      throw Error("Loyalty scope denied");
    return hash(canonical([program, customer]));
  }
  tx(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  command(account, key, body, fn) {
    if (typeof key !== "string" || key.length < 1 || key.length > 300)
      throw Error("Loyalty command ID required");
    const id = hash(canonical([account, key])),
      digest = hash(canonical(body));
    return this.tx(() => {
      const old = this.db
        .prepare("SELECT * FROM loyalty_commands WHERE id=?")
        .get(id);
      if (old) {
        if (old.body_hash !== digest)
          throw Error("Loyalty idempotency conflict");
        return JSON.parse(old.result);
      }
      const result = fn();
      this.db
        .prepare("INSERT INTO loyalty_commands VALUES (?,?,?)")
        .run(id, digest, canonical(result));
      this.db
        .prepare("UPDATE loyalty_accounts SET version=version+1 WHERE id=?")
        .run(account);
      return result;
    });
  }
  ensure(account, program, customer) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO loyalty_accounts(id,program,customer) VALUES (?,?,?)",
      )
      .run(account, program, customer);
  }
  total(account) {
    return this.db
      .prepare(
        "SELECT coalesce(sum(points),0) n FROM loyalty_movements WHERE account=?",
      )
      .get(account).n;
  }
  available(account) {
    const lots = this.db
      .prepare(
        "SELECT coalesce(sum(remaining),0) n FROM loyalty_lots WHERE account=? AND expires>?",
      )
      .get(account, this.now()).n;
    const held = this.db
      .prepare(
        "SELECT coalesce(sum(points),0) n FROM loyalty_holds WHERE account=? AND state='held' AND expires>?",
      )
      .get(account, this.now()).n;
    return Math.max(0, Math.min(lots, this.total(account)) - held);
  }
  balance(principal, program, customer) {
    const account = this.account(principal, program, customer, "read");
    return {
      version:
        this.db
          .prepare("SELECT version FROM loyalty_accounts WHERE id=?")
          .get(account)?.version ?? 0,
      available: this.available(account),
      ledgerPoints: this.total(account),
      debt: Math.max(0, -this.total(account)),
      movements: this.db
        .prepare(
          "SELECT kind,points,reference,at FROM loyalty_movements WHERE account=? ORDER BY at,id",
        )
        .all(account)
        .map((x) => ({ ...x, reference: JSON.parse(x.reference) })),
    };
  }
  async earn(
    principal,
    { program, customer, company, invoice, line, channel },
  ) {
    const account = this.account(principal, program, customer, "earn");
    const evidence = await this.verify({
      kind: "invoice",
      company,
      invoice,
      line,
      customer,
    });
    if (
      !evidence?.submitted ||
      !evidence.paid ||
      !evidence.fulfilled ||
      evidence.currency !== "EUR" ||
      !Number.isSafeInteger(evidence.eligibleNetCents) ||
      evidence.eligibleNetCents < 0
    )
      throw Error("Native invoice/payment/fulfilment eligibility required");
    this.account(principal, program, customer, "earn");
    const source = { company, invoice, line, rule: "test-eur-v1" }; // Deliberately excludes channel and webhook identity.
    const body = { ...source, net: evidence.eligibleNetCents };
    return this.command(account, "earn:" + canonical(source), body, () => {
      this.ensure(account, program, customer);
      const points = Math.floor(body.net / 100),
        debt = Math.max(0, -this.total(account));
      const lot = hash(canonical([account, source]));
      this.db
        .prepare(
          "INSERT INTO loyalty_lots(id,account,company,invoice,line,rule,net,points,remaining,expires) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          lot,
          account,
          company,
          invoice,
          line,
          source.rule,
          body.net,
          points,
          Math.max(0, points - debt),
          this.now() + 365 * 86400_000,
        );
      this.db
        .prepare("INSERT INTO loyalty_movements VALUES (?,?,?,?,?,?)")
        .run(
          lot,
          account,
          "earn",
          points,
          canonical({
            ...source,
            evidence: "verified-native",
            firstChannel: channel,
          }),
          this.now(),
        );
      return { lot, points, source };
    });
  }
  async credit(
    principal,
    { program, customer, company, invoice, line, creditNote, creditLine },
  ) {
    const account = this.account(principal, program, customer, "credit");
    const proof = await this.verify({
      kind: "credit",
      company,
      invoice,
      line,
      creditNote,
      creditLine,
      customer,
    });
    if (
      !proof?.submitted ||
      !Number.isSafeInteger(proof.eligibleCreditCents) ||
      proof.eligibleCreditCents <= 0
    )
      throw Error("Native submitted credit required");
    this.account(principal, program, customer, "credit");
    const source = { company, invoice, line, creditNote, creditLine };
    return this.command(
      account,
      "credit:" + canonical(source),
      { ...source, amount: proof.eligibleCreditCents },
      () => {
        const lot = this.db
          .prepare(
            "SELECT * FROM loyalty_lots WHERE account=? AND company=? AND invoice=? AND line=? AND rule=?",
          )
          .get(account, company, invoice, line, "test-eur-v1");
        if (!lot) throw Error("Original earn source missing");
        const creditId = hash(canonical([account, source]));
        const prior = this.db
          .prepare(
            "SELECT coalesce(sum(amount),0) n FROM loyalty_credits WHERE lot=?",
          )
          .get(lot.id).n;
        const cumulative = prior + proof.eligibleCreditCents;
        if (cumulative > lot.net)
          throw Error("Credit exceeds native eligible source");
        const desired = lot.points - Math.floor((lot.net - cumulative) / 100);
        const reverse = Math.max(
          0,
          Math.min(desired, lot.points - lot.expired) - lot.reversed,
        );
        this.db
          .prepare("INSERT INTO loyalty_credits VALUES (?,?,?)")
          .run(creditId, lot.id, proof.eligibleCreditCents);
        this.db
          .prepare(
            "UPDATE loyalty_lots SET remaining=max(0,remaining-?),reversed=reversed+? WHERE id=?",
          )
          .run(reverse, reverse, lot.id);
        this.db
          .prepare("INSERT INTO loyalty_movements VALUES (?,?,?,?,?,?)")
          .run(
            creditId,
            account,
            "credit",
            -reverse,
            canonical(source),
            this.now(),
          );
        return {
          reversed: reverse,
          source,
          debt: Math.max(0, -this.total(account)),
        };
      },
    );
  }
  hold(principal, { program, customer, key, quote, points, expectedVersion }) {
    const account = this.account(principal, program, customer, "redeem");
    if (
      !Number.isSafeInteger(points) ||
      points < 1 ||
      typeof quote !== "string" ||
      !quote
    )
      throw Error("Invalid redemption");
    return this.command(
      account,
      "hold:" + key,
      { quote, points, expectedVersion },
      () => {
        this.ensure(account, program, customer);
        const current = this.db
          .prepare("SELECT version FROM loyalty_accounts WHERE id=?")
          .get(account);
        if (current.version !== expectedVersion)
          throw Error("Loyalty account version conflict");
        if (this.available(account) < points)
          throw Error("Insufficient points");
        // Reserve against individual unexpired lots after all other active allocations.
        const holds = this.db
          .prepare(
            "SELECT allocation FROM loyalty_holds WHERE account=? AND state='held' AND expires>?",
          )
          .all(account, this.now());
        const held = new Map();
        for (const h of holds)
          for (const a of JSON.parse(h.allocation))
            held.set(a.lot, (held.get(a.lot) ?? 0) + a.points);
        let remaining = points;
        const allocation = [];
        for (const lot of this.db
          .prepare(
            "SELECT * FROM loyalty_lots WHERE account=? AND expires>? ORDER BY expires,id",
          )
          .all(account, this.now())) {
          const qty = Math.min(
            remaining,
            lot.remaining - (held.get(lot.id) ?? 0),
          );
          if (qty > 0) {
            allocation.push({ lot: lot.id, points: qty });
            remaining -= qty;
          }
          if (!remaining) break;
        }
        if (remaining) throw Error("Points allocation conflict");
        const hold = hash(canonical([account, key]));
        const expires = Math.min(
          this.now() + 600_000,
          ...allocation.map(
            (a) =>
              this.db
                .prepare("SELECT expires FROM loyalty_lots WHERE id=?")
                .get(a.lot).expires,
          ),
        );
        this.db
          .prepare("INSERT INTO loyalty_holds VALUES (?,?,?,?,'held',?,?)")
          .run(hold, account, points, expires, canonical(allocation), quote);
        return { hold, points, expires };
      },
    );
  }
  async commit(principal, { program, customer, hold, discountRef }) {
    const account = this.account(principal, program, customer, "redeem");
    const evidence = await this.verify({
      kind: "discount",
      customer,
      hold,
      discountRef,
    });
    if (!evidence?.confirmed)
      throw Error("Native accounting-confirmed redemption required");
    this.account(principal, program, customer, "redeem");
    return this.command(
      account,
      "commit:" + hold,
      { hold, discountRef },
      () => {
        const h = this.db
          .prepare("SELECT * FROM loyalty_holds WHERE id=? AND account=?")
          .get(hold, account);
        if (
          !h ||
          h.state !== "held" ||
          h.expires <= this.now() ||
          evidence.points !== h.points ||
          evidence.quote !== h.quote
        )
          throw Error("Invalid/expired redemption");
        if (this.total(account) < h.points)
          throw Error("Credit changed available points");
        for (const a of JSON.parse(h.allocation)) {
          const lot = this.db
            .prepare("SELECT * FROM loyalty_lots WHERE id=?")
            .get(a.lot);
          if (lot.remaining < a.points || lot.expires <= this.now())
            throw Error("Credit/expiry changed redemption lot");
          this.db
            .prepare("UPDATE loyalty_lots SET remaining=remaining-? WHERE id=?")
            .run(a.points, a.lot);
        }
        this.db
          .prepare("UPDATE loyalty_holds SET state='committed' WHERE id=?")
          .run(hold);
        this.db
          .prepare("INSERT INTO loyalty_movements VALUES (?,?,?,?,?,?)")
          .run(
            "redeem:" + hold,
            account,
            "redeem",
            -h.points,
            canonical({ hold, discountRef }),
            this.now(),
          );
        return { hold, state: "committed" };
      },
    );
  }
  release(principal, { program, customer, hold }) {
    const account = this.account(principal, program, customer, "redeem");
    return this.command(account, "release:" + hold, { hold }, () => {
      const h = this.db
        .prepare("SELECT state FROM loyalty_holds WHERE id=? AND account=?")
        .get(hold, account);
      if (!h || h.state === "committed")
        throw Error("Cannot release committed redemption");
      this.db
        .prepare("UPDATE loyalty_holds SET state='released' WHERE id=?")
        .run(hold);
      return { hold, state: "released" };
    });
  }
  expire(principal, { program, customer }) {
    const account = this.account(principal, program, customer, "expire");
    return this.tx(() => {
      this.db
        .prepare(
          "UPDATE loyalty_holds SET state='released' WHERE account=? AND state='held' AND expires<=?",
        )
        .run(account, this.now());
      const lots = this.db
        .prepare(
          "SELECT * FROM loyalty_lots WHERE account=? AND expires<=? AND remaining>0",
        )
        .all(account, this.now());
      for (const lot of lots) {
        this.db
          .prepare(
            "UPDATE loyalty_lots SET remaining=0,expired=expired+? WHERE id=?",
          )
          .run(lot.remaining, lot.id);
        this.db
          .prepare("INSERT INTO loyalty_movements VALUES (?,?,?,?,?,?)")
          .run(
            "expire:" + lot.id,
            account,
            "expiry",
            -lot.remaining,
            canonical({ lot: lot.id, expires: lot.expires }),
            this.now(),
          );
      }
      if (lots.length)
        this.db
          .prepare("UPDATE loyalty_accounts SET version=version+1 WHERE id=?")
          .run(account);
      return { lots: lots.length };
    });
  }
}
