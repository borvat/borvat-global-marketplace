/** Independent current-shopping-flow browser acceptance. Synthetic data/providers only. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const out = resolve(process.env.BROWSER_EVIDENCE_DIR || '/tmp/borvat-browser-evidence');
await mkdir(out,{recursive:true});
const root = fileURLToPath(new URL('../../',import.meta.url));
const app = root + 'apps/marketplace';
const server = spawn(process.execPath,['.output/server/index.mjs'],{cwd:app,
  env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
    NITRO_HOST:'127.0.0.1',NITRO_PORT:'4180',
    NODE_OPTIONS:'--import='+root+'scripts/foundation/no-external-network.mjs'},
  stdio:['ignore','pipe','pipe']});
let serverLog='', browser;
server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
const origin='http://127.0.0.1:4180';
const results=[];
let phase='server-readiness';
try {
  let ready=false;
  for(let i=0;i<100;i++) {
    if(server.exitCode!==null) throw Error('SSR server exited');
    try { const r=await fetch(origin+'/discover?country=BE');
      if(r.status===200) {const html=await r.text();
        assert.match(html,/lang="nl-BE"/);assert.match(html,/TESTOMGEVING/);
        assert.match(html,/data-testid="catalog-loading"/);
        await writeFile(out+'/ssr-discover.html',html);ready=true;break;}
    } catch { /* bounded loopback readiness probe */ }
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(ready,true,'current isolated build must serve SSR');
  const protocol=[];
  for(const [method,path,status] of [
    ['HEAD','/discover',200],['GET','/afrekenen',200],['GET','/bestelling/TEST-NONE',200],
    ['GET','/account',404],['GET','/.mcp/list-tools',404],['GET','/checkout',404],
    ['POST','/lovable/email/auth/webhook',405],['POST','/discover',405],['POST','/afrekenen',405],
  ]) { const r=await fetch(origin+path,{method});assert.equal(r.status,status);protocol.push({method,path,status}); }
  results.push({case:'actual HTTP SSR and isolation',status:'PASS',protocol});
  phase='browser-launch';
  if(!process.env.PLAYWRIGHT_MODULE) throw Error('PLAYWRIGHT_MODULE must point to an installed Playwright module');
  const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
    args:['--disable-dev-shm-usage'],env:{...process.env}});
  phase='browser-assertions';
  const noJs=await browser.newContext({javaScriptEnabled:false});
  const staticPage=await noJs.newPage();
  const staticExternal=[];
  await staticPage.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(staticExternal.push(route.request().url()),route.abort()));
  await staticPage.goto(origin+'/discover?country=BE');
  await staticPage.getByTestId('catalog-loading').waitFor();
  assert.equal(await staticPage.getByRole('main').count(),1);
  assert.equal(await staticPage.locator('html').getAttribute('lang'),'nl-BE');
  assert.deepEqual(staticExternal,[]);
  await staticPage.screenshot({path:out+'/ssr-no-javascript.png',fullPage:true});await noJs.close();
  results.push({case:'SSR without JavaScript',status:'PASS'});

  for(const width of [1440,390,320]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage();
    const errors=[],external=[],failedRequests=[],hydration=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>failedRequests.push({url:r.url(),failure:r.failure()?.errorText}));
    page.on('console',m=>{if(/hydration|hydrating|Minified React error/i.test(m.text()))hydration.push(m.text());});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external.push(route.request().url()),route.abort()));
    const shot=async name=>{
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}/${name}: horizontal overflow`);
      assert.equal(await page.getByRole('main').count(),1);
      await page.screenshot({path:`${out}/${width}-${name}.png`,fullPage:true});
    };
    await page.goto(origin+'/discover?country=BE');
    await page.getByTestId('discovery-product').first().waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'nl-BE');
    await page.getByRole('link',{name:'Ga naar inhoud',exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#buyer-main').evaluate(el=>el===document.activeElement),true);
    await page.getByTestId('search-input').fill('eettafel');await page.getByTestId('search-submit').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-testid="discovery-product"]').length===1);
    await shot('search');
    await page.getByTestId('product-link-prd_001').click();
    await page.getByTestId('product-title').waitFor();
    assert.equal(new URL(page.url()).pathname,'/product/prd_001');
    assert.equal(await page.locator('h1').evaluate(el=>el===document.activeElement),true);
    await page.locator('input[value="demo-offer-1"]').check();
    await page.getByTestId('add-to-cart-button').click();
    await page.locator('input[value="demo-offer-alternative"]').check();
    await shot('product');
    await page.getByTestId('add-to-cart-button').click();await page.getByTestId('nav-cart').click();
    await page.getByTestId('cart-line-demo-offer-alternative').waitFor();
    await page.reload();await page.getByTestId('cart-line-demo-offer-alternative').waitFor();
    await shot('cart-restored');
    await page.getByTestId('cart-checkout-button').click();
    await page.getByTestId('place-order-button').click();
    await page.getByTestId('checkout-firstName-error').waitFor();
    await shot('checkout-validation');
    for(const [key,value] of Object.entries({firstName:'Test',lastName:'Koper',email:'buyer@example.test',phone:'0612345678',
      street:'Teststraat',houseNumber:'12',postalCode:'1000',city:'Brussel'}))
      await page.getByTestId('checkout-'+key).fill(value);
    await page.getByTestId('checkout-acceptTest').check();await page.getByTestId('place-order-button').click();
    await page.getByTestId('order-confirmation').waitFor();
    const orderId=await page.getByTestId('order-id').innerText();assert.match(orderId,/^TEST-/);
    await shot('confirmation');await page.reload();await page.getByTestId('order-confirmation').waitFor();
    assert.equal(await page.getByTestId('order-id').innerText(),orderId);
    await page.getByTestId('nav-orders').click();assert.equal(await page.locator('[data-testid^="order-row-"]').count(),1);
    // A separate browser context must not inherit another context's local orders.
    const foreign=await browser.newContext();const foreignPage=await foreign.newPage();
    await foreign.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await foreignPage.goto(origin+'/requests');await foreignPage.getByTestId('orders-empty').waitFor();await foreign.close();
    // This is a labelled role-switch workbench, not an authenticated seller boundary.
    await page.goto(origin+'/workbench');await page.getByRole('button',{name:'Verkoper',exact:true}).click();
    await page.getByLabel('Voorbeeldwinkel (geen accountwissel)',{exact:true}).selectOption('demo-b');
    await page.getByRole('heading',{name:'Aanvragen voor deze winkel',exact:true}).waitFor();
    assert.equal(await page.getByTestId('order').count(),1);
    assert.doesNotMatch(await page.getByTestId('order').innerText(),/Voorbeeldwinkel A/);
    await shot('seller');
    await page.getByRole('button',{name:'Beheer',exact:true}).click();await shot('admin');
    await page.goto(origin+'/discover?testfout=catalogus');await page.getByTestId('catalog-error').waitFor();
    await page.getByRole('button',{name:'Opnieuw proberen',exact:true}).click();
    await page.getByTestId('discovery-product').first().waitFor();
    await page.getByTestId('search-input').fill('no-such-product');await page.getByTestId('search-submit').click();
    await page.getByTestId('no-results').waitFor();await shot('empty-search');
    await page.goto(origin+'/bestelling/TEST-NONE');await page.getByTestId('order-not-found').waitFor();
    assert.deepEqual(errors,[]);assert.deepEqual(hydration,[]);assert.deepEqual(external,[]);assert.deepEqual(failedRequests,[]);
    results.push({width,status:'PASS',pageErrors:errors,hydrationErrors:hydration,externalRequests:external,failedRequests});
    await context.close();
  }
} catch(error) {
  const blocked=phase==='browser-launch';
  results.push({status:blocked?'BLOCKED':'FAIL',phase,error:error.message});process.exitCode=blocked?2:1;
} finally {
  if(browser) await browser.close();server.kill('SIGTERM');
  await writeFile(out+'/results.json',JSON.stringify({scope:'original application, synthetic local checkout; no native WMS/Accounting/payment/carrier',results},null,2));
  await writeFile(out+'/server.log',serverLog);
}
