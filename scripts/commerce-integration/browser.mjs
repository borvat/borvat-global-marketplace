import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const { chromium } = await import(
  pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE))
);
const out = resolve(process.env.BROWSER_EVIDENCE_DIR);
await mkdir(out, { recursive: true });
const app = fileURLToPath(new URL("../../apps/marketplace/", import.meta.url));
const networkGuard = fileURLToPath(
  new URL("../foundation/no-external-network.mjs", import.meta.url),
);
const server = spawn(process.execPath, [".output/server/index.mjs"], {
  cwd: app,
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NITRO_HOST: "127.0.0.1",
    NITRO_PORT: "4180",
    NODE_OPTIONS: "--import=" + networkGuard,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
let ready = false;
for (let i = 0; i < 100; i++) {
  if (server.exitCode !== null)
    throw Error("Original app server exited: " + serverLog);
  try {
    const r = await fetch("http://127.0.0.1:4180/discover?country=BE");
    if (r.status === 200) {
      const html = await r.text();
      assert.match(html, /lang="nl-BE"/);
      assert.match(html, /LOKALE DEMO/);
      assert.match(html, /Voorbeeldcollectie laden/);
      await writeFile(`${out}/ssr-discover.html`, html);
      ready = true;
      break;
    }
  } catch {
    /* bounded loopback readiness probe */
  }
  await new Promise((r) => setTimeout(r, 100));
}
if (!ready) {
  server.kill();
  throw Error("Original app SSR did not become ready: " + serverLog);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: [
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  headless: true,
  env: {
    ...process.env,
    FONTCONFIG_PATH: process.env.CHROMIUM_FONTS,
    LD_LIBRARY_PATH: process.env.CHROMIUM_LIBS,
  },
});
const results = [];
try {
  const protocol = [];
  for (const [method, path, status] of [
    ["HEAD", "/discover", 200],
    ["GET", "/account", 404],
    ["GET", "/.mcp/list-tools", 404],
    ["POST", "/lovable/email/auth/webhook", 405],
    ["POST", "/discover", 405],
  ]) {
    const r = await fetch("http://127.0.0.1:4180" + path, { method });
    assert.equal(r.status, status);
    protocol.push({ method, path, status: r.status });
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJs.newPage();
  const noJsExternal = [];
  await staticPage.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1" && u.port === "4180")
      return route.continue();
    noJsExternal.push(u.origin);
    return route.abort();
  });
  await staticPage.goto("http://127.0.0.1:4180/discover?country=BE");
  await staticPage
    .getByRole("heading", { name: "Ontdek onze voorbeeldcollectie" })
    .waitFor();
  assert.equal(await staticPage.getByRole("main").count(), 1);
  assert.equal(await staticPage.locator("html").getAttribute("lang"), "nl-BE");
  await staticPage
    .getByText("Voorbeeldcollectie laden…", { exact: true })
    .waitFor();
  await staticPage.screenshot({
    path: `${out}/ssr-no-javascript.png`,
    fullPage: true,
  });
  await noJs.close();
  assert.deepEqual(noJsExternal, []);
  results.push({
    case: "SSR without JavaScript and isolated HTTP dispatch",
    status: "PASS",
    protocol,
    externalRequests: noJsExternal,
  });

  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [],
      external = [],
      hydrationErrors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (
        /hydration|hydrating|Minified React error|server rendered HTML/i.test(
          m.text(),
        )
      )
        hydrationErrors.push(m.text());
    });
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === "127.0.0.1" && u.port === "4180")
        return route.continue();
      external.push(u.origin);
      return route.abort();
    });
    const shot = async (name) => {
      await page.screenshot({
        path: `${out}/${width}-${name}.png`,
        fullPage: true,
      });
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ))
      )
        await writeFile(
          `${out}/overflow.json`,
          JSON.stringify(
            await page
              .locator("body *")
              .evaluateAll((els) =>
                els
                  .filter((el) => el.getBoundingClientRect().right > innerWidth)
                  .map((el) => ({
                    tag: el.tagName,
                    cls: el.className,
                    text: el.textContent?.slice(0, 80),
                    right: el.getBoundingClientRect().right,
                  })),
              ),
            null,
            2,
          ),
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${width} ${name} overflow`,
      );
      assert.equal(await page.getByRole("main").count(), 1);
      await page.screenshot({
        path: `${out}/${width}-${name}.png`,
        fullPage: true,
      });
    };
    const nav = () => page.getByRole("navigation", { name: "Hoofdnavigatie" });
    await page.goto("http://127.0.0.1:4180/discover?country=BE");
    await page.getByTestId("discovery-product").first().waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "nl-BE");
    await page.getByLabel("Zoek producten", { exact: true }).fill("eettafel");
    await page.getByLabel("Categorie", { exact: true }).selectOption("Wonen");
    await page.getByLabel("Sorteer", { exact: true }).selectOption("price");
    assert.equal(await page.getByTestId("discovery-product").count(), 1);
    const historyLength = await page.evaluate(() => history.length);
    await nav().getByRole("link", { name: "Ontdekken", exact: true }).click();
    assert.equal(await page.evaluate(() => history.length), historyLength);
    const skip = page.getByRole("link", {
      name: "Ga naar inhoud",
      exact: true,
    });
    await skip.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page
        .locator("#buyer-main")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await shot("discovery");
    const productLink = page.getByRole("link", {
      name: "Bekijk product en aanbiedingen",
      exact: true,
    });
    await productLink.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("group", { name: "Voorbeeldwinkels", exact: true })
      .waitFor();
    await page.locator('input[value="demo-offer-alternative"]').waitFor();
    assert.equal(new URL(page.url()).pathname, "/product/prd_001");
    assert.equal(
      await page.locator("h1").evaluate((el) => el === document.activeElement),
      true,
    );
    const offer = page.locator('input[value="demo-offer-alternative"]');
    await offer.focus();
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () =>
        document.querySelector('input[value="demo-offer-alternative"]')
          ?.checked === true,
    );
    assert.equal(await offer.isChecked(), true);
    assert.equal(
      new URL(page.url()).searchParams.get("offer"),
      "demo-offer-alternative",
    );
    await shot("detail");
    await page
      .getByRole("button", { name: "Voeg gekozen aanbod toe", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Bekijk mandje", exact: true })
      .click();
    await page
      .getByLabel("Aantal · Voorbeeldwinkel B", { exact: true })
      .waitFor();
    assert.equal(await page.locator("#qty-demo-offer-alternative").count(), 1);
    assert.equal(
      await page
        .getByLabel("Aantal · Voorbeeldwinkel A", { exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Betalen niet beschikbaar", exact: true })
        .isDisabled(),
      true,
    );
    await shot("cart");
    const other = await browser.newPage();
    await other.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === "127.0.0.1" && u.port === "4180")
        return route.continue();
      external.push(u.origin);
      return route.abort();
    });
    await other.goto("http://127.0.0.1:4180/cart");
    await other
      .getByRole("link", { name: "Mandje (0)", exact: true })
      .waitFor();
    assert.equal(
      await other
        .getByRole("button", { name: "Bewaar demo-aanvraag", exact: true })
        .isDisabled(),
      true,
    );
    await other.close();
    assert.equal(
      await page.getByRole("link", { name: "Mandje (1)", exact: true }).count(),
      1,
    );
    await page.goBack();
    await offer.waitFor();
    assert.equal(await offer.isChecked(), true);
    await page.goBack();
    await page.getByTestId("discovery-product").first().waitFor();
    assert.equal(
      await page.getByLabel("Zoek producten", { exact: true }).inputValue(),
      "eettafel",
    );
    assert.equal(
      await page.getByLabel("Categorie", { exact: true }).inputValue(),
      "Wonen",
    );
    assert.equal(
      await page.getByLabel("Sorteer", { exact: true }).inputValue(),
      "price",
    );
    await page.goForward();
    await offer.waitFor();
    assert.equal(await offer.isChecked(), true);
    await page.reload();
    await offer.waitFor();
    assert.equal(await offer.isChecked(), true);
    await nav()
      .getByRole("link", { name: "Mandje (0)", exact: true })
      .waitFor();
    // The selected offer becomes stale through the existing seller demo adapter.
    await page.locator('input[value="demo-offer-1"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('input[value="demo-offer-1"]')?.checked === true,
    );
    await page
      .getByRole("button", { name: "Voeg gekozen aanbod toe", exact: true })
      .click();
    await page
      .getByRole("link", {
        name: "Verkoper en beheer · demowerkbank",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Verkoper", exact: true }).click();
    await page
      .getByLabel("Voorbeeldprijs in euro", { exact: true })
      .first()
      .fill("43.00");
    await page
      .getByRole("button", { name: "Bewaar concept", exact: true })
      .first()
      .click();
    await page.goBack();
    await page
      .getByText("De gekozen aanbieding is niet beschikbaar. Kies opnieuw.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Voeg gekozen aanbod toe", exact: true })
        .isDisabled(),
      true,
    );
    await nav().getByRole("link", { name: "Mandje (1)", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Bewaar demo-aanvraag", exact: true })
        .isDisabled(),
      true,
    );
    await shot("stale-cart");
    await page
      .getByRole("button", {
        name: "Verwijder · Voorbeeldwinkel A",
        exact: true,
      })
      .click();
    assert.equal(await page.getByRole("alert").count(), 0);
    await nav().getByRole("link", { name: "Ontdekken", exact: true }).click();
    await page
      .getByLabel("Zoek producten", { exact: true })
      .fill("nonexistent fixture");
    await page
      .getByText(
        "Geen producten gevonden. Pas je zoekopdracht of filters aan.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByRole("button", { name: "Wis filters", exact: true })
      .click();
    await page.getByTestId("discovery-product").first().waitFor();
    assert.equal(new URL(page.url()).searchParams.get("country"), "BE");
    // Direct entry uses the same real Vite SPA fallback; no manually mounted product page.
    await page.goto(
      "http://127.0.0.1:4180/product/prd_001?country=NL&offer=demo-offer-alternative",
    );
    await offer.waitFor();
    assert.equal(await offer.isChecked(), true);
    assert.equal(await page.locator("html").getAttribute("lang"), "nl-NL");
    await page
      .getByRole("button", { name: "Voeg gekozen aanbod toe", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Bekijk mandje", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bewaar demo-aanvraag", exact: true })
      .click();
    assert.equal(new URL(page.url()).pathname, "/requests");
    assert.equal(await page.getByTestId("order").count(), 1);
    assert.match(
      await page.getByTestId("order").innerText(),
      /Voorbeeldwinkel B/,
    );
    await nav().getByRole("link", { name: "Mandje (0)", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Bewaar demo-aanvraag", exact: true })
        .isDisabled(),
      true,
    );
    await page.goto("http://127.0.0.1:4180/product/prd_001?offer=demo-offer-2");
    await page
      .getByText("De gekozen aanbieding is niet beschikbaar. Kies opnieuw.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Voeg gekozen aanbod toe", exact: true })
        .isDisabled(),
      true,
    );
    await page.goto("http://127.0.0.1:4180/product/unknown");
    await page
      .getByText("Dit voorbeeldproduct is niet gevonden.", { exact: false })
      .waitFor();
    await shot("unknown");
    const missing = await page.goto("http://127.0.0.1:4180/unknown-route");
    assert.equal(missing.status(), 404);
    assert.equal((await missing.text()).trim(), "Not found");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.deepEqual(hydrationErrors, []);
    results.push({
      width,
      status: "PASS",
      pageErrors: errors,
      externalRequests: external,
      hydrationErrors,
    });
    await page.close();
  }
} catch (error) {
  results.push({ status: "FAIL", error: error.message });
  throw error;
} finally {
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        scope:
          "original TanStack Start application, SSR hydration and real route navigation; synthetic commerce state, no native WMS/accounting/payment",
        results,
      },
      null,
      2,
    ),
  );
  await browser.close();
  server.kill("SIGTERM");
  await writeFile(`${out}/server.log`, serverLog);
}
