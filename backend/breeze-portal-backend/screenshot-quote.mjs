// Midlertidigt screenshot-script (slettes bagefter)
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:4000';
const EMAIL = 'bjarke.sv@gmail.com';
const PASS = 'Olineersej123';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERROR:', m.text()); });
page.on('pageerror', e => console.log('PAGE-ERROR:', e.message));
page.on('response', async r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });

async function login() {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2' });
  await page.type('#email', EMAIL);
  await page.type('#password', PASS);
  await page.click('#loginForm button[type="submit"], #loginForm button');
  await page.waitForFunction(() => location.pathname.includes('dashboard'), { timeout: 15000 });
  await page.waitForNetworkIdle({ idleTime: 500 });
}

async function shootQuote(width, height, name) {
  await page.setViewport({ width, height });
  await page.goto(BASE + '/dashboard.html#quotes', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.querySelectorAll('.btn').length > 0, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  const dbg = await page.evaluate(() => ({
    hasViewQuote: typeof window.viewQuote,
    hasViewInvoice: typeof window.viewInvoice,
    listHtml: (document.getElementById('quotesContainer') || document.getElementById('quotesListView') || document.body).innerHTML.slice(0, 300)
  }));
  console.log(name, JSON.stringify(dbg).slice(0, 400));
  // Aabn tilbud #2 direkte (visningen findes uanset aktiv fane)
  await page.evaluate(() => window.viewQuote(2));
  await page.waitForFunction(() => !!document.querySelector('.quote-sheet'), { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));
  // Layoutchecks
  const checks = await page.evaluate(() => {
    const sheet = document.querySelector('.quote-sheet');
    const toolbar = document.querySelector('.preview-actions');
    const s = sheet.getBoundingClientRect();
    const t = toolbar.getBoundingClientRect();
    const doc = document.documentElement;
    return {
      sheetLeft: Math.round(s.left), toolbarLeft: Math.round(t.left),
      sheetRight: Math.round(s.right), toolbarRight: Math.round(t.right),
      sheetWidth: Math.round(s.width), toolbarWidth: Math.round(t.width),
      horizScroll: doc.scrollWidth > doc.clientWidth,
      padding: getComputedStyle(sheet).padding
    };
  });
  console.log(name, JSON.stringify(checks));
  await page.screenshot({ path: 'shot-' + name + '.png', fullPage: false });
}

await login();
await shootQuote(1280, 900, 'tilbud-1280');
await shootQuote(1024, 800, 'tilbud-1024');
await shootQuote(390, 844, 'tilbud-390');

// Fakturavisning
await page.setViewport({ width: 1280, height: 900 });
await page.goto(BASE + '/dashboard.html#quotes', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => viewInvoice(7));
await page.waitForFunction(() => !!document.querySelector('.quote-sheet'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const invChecks = await page.evaluate(() => {
  const sheet = document.querySelector('.quote-sheet');
  const toolbar = document.querySelector('.preview-actions');
  const s = sheet.getBoundingClientRect();
  const t = toolbar.getBoundingClientRect();
  return { sheetLeft: Math.round(s.left), toolbarLeft: Math.round(t.left), sheetRight: Math.round(s.right), toolbarRight: Math.round(t.right), horizScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, padding: getComputedStyle(sheet).padding };
});
console.log('faktura-1280', JSON.stringify(invChecks));
await page.screenshot({ path: 'shot-faktura-1280.png' });

await browser.close();
console.log('DONE');
