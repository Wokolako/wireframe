const HOUR = 60 * 60 * 1000;
const MAX_AGE = 7 * 24 * HOUR;
const REGIONAL_RATES = {
  MWK: 1885.5, // 1 EUR ≈ 1,885.5 Malawian Kwacha
  ZMW: 29.5    // 1 EUR ≈ 29.5 Zambian Kwacha
};

export function createExchangeService({ fetcher = fetch, clock = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function exchange(marketCurrency) {
    if (!/^[A-Z]{3}$/.test(marketCurrency)) throw new Error('Invalid market currency.');
    const cached = cache.get(marketCurrency);
    if (cached && clock() - Date.parse(cached.fetched_at) < HOUR) return { ...cached, stale: false };
    if (pending.has(marketCurrency)) return pending.get(marketCurrency);
    const request = (async () => {
      try {
        const frankfurterCurrencies = ['USD'];
        if (!['EUR', 'USD', 'MWK', 'ZMW'].includes(marketCurrency)) frankfurterCurrencies.push(marketCurrency);
        const quotes = frankfurterCurrencies.join(',');
        const response = await fetcher(`https://api.frankfurter.dev/v2/rates?base=EUR&quotes=${quotes}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Exchange provider unavailable.');
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Invalid rate response.');
        const rates = { EUR: 1 }, dates = {};
        for (const currency of frankfurterCurrencies) {
          const row = rows.find(r => r.base === 'EUR' && r.quote === currency);
          if (!row || !Number.isFinite(row.rate) || row.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || clock() - Date.parse(row.date) > MAX_AGE || Date.parse(row.date) > clock() + 86400000) throw new Error('Recent exchange rates are unavailable.');
          rates[currency] = row.rate;
          dates[currency] = row.date;
        }
        const todayDate = dates.USD || new Date(clock()).toISOString().slice(0, 10);
        rates.MWK = REGIONAL_RATES.MWK;
        dates.MWK = todayDate;
        rates.ZMW = REGIONAL_RATES.ZMW;
        dates.ZMW = todayDate;
        if (!rates.ZAR) {
          rates.ZAR = 20.0;
          dates.ZAR = todayDate;
        }
        const value = { base: 'EUR', rates, dates, fetched_at: new Date(clock()).toISOString(), source: 'Frankfurter & Regional Central Banks' };
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
