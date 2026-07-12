import { chromium } from 'playwright';
import crypto from 'node:crypto';
import dns from 'node:dns';

function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    parts[0] === 0
  );
}

async function progressiveScroll(page) {
  await page.evaluate(() => new Promise(resolve => {
    let y = 0;
    const step = 500;
    const interval = setInterval(() => {
      window.scrollBy(0, step);
      y += step;
      if (y >= document.body.scrollHeight) {
        clearInterval(interval);
        resolve();
      }
    }, 200);
  }));
}

async function waitForDomStability(page, maxChecks = 10, delayMs = 700) {
  let lastLen = 0;
  let stableRounds = 0;

  for (let i = 0; i < maxChecks; i++) {
    const textLen = await page.evaluate(() => document.body.innerText.length);
    if (Math.abs(textLen - lastLen) < 100) {
      stableRounds++;
      if (stableRounds >= 3) return;
    } else {
      stableRounds = 0;
    }
    lastLen = textLen;
    await new Promise(r => setTimeout(r, delayMs));
  }
}

async function extractLikeCtrlACopy(page) {
  return await page.evaluate(() => {
    const selection = window.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(document.body);
    selection.addRange(range);
    return selection.toString();
  });
}

export async function crawlWebsite(startUrl, maxPages = 20) {
  const visited = new Set();
  const contentHashes = new Set();
  const queue = [startUrl];
  const pages = [];

  let domain;
  try {
    domain = new URL(startUrl).hostname;
  } catch {
    return [];
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Block heavy resources
  await context.route('**/*', (route, request) => {
    if (['image', 'media', 'font'].includes(request.resourceType())) {
      route.abort();
    } else {
      route.continue();
    }
  });

  const page = await context.newPage();

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }

    if (parsed.hostname !== domain) continue;

    let cleanUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);

    if (cleanUrl.includes('medium.com') || cleanUrl.includes('http%3A') || cleanUrl.includes('https%3A')) {
      console.log(`[Crawler] Skipping external/proxy URL: ${cleanUrl}`);
      visited.add(cleanUrl);
      continue;
    }

    if (visited.has(cleanUrl)) continue;
    visited.add(cleanUrl);

    try {
      const lookup = await dns.promises.lookup(parsed.hostname);
      if (isPrivateIP(lookup.address)) {
        console.log(`[Crawler] Skipping private/internal IP: ${cleanUrl}`);
        continue;
      }
    } catch (err) {
      console.log(`[Crawler] DNS lookup failed for ${cleanUrl}`);
      continue;
    }

    try {
      console.log(`[Crawler] Crawling: ${cleanUrl}`);
      await page.goto(cleanUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1000);

      await progressiveScroll(page);
      await waitForDomStability(page);

      const copiedText = await extractLikeCtrlACopy(page);
      const hash = crypto.createHash('md5').update(copiedText).digest('hex');

      if (contentHashes.has(hash)) {
        console.log(`[Crawler] Skipping duplicate content: ${cleanUrl}`);
        continue;
      }
      contentHashes.add(hash);

      const links = await page.evaluate(() => {
        const linkNodes = Array.from(document.querySelectorAll('a[href]'));
        return linkNodes.map(a => ({
          text: a.innerText.trim(),
          href: a.href,
          label: a.getAttribute('aria-label') || a.getAttribute('title') || ''
        }));
      });

      let linksText = "\n\nLinks Found:\n";
      const uniqueLinks = new Set();
      const internalLinks = [];

      for (const link of links) {
        const href = link.href;
        let displayText = link.text || link.label;

        if (!displayText) {
          try {
            const parsedHref = new URL(href);
            const parts = parsedHref.hostname.split('.');
            if (parts.length >= 2) {
              const name = (parts[parts.length - 2] === 'www' || parts[parts.length - 2] === 'web') && parts.length > 2
                ? parts[parts.length - 3] 
                : parts[parts.length - 2];
              displayText = name.charAt(0).toUpperCase() + name.slice(1);
            } else {
              displayText = parsedHref.hostname.charAt(0).toUpperCase() + parsedHref.hostname.slice(1);
            }
          } catch {
            // ignore
          }
        }

        if (displayText) {
          const linkStr = `[${displayText}](${href})`;
          if (!uniqueLinks.has(linkStr)) {
            linksText += `- ${linkStr}\n`;
            uniqueLinks.add(linkStr);
          }
        }
        internalLinks.push(href);
      }

      if (copiedText.trim()) {
        pages.push(
          `URL: ${cleanUrl}\n` +
          `CONTENT (Ctrl+A -> Ctrl+C):\n${copiedText}\n${linksText}`
        );
      }

      for (const href of internalLinks) {
        try {
          const p2 = new URL(href);
          if (p2.hostname === domain) {
            let nextUrl = `${p2.protocol}//${p2.host}${p2.pathname}`;
            if (nextUrl.endsWith('/')) nextUrl = nextUrl.slice(0, -1);
            if (!visited.has(nextUrl)) {
              queue.push(nextUrl);
            }
          }
        } catch {
          // invalid url
        }
      }
    } catch (err) {
      console.log(`[Crawler] Failed ${cleanUrl}: ${err.message}`);
    }
  }

  await browser.close();
  return pages;
}
