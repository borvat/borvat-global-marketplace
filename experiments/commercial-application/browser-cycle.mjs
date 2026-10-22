// Synthetic workbench only. Supply an installed Playwright module and a local browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)));
const out = resolve(process.env.BROWSER_EVIDENCE_DIR);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const results = [];
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' && url.port === '4178') return route.continue();
      external.push(url.origin); return route.abort();
    });
    const button = name => page.getByRole('button', { name, exact: true });
    const layout = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: horizontal overflow at ${width}`);
      await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: true });
    };
    await page.goto('http://127.0.0.1:4178/');
    await page.getByTestId('product').first().waitFor();
    await layout('catalog');
    await page.getByLabel('Zoek producten', { exact: true }).fill('no-synthetic-match');
    await page.getByText('Geen producten gevonden.', { exact: false }).waitFor();
    assert.equal(await page.getByTestId('product').count(), 0);
    await page.getByLabel('Zoek producten', { exact: true }).fill('');
    await page.getByLabel('Categorie', { exact: true }).selectOption('Tuin');
    assert.equal(await page.getByTestId('product').count(), 3);
    await page.getByLabel('Categorie', { exact: true }).selectOption('Alles');
    await page.getByLabel('Sorteer', { exact: true }).selectOption('price');
    assert.match(await page.getByTestId('product').first().innerText(), /plantenpot/);
    await button('Voeg toe · Voorbeeldwinkel A').click();
    await button('Voeg toe · Voorbeeldwinkel B').click();
    await button('Mandje (2)').click();
    await page.getByLabel('Aantal · Voorbeeldwinkel A', { exact: true }).fill('2');
    await button('Mandje (3)').waitFor();
    assert.equal(await button('Betalen niet beschikbaar').isDisabled(), true);
    await layout('cart');
    await button('Bewaar demo-aanvraag').click();
    assert.equal(await page.getByTestId('order').count(), 1);
    assert.match(await page.getByTestId('order').innerText(), /2 ×/);
    await button('Verkoper').click();
    await button('Markeer demo als voorbereid').click();
    await page.getByLabel('Voorbeeldwinkel (geen accountwissel)', { exact: true }).selectOption('demo-b');
    await button('Markeer demo als voorbereid').click();
    await button('Koper').click();
    assert.match(await page.getByTestId('order').innerText(), /Demo voorbereid/);
    await layout('prepared-request');
    await button('Verkoper').click();
    await page.getByLabel('Voorbeeldwinkel (geen accountwissel)', { exact: true }).selectOption('demo-a');
    const price = page.getByLabel('Voorbeeldprijs in euro', { exact: true }).first();
    await price.fill('not-a-price');
    await button('Bewaar concept').first().click();
    await page.getByRole('alert').waitFor();
    await price.fill('42.50');
    await button('Bewaar concept').first().click();
    await button('Vraag beoordeling').first().click();
    await layout('seller');
    await button('Beheer').click();
    await page.getByRole('region', { name: 'Aanbodbeoordeling' }).locator('div.rounded-xl').filter({ hasText: '42,50' }).getByRole('button', { name: 'Publiceer in demo', exact: true }).click();
    assert.equal(await button('Publiceer in demo').count(), 1); // Original review fixture remains.
    await layout('admin');
    await button('Koper').click();
    assert.doesNotMatch(await page.getByTestId('order').innerText(), /42,50/);
    await button('Producten').click();
    await page.getByRole('complementary').getByText(/42,50/).waitFor();
    await button('Reset demo').click();
    await button('Aanvragen').click();
    assert.equal(await page.getByTestId('order').count(), 0);
    await page.reload();
    await button('Mandje (0)').waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    results.push({ width, status: 'PASS', pageErrors: errors, externalRequests: external });
    await page.close();
  }
} catch (error) {
  results.push({ status: 'FAIL', error: error.message });
  throw error;
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ browser: browser.version(), scope: 'synthetic commercial preview; not full app or native integration', results }, null, 2));
  await browser.close();
}
