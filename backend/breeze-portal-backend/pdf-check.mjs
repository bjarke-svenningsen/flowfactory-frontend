// Print/PDF-verifikation (midlertidigt): genererer PDF af tilbud #2 og maaler print-padding
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:4000';
const EMAIL = 'bjarke.sv@gmail.com';
const PASS = 'Olineersej123';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2' });
await page.type('#email', EMAIL);
await page.type('#password', PASS);
await page.click('#loginForm button[type="submit"], #loginForm button');
await page.waitForFunction(() => location.pathname.includes('dashboard'), { timeout: 15000 });
await page.waitForNetworkIdle({ idleTime: 500 });
await page.goto(BASE + '/dashboard.html#quotes', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => document.querySelectorAll('.btn').length > 0, { timeout: 15000 });
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => window.viewQuote(2));
await page.waitForFunction(() => !!document.querySelector('.quote-sheet'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));

// Skærmmåling
const screen = await page.evaluate(() => {
  const s = document.querySelector('.quote-sheet').getBoundingClientRect();
  return { sheetWidth: Math.round(s.width), padding: getComputedStyle(document.querySelector('.quote-sheet')).padding };
});
console.log('SCREEN:', JSON.stringify(screen));

// Print-emulering: padding/kant/skygge skal være nulstillet
await page.emulateMediaType('print');
const print = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.quote-sheet'));
  const toolbar = getComputedStyle(document.querySelector('.preview-actions'));
  return { padding: cs.padding, border: cs.borderStyle, shadow: cs.boxShadow, toolbarDisplay: toolbar.display };
});
console.log('PRINT:', JSON.stringify(print));
await page.pdf({ path: 'tilbud-print-check.pdf', format: 'A4', printBackground: true });
console.log('PDF skrevet: tilbud-print-check.pdf');
await browser.close();
