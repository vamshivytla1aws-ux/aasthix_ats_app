const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT_DIR = path.join(process.cwd(), 'tmp', 'pdfs', 'ui-captures');
fs.mkdirSync(OUT_DIR, { recursive: true });

const baseUrl = 'http://localhost:3002';
const email = 'vamshi@gmail.com';
const password = 'test12345';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const routes = [
  { name: 'dashboard-home', url: '/' },
  { name: 'dashboard-metrics', url: '/dashboard' },
  { name: 'candidates', url: '/candidates' },
  { name: 'jobs', url: '/jobs' },
  { name: 'pipeline', url: '/pipeline' },
  { name: 'interviews', url: '/interviews' },
  { name: 'analytics', url: '/analytics' },
  { name: 'screening', url: '/screening' },
  { name: 'chat', url: '/chat' },
  { name: 'clients', url: '/clients' },
  { name: 'activity-center', url: '/activity-center' },
  { name: 'copilot', url: '/recruiter/copilot' },
  { name: 'workload', url: '/recruiter/workload' },
  { name: 'careers', url: '/careers', public: true },
];

async function loginAndGetCookie() {
  const res = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  const setCookie = res.headers.get('set-cookie') || '';
  if (!res.ok || !setCookie) {
    throw new Error(`Login failed: ${res.status} ${text}`);
  }
  const tokenPair = setCookie.split(';')[0];
  const eq = tokenPair.indexOf('=');
  return {
    status: res.status,
    body: text,
    cookieName: tokenPair.slice(0, eq),
    cookieValue: tokenPair.slice(eq + 1),
  };
}

async function waitForStable(page, ms = 1200) {
  await new Promise((r) => setTimeout(r, ms));
  try { await page.waitForNetworkIdle({ idleTime: 700, timeout: 10000 }); } catch {}
}

async function dismissOverlays(page) {
  const selectors = [
    'button[aria-label="Close"]',
    'button[aria-label="Close apply form"]',
  ];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      try { await el.click(); } catch {}
    }
  }
}

(async () => {
  const auth = await loginAndGetCookie();

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: edgePath,
    defaultViewport: { width: 1440, height: 1200, deviceScaleFactor: 1.5 },
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setCookie({
    name: auth.cookieName,
    value: auth.cookieValue,
    url: baseUrl,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
  });

  await page.goto(baseUrl + '/api/auth/me', { waitUntil: 'domcontentloaded' });
  const me = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(OUT_DIR, 'session.json'), me);

  for (const route of routes) {
    const capture = await browser.newPage();
    await capture.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1.5 });
    if (!route.public) {
      await capture.setCookie({
        name: auth.cookieName,
        value: auth.cookieValue,
        url: baseUrl,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
      });
    }

    await capture.goto(baseUrl + route.url, { waitUntil: 'domcontentloaded' });
    await waitForStable(capture, 1800);
    await dismissOverlays(capture);
    await capture.evaluate(() => {
      document.querySelectorAll('[data-next-badge-root]').forEach((el) => el.remove());
    });

    const filePath = path.join(OUT_DIR, `${route.name}.png`);
    await capture.screenshot({ path: filePath, fullPage: false });

    const meta = await capture.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || null,
      h2: Array.from(document.querySelectorAll('h2')).slice(0, 4).map((n) => n.textContent?.trim()).filter(Boolean),
      textSample: document.body.innerText.slice(0, 800),
      href: location.href,
    }));
    fs.writeFileSync(path.join(OUT_DIR, `${route.name}.json`), JSON.stringify(meta, null, 2));
    await capture.close();
  }

  await browser.close();
  console.log(OUT_DIR);
})();
