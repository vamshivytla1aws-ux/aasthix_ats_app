const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT_DIR = path.join(process.cwd(), 'tmp', 'pdfs', 'ui-captures-detail');
fs.mkdirSync(OUT_DIR, { recursive: true });

const baseUrl = 'http://localhost:3002';
const email = 'vamshi@gmail.com';
const password = 'test12345';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function loginAndGetCookie() {
  const res = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  const setCookie = res.headers.get('set-cookie') || '';
  if (!res.ok || !setCookie) throw new Error(`Login failed: ${res.status} ${text}`);
  const tokenPair = setCookie.split(';')[0];
  const eq = tokenPair.indexOf('=');
  return { name: tokenPair.slice(0, eq), value: tokenPair.slice(eq + 1) };
}

async function apiJson(pathname, cookie) {
  const res = await fetch(baseUrl + pathname, { headers: { Cookie: `${cookie.name}=${cookie.value}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname}: ${res.status} ${text}`);
  return JSON.parse(text);
}

async function authPage(browser, cookie) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1.5 });
  await page.setCookie({ name: cookie.name, value: cookie.value, url: baseUrl, httpOnly: true, sameSite: 'Lax', path: '/' });
  page.setDefaultTimeout(45000);
  return page;
}

async function waitForStable(page, ms = 1800) {
  await new Promise(r => setTimeout(r, ms));
  try { await page.waitForNetworkIdle({ idleTime: 900, timeout: 20000 }); } catch {}
}

async function waitForJobPageReady(page) {
  await page.waitForFunction(() => {
    const text = document.body.innerText || '';
    return text.includes('JD & resume matches') && !text.includes('Loading...');
  }, { timeout: 45000 });
}

async function clickText(page, text) {
  await page.waitForFunction((needle) => {
    const items = Array.from(document.querySelectorAll('button,a,div[role="button"],span'));
    return items.some((el) => ((el.textContent || '').replace(/\s+/g, ' ').trim()).includes(needle));
  }, { timeout: 30000 }, text);
  const clicked = await page.evaluate((needle) => {
    const items = Array.from(document.querySelectorAll('button,a,div[role="button"],span'));
    const el = items.find((node) => ((node.textContent || '').replace(/\s+/g, ' ').trim()).includes(needle));
    if (el && el instanceof HTMLElement) {
      el.click();
      return true;
    }
    return false;
  }, text);
  if (!clicked) throw new Error(`Could not click text: ${text}`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

(async () => {
  const cookie = await loginAndGetCookie();
  const jobs = await apiJson('/api/jobs', cookie);
  const candidates = await apiJson('/api/candidates', cookie);
  const jobId = Number(jobs?.[0]?.id);
  const candidateId = Number(candidates?.[0]?.id);
  fs.writeFileSync(path.join(OUT_DIR, 'ids.json'), JSON.stringify({ jobId, candidateId }, null, 2));

  const browser = await puppeteer.launch({ headless: true, executablePath: edgePath, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await authPage(browser, cookie);
  await page.goto(baseUrl + `/jobs/${jobId}`, { waitUntil: 'domcontentloaded' });
  await waitForJobPageReady(page);
  await waitForStable(page, 1200);
  await screenshot(page, 'job-detail');

  await clickText(page, 'JD & resume matches');
  await page.waitForFunction(() => document.body.innerText.includes('JD & resume match hub') || document.body.innerText.includes('JD & resume match hub'.replace(/&/g,'&')), { timeout: 30000 }).catch(() => null);
  await waitForStable(page, 1800);
  await screenshot(page, 'job-match-hub');

  try {
    await clickText(page, 'Re-score (No AI)');
    await waitForStable(page, 3000);
    await page.waitForFunction(() => document.body.innerText.includes('No-AI re-score completed.') || document.body.innerText.includes('No-AI re-score completed'), { timeout: 180000 }).catch(() => null);
    await waitForStable(page, 1800);
    await screenshot(page, 'job-match-hub-no-ai');
  } catch (e) { fs.writeFileSync(path.join(OUT_DIR, 'no-ai-error.txt'), String(e)); }

  try {
    await clickText(page, 'Hybrid recompute');
    await waitForStable(page, 3000);
    await page.waitForFunction(() => document.body.innerText.includes('Hybrid match complete') || document.body.innerText.includes('Hybrid Top 10') || document.body.innerText.includes('AI #'), { timeout: 240000 }).catch(() => null);
    await waitForStable(page, 2200);
    await screenshot(page, 'job-match-hub-hybrid');
  } catch (e) { fs.writeFileSync(path.join(OUT_DIR, 'hybrid-error.txt'), String(e)); }

  try {
    await clickText(page, 'Debug');
    await waitForStable(page, 1200);
    await screenshot(page, 'job-match-debug-expanded');
  } catch (e) { fs.writeFileSync(path.join(OUT_DIR, 'debug-error.txt'), String(e)); }
  await page.close();

  if (candidateId) {
    const cp = await authPage(browser, cookie);
    await cp.goto(baseUrl + `/candidates/${candidateId}`, { waitUntil: 'domcontentloaded' });
    await waitForStable(cp, 3000);
    await screenshot(cp, 'candidate-detail');
    await cp.close();
  }

  await browser.close();
  console.log(OUT_DIR);
})();
