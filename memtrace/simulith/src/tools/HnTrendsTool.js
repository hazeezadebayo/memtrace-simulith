import { Tool } from './Tool.js';

const SEARCH_URL = 'https://hn.algolia.com/api/v1/search?query={query}&hitsPerPage=3&tags=story';

export class HnTrendsTool extends Tool {
  name = 'hn_trends';
  description = 'Search Hacker News for trending stories and discussions on a given topic. Returns top matching stories with points and URLs.';
  parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Topic to search for on Hacker News (e.g. AI, Rust, startups)' }
    },
    required: ['query']
  };

  async execute(args) {
    const { query } = args;
    if (!query || !query.trim()) {
      return { stories: [], error: 'No query provided' };
    }

    try {
      const resp = await fetch(SEARCH_URL.replace('{query}', encodeURIComponent(query.trim())), {
        headers: { 'User-Agent': 'MemTraceSimulith/1.0' }
      });

      if (!resp.ok) {
        return { stories: [], error: `HN Algolia returned ${resp.status}` };
      }

      const data = await resp.json();
      const hits = data.hits || [];

      const stories = hits.slice(0, 3).map(h => ({
        title: h.title || '',
        points: h.points || 0,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        author: h.author || '',
        createdAt: h.created_at || ''
      }));

      return { stories, error: null };
    } catch (err) {
      return { stories: [], error: err.message };
    }
  }
}
