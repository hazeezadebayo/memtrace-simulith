import { Tool } from './Tool.js';

const SEARCH_URL = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json&srlimit=3';
const SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/{title}';

export class WikipediaTool extends Tool {
  name = 'wikipedia';
  description = 'Search Wikipedia for factual information on a given topic. Returns article summaries with source URLs.';
  parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The topic or question to look up on Wikipedia' }
    },
    required: ['query']
  };

  constructor(userAgent = 'MemTraceSimulith/1.0') {
    super();
    this.userAgent = userAgent;
  }

  async execute(args) {
    const { query } = args;
    if (!query || !query.trim()) {
      return { title: null, excerpt: '', url: null, error: 'No query provided' };
    }

    const encoded = encodeURIComponent(query.trim());
    const searchResp = await fetch(SEARCH_URL.replace('{query}', encoded), {
      headers: { 'User-Agent': this.userAgent }
    });

    if (!searchResp.ok) {
      return { title: null, excerpt: '', url: null, error: `Wikipedia search returned ${searchResp.status}` };
    }

    const searchJson = await searchResp.json();
    const pages = searchJson?.query?.search || [];
    if (pages.length === 0) {
      return { title: null, excerpt: '', url: null, error: 'No results found' };
    }

    try {
      const summaryResp = await fetch(SUMMARY_URL.replace('{title}', encodeURIComponent(pages[0].title)), {
        headers: { 'User-Agent': this.userAgent }
      });

      if (!summaryResp.ok) {
        return { title: pages[0].title, excerpt: '', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pages[0].title)}`, error: null };
      }

      const summaryJson = await summaryResp.json();
      return {
        title: summaryJson.title || pages[0].title,
        excerpt: (summaryJson.extract || '').slice(0, 1000),
        url: summaryJson.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(pages[0].title)}`,
        error: null
      };
    } catch (err) {
      return { title: pages[0].title, excerpt: '', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pages[0].title)}`, error: err.message };
    }
  }
}
