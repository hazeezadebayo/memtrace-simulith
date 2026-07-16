import { Tool } from './Tool.js';

const BASE = 'https://api.binance.com';

export class BinanceTool extends Tool {
  name = 'binance';
  description = 'Fetch live market data from Binance. Accepts any text query (e.g. "Bitcoin", "ETH", "SOL") and resolves it to the best matching trading pair.';
  parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Asset name or symbol to look up (e.g. Bitcoin, ETH, SOL, BTCUSDT)' }
    },
    required: ['query']
  };

  async execute(args) {
    const { query } = args;
    if (!query || !query.trim()) {
      return { symbol: null, price: null, error: 'No query provided' };
    }

    const normalized = query.trim().toUpperCase();

    let symbol = await this._tryExactMatch(normalized);
    if (!symbol) {
      symbol = await this._resolveSymbol(normalized);
    }
    if (!symbol) {
      return { symbol: null, price: null, error: `Could not find a trading pair matching "${query}"` };
    }

    try {
      const [priceResp, tickerResp] = await Promise.all([
        fetch(`${BASE}/api/v3/ticker/price?symbol=${symbol}`),
        fetch(`${BASE}/api/v3/ticker/24hr?symbol=${symbol}`)
      ]);

      if (!priceResp.ok || !tickerResp.ok) {
        return { symbol, price: null, error: `Binance API returned ${priceResp.status} / ${tickerResp.status}` };
      }

      const priceData = await priceResp.json();
      const tickerData = await tickerResp.json();

      return {
        symbol,
        price: priceData.price,
        priceChangePercent: tickerData.priceChangePercent,
        highPrice: tickerData.highPrice,
        lowPrice: tickerData.lowPrice,
        volume: tickerData.volume,
        quoteVolume: tickerData.quoteVolume,
        error: null
      };
    } catch (err) {
      return { symbol, price: null, error: err.message };
    }
  }

  async _tryExactMatch(normalized) {
    if (normalized.length < 3) return null;

    try {
      const resp = await fetch(`${BASE}/api/v3/ticker/price?symbol=${normalized}`);
      if (resp.ok) {
        return normalized;
      }
    } catch {}

    const withUsdt = normalized.endsWith('USDT') ? normalized : `${normalized}USDT`;
    if (withUsdt !== normalized) {
      try {
        const resp = await fetch(`${BASE}/api/v3/ticker/price?symbol=${withUsdt}`);
        if (resp.ok) return withUsdt;
      } catch {}
    }

    return null;
  }

  async _resolveSymbol(normalized) {
    try {
      const resp = await fetch(`${BASE}/api/v3/exchangeInfo`);
      if (!resp.ok) return null;

      const data = await resp.json();
      const pairs = data.symbols || [];

      const q = normalized.replace(/USDT$/, '');

      const scored = [];
      for (const p of pairs) {
        const base = p.baseAsset.toUpperCase();
        const symbol = p.symbol.toUpperCase();
        let score = 0;

        if (base === q) score = 100;
        else if (symbol === q) score = 90;
        else if (base.includes(q) || q.includes(base)) score = 50;
        else if (base.startsWith(q[0]) && q.startsWith(base[0])) score = 20;

        if (score > 0 && p.quoteAsset === 'USDT') {
          scored.push({ symbol: p.symbol, score, volume: parseFloat(p.quoteVolume || '0') });
        }
      }

      if (scored.length === 0) return null;

      scored.sort((a, b) => b.score - a.score || b.volume - a.volume);
      return scored[0].symbol;
    } catch {
      return null;
    }
  }
}
