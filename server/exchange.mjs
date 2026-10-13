const HOUR = 60 * 60 * 1000;
const MAX_AGE = 7 * 24 * HOUR;
export function createExchangeService({ fetcher = fetch, clock = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function exchange(marketCurrency) {
    const currencies = [...new Set(['EUR', 'USD', marketCurrency])];
    if (!/^[A-Z]{3}$/.test(marketCurrency)) throw new Error('Invalid market currency.');
    const cached = cache.get(marketCurrency);
    if (cached && clock() - Date.parse(cached.fetched_at) < HOUR) return { ...cached, stale: false };
    if (pending.has(marketCurrency)) return pending.get(marketCurrency);
    const request = (async () => {
      try {
        const quotes = currencies.filter(c => c !== 'EUR').join(',');
        const response = await fetcher(`https://api.frankfurter.dev/v2/rates?base=EUR&quotes=${quotes}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Exchange provider unavailable.');
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Invalid rate response.');
        const rates = { EUR: 1 }, dates = {};
        for (const currency of currencies.filter(c => c !== 'EUR')) {
          const row = rows.find(r => r.base === 'EUR' && r.quote === currency);
          if (!row || !Number.isFinite(row.rate) || row.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || clock() - Date.parse(row.date) > MAX_AGE || Date.parse(row.date) > clock() + 86400000) throw new Error('Recent exchange rates are unavailable.');
          rates[currency] = row.rate;
          dates[currency] = row.date;
        }
        const value = { base: 'EUR', rates, dates, fetched_at: new Date(clock()).toISOString(), source: 'Frankfurter' };
        cache.set(marketCurrency, value);
        return { ...value, stale: false };
      } catch {
        if (cached && Object.values(cached.dates).every(d => clock() - Date.parse(d) <= MAX_AGE)) return { ...cached, stale: true };
        throw Object.assign(new Error('Exchange rates are unavailable. Please try again shortly. Prices remain available in the market currency.'), { status: 503 });
      } finally { pending.delete(marketCurrency); }
    })();
    pending.set(marketCurrency, request);
    return request;
  };
}
export const getExchangeRates = createExchangeService();
