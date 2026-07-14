import { SearchAdapter } from './SearchAdapter.js';

const SEARCH_URL = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json&srlimit=5';
const SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/{title}';

export class WikipediaAdapter extends SearchAdapter {
  constructor(userAgent = 'MemTraceSimulith/1.0') {
    super();
    this.userAgent = userAgent;
  }

  async search(query, maxResults = 3) {
    if (!query || !query.trim()) {
      return { results: [], raw: '' };
    }

    const encoded = encodeURIComponent(query.trim());

    const searchResp = await fetch(SEARCH_URL.replace('{query}', encoded), {
      headers: { 'User-Agent': this.userAgent }
    });

    if (!searchResp.ok) {
      console.warn(`[WikipediaAdapter] Search API returned ${searchResp.status}`);
      return { results: [], raw: '' };
    }

    const searchJson = await searchResp.json();
    const pages = searchJson?.query?.search || [];

    if (pages.length === 0) {
      return { results: [], raw: '' };
    }

    const results = [];
    for (const page of pages.slice(0, maxResults)) {
      try {
        const summaryResp = await fetch(SUMMARY_URL.replace('{title}', encodeURIComponent(page.title)), {
          headers: { 'User-Agent': this.userAgent }
        });

        if (!summaryResp.ok) continue;

        const summaryJson = await summaryResp.json();
        results.push({
          title: summaryJson.title || page.title,
          excerpt: summaryJson.extract || '',
          url: summaryJson.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          relevance: 1 - (page.index / pages.length)
        });
      } catch (err) {
        console.warn(`[WikipediaAdapter] Failed to fetch summary for "${page.title}":`, err.message);
      }
    }

    const raw = results.map(r => `${r.title}: ${r.excerpt}`).join('\n\n');

    return { results, raw };
  }
}
