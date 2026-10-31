// Verifikation af Filer-siden (midlertidigt)
import puppeteer from 'puppeteer';
const BASE = 'http://localhost:4000';
const EMAIL = 'bjarke.sv@gmail.com';
const PASS = 'Olineersej123';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
async function login() {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2' });
  const hasForm = await page.$('#email');
  if (hasForm) {
    await page.type('#email', EMAIL);
    await page.type('#password', PASS);
    await page.click('#loginForm button[type="submit"], #loginForm button');
    await page.waitForFunction(() => location.pathname.includes('dashboard'), { timeout: 15000 });
    await page.waitForNetworkIdle({ idleTime: 500 });
  }
}
for (const [w, h, name] of [[1280, 900, 'filer-1280'], [390, 844, 'filer-390']]) {
  await page.setViewport({ width: w, height: h });
  await login();
  await page.goto(BASE + '/dashboard.html#files', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.querySelectorAll('.btn').length > 0, { timeout: 15000 }).catch(async () => {
    const dbg = await page.evaluate(() => ({ url: location.href, btns: document.querySelectorAll('.btn').length, body: document.body.innerHTML.slice(0, 300) }));
    console.log('DEBUG', JSON.stringify(dbg));
  });
  await new Promise(r => setTimeout(r, 1200));
  const res = await page.evaluate(() => {
    const ex = document.querySelector('.file-explorer');
    const doc = document.documentElement;
    const cs = ex ? getComputedStyle(ex) : null;
    return {
      hasExplorer: !!ex,
      bg: cs ? cs.backgroundColor : null,
      radius: cs ? cs.borderRadius : null,
      border: cs ? cs.borderColor : null,
      horizScroll: doc.scrollWidth > doc.clientWidth
    };
  });
  console.log(name, JSON.stringify(res));
  await page.screenshot({ path: 'shot-' + name + '.png' });
}
await browser.close();
