// Optional browser rendering. Gives the "what a human sees" column a real
// screenshot and lets us measure exactly what JavaScript adds.
import { BROWSER_UA } from './fetcher.js';

import fs from 'node:fs';

// Playwright normally manages its own browser build. When the host already has
// one (CI images, corporate laptops), point at it instead of downloading.
function findChromium() {
  if (process.env.AVT_CHROMIUM_PATH) return process.env.AVT_CHROMIUM_PATH;
  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  try {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (root && fs.existsSync(root)) {
      for (const dir of fs.readdirSync(root)) {
        if (!dir.startsWith('chromium-')) continue;
        const bin = `${root}/${dir}/chrome-linux/chrome`;
        if (fs.existsSync(bin)) candidates.unshift(bin);
      }
    }
  } catch { /* fall through to the fixed list */ }
  return candidates.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || null;
}

let chromiumPromise = null;
async function getChromium() {
  if (!chromiumPromise) {
    chromiumPromise = import('playwright')
      .then((m) => m.chromium)
      .catch(() => null);
  }
  return chromiumPromise;
}

export async function renderHuman(url, { timeout = 30000, screenshot = true } = {}) {
  const chromium = await getChromium();
  if (!chromium) {
    return { available: false, reason: 'Playwright is not installed. Run: npm install playwright && npx playwright install chromium' };
  }
  let browser;
  try {
    const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
    try {
      browser = await chromium.launch(launchOpts);
    } catch (launchErr) {
      const executablePath = findChromium();
      if (!executablePath) throw launchErr;
      browser = await chromium.launch({ ...launchOpts, executablePath });
    }
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      viewport: { width: 1280, height: 900 },
      locale: 'en-DE',
    });
    const page = await context.newPage();
    const started = Date.now();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch { /* good enough */ }
    // Best-effort cookie-banner dismissal so the screenshot shows the shop.
    for (const sel of ['#onetrust-accept-btn-handler', 'button#accept', '[aria-label*="Accept" i]', 'button:has-text("Accept all")', 'button:has-text("Alle akzeptieren")', 'button:has-text("Souhlasím")', 'button:has-text("Akceptuj")']) {
      try { const el = await page.$(sel); if (el) { await el.click({ timeout: 1200 }); break; } } catch { /* ignore */ }
    }
    const html = await page.content();
    const metrics = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.replace(/\s+/g, ' ').trim() : '';
      const imgs = [...document.images].filter((i) => i.width > 60 && i.height > 60);
      return {
        text,
        textLength: text.length,
        wordCount: text ? text.split(/\s+/).length : 0,
        imageCount: imgs.length,
        buttonCount: document.querySelectorAll('button,[role=button],input[type=submit]').length,
        linkCount: document.querySelectorAll('a[href]').length,
        title: document.title,
        h1: document.querySelector('h1')?.innerText?.trim() || null,
      };
    });
    let shot = null;
    if (screenshot) {
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 62, fullPage: false });
        shot = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch { /* screenshot is a nice-to-have */ }
    }
    await browser.close();
    return {
      available: true,
      status: response?.status() || 0,
      ms: Date.now() - started,
      html,
      screenshot: shot,
      ...metrics,
    };
  } catch (err) {
    try { await browser?.close(); } catch { /* already gone */ }
    return { available: false, reason: `Browser render failed: ${err.message}` };
  }
}

// What does JavaScript add that a raw fetch never sees?
export function computeDelta(rawSignals, human, product) {
  if (!human?.available) return null;
  const rawWords = rawSignals.wordCount || 0;
  const renderedWords = human.wordCount || 0;
  const textRatio = renderedWords ? Math.min(1, rawWords / renderedWords) : 1;

  const rawText = (rawSignals.textSample || '').toLowerCase();
  const renderedText = (human.text || '').toLowerCase();

  const missingHighlights = [];
  const priceInRendered = /(\d[\d .,]*\s?(€|eur|kč|czk|zł|pln))|((€|eur|kč|czk|zł|pln)\s?\d)/i.test(renderedText);
  const priceInRaw = Boolean(product.price) || rawSignals.prices.length > 0;
  if (priceInRendered && !priceInRaw) missingHighlights.push('The price only exists after JavaScript runs.');
  if (human.imageCount > rawSignals.imageCount + 2) missingHighlights.push(`${human.imageCount - rawSignals.imageCount} images are injected client-side.`);
  if (renderedWords - rawWords > 300) missingHighlights.push(`${renderedWords - rawWords} words of copy are added by the bundle.`);

  const stockWords = ['in stock', 'auf lager', 'skladem', 'dostępny', 'na sklade', 'na zalogi', 'διαθέσιμο', 'sold out', 'ausverkauft', 'vyprodáno'];
  const stockInRendered = stockWords.some((w) => renderedText.includes(w));
  const stockInRaw = stockWords.some((w) => rawText.includes(w)) || Boolean(product.availability);
  if (stockInRendered && !stockInRaw) missingHighlights.push('Stock status is client-side only.');

  return {
    textRatio,
    rawWords,
    renderedWords,
    rawImages: rawSignals.imageCount,
    renderedImages: human.imageCount,
    priceJsOnly: priceInRendered && !priceInRaw,
    availabilityJsOnly: stockInRendered && !stockInRaw,
    missingHighlights,
  };
}
