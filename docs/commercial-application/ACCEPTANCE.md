# Functional evidence — bounded scope

| Case | Implemented behaviour | Current evidence |
|---|---|---|
| CA01 | Search/category/lowest-price selector, exclude review-only offers | Domain tests PASS; browser entry/filter clicks NOT_RUN |
| CA02 | One product, competing seller offers | Domain + initial React static render PASS; interactive comparison NOT_RUN |
| CA03 | Cart quantity/remove/article totals and unavailable/changed offers | Domain + cart static render PASS; input interaction NOT_RUN |
| CA04 | Save synthetic request, clear cart, retain line price snapshot | Domain PASS; actual browser submission NOT_RUN |
| CA05 | Seller draft→review→admin publish/return to draft | Domain + seller/admin static render PASS; button interaction NOT_RUN |
| CA06 | Per-shop request preparation and shared overview | Domain + seller/admin/buyer static render PASS; no real fulfilment |
| CA07 | Empty cart/orders and original-image disclosure | React static render PASS; no fabricated media |
| CA08 | Disposable state and reset | Domain PASS; no persistence claim |
| CA09 | Original order/auth component HTML/text rendering | 9 renderer tests PASS; email delivery NOT_RUN; no mail API imported |
| CA10 | New-source typing/lint and scoped preview build | PASS; whole-app diagnostic evidence excluded pending specialist disclosure review |
| CA11 | Original source/asset parity | 499 text hashes PASS; 69 binaries BLOCKED; whole-app build FAIL missing hero.jpg |
| CA12 | Full browser/mobile/keyboard/visual journey | BLOCKED / NOT_RUN: browser could not reach loopback server |

31 required tests pass locally: 22 commercial/domain/static React cases and nine email renderer cases. They are not the original 35 full marketplace acceptance scenarios. Original 35 remain NOT_RUN, and this addition changes no historical acceptance result. Tests use synthetic product fixtures, example.test addresses and no delivery/provider/database client.
