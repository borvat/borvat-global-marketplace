// BORVAT isolated commerce test gate. No network, credentials, DB writes or deployment.
import {spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const files=[
 "tests/test-order-service.test.mjs",
 "tests/test-cart-pricing.test.mjs",
 "tests/test-checkout-quote.test.mjs",
 "tests/test-server-shipping.test.mjs",
 "tests/test-buyer-receipt.test.mjs",
 "tests/test-quoted-order-service.test.mjs",
 "tests/test-cancel-draft-order.test.mjs",
 "tests/test-order-cancel-lifecycle.test.mjs"
];
if(files.some(f=>!existsSync(resolve(root,f)))){console.error("Missing commerce test file");process.exit(2)}
const result=spawnSync(process.execPath,["--test",...files],{cwd:root,encoding:"utf8",stdio:"inherit",env:{PATH:process.env.PATH,HOME:process.env.HOME,CI:"true"}});
if(result.error){console.error(result.error.message);process.exit(2)}
process.exit(result.status??2);
