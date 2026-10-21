# All 35 acceptance scenarios

No full BORVAT scenario is certified PASS. Original requirements are unchanged.

| ID | Area | E2E | Component evidence / gap |
|---|---|---|---|
| A01 | Auth | NOT_RUN | PARTIAL: Native customer/member actor probes only; full verification/reset/session UI not run |
| A02 | Isolation | NOT_RUN | PARTIAL: Native HTTP seller/buyer boundaries and proof-schema RLS; full RPC/MCP/file/report/job matrix absent |
| A03 | Seller KYB | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A04 | Legacy bypass | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A05 | Status integrity | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A06 | Catalog | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A07 | Safety | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A08 | Publication | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A09 | Quote | NOT_RUN | PARTIAL: Native offer price/quantity tests only; accepted quote full UI not proven |
| A10 | Payments | NOT_RUN | FAIL: H06 native payout loses recovery row; separate Surooh P01-P24 are not native wiring |
| A11 | Concurrency | NOT_RUN | PARTIAL: Proof queue/worker concurrency and earlier core last-unit test; native simultaneous order race not run |
| A12 | Idempotency | NOT_RUN | PARTIAL: Proof idempotent intent and native capture replay; complete checkout retry chain absent |
| A13 | Reservation expiry | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A14 | Webhook | NOT_RUN | PARTIAL: Proof HMAC/timestamp/inbox cases; real provider signature protocol not exercised |
| A15 | Audit | NOT_RUN | PARTIAL: Proof append-only events; complete admin/native audit coverage absent |
| A16 | Cancellation | NOT_RUN | PARTIAL: Native cancel/refund allocation component tests; full UI/provider path absent |
| A17 | Shipping price | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A18 | Fulfilment | NOT_RUN | PARTIAL: Native fulfillment/stock components; WMS gateway not connected |
| A19 | Withdrawal | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A20 | Partial return | NOT_RUN | PARTIAL: Native return scoping/restock components; consumer workflow not E2E |
| A21 | Refund after payout | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A22 | Commission | NOT_RUN | PARTIAL: Earlier native commission component tests; Accounting posting absent |
| A23 | Accounting outage | NOT_RUN | PARTIAL: Pure accounting contract and durable pending state design; actual outage integration absent |
| A24 | Reconciliation | NOT_RUN | FAIL: H06 recovery failure; Surooh proof restores its own state only |
| A25 | Dependency failure | NOT_RUN | PARTIAL: Proof provider outage/restart; cross-system outage chain absent |
| A26 | Privacy | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A27 | Reviews | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A28 | SAM | NOT_RUN | PARTIAL: SAM allowlisted projection only; real SAM tool boundary not run |
| A29 | ACL drift | NOT_RUN | PARTIAL: Default-native/trusted service gaps observed; persisted authorization/ACL drift suite absent |
| A30 | Disputes | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A31 | Upload security | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A32 | Portability | NOT_RUN | PARTIAL: 499 text files match; 69 binaries missing and app build fails |
| A33 | Load/restore | NOT_RUN | PARTIAL: Proof logical backup/restore only; no full native/PITR/load proof |
| A34 | Full journey | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
| A35 | DAC7 | NOT_RUN | NOT_RUN: No complete new execution evidence for this scenario; original requirements remain |
