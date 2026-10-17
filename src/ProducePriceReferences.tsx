import {useState} from 'react';
import prices from '../shared/produce-prices.json';

const pounds = new Intl.NumberFormat('en-GB', {style: 'currency', currency: 'GBP'});
const kwacha = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0});

export function ProducePriceReferences() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const rows = prices.items.filter(item =>
    (!category || item.category === category) &&
    item.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return <section className="settings-section" aria-labelledby="produce-prices-heading">
    <h2 id="produce-prices-heading">Produce price references</h2>
    <p>UK supermarket and Malawi prices from the supplied produce sheet. Reference only; the price date is unknown.</p>
    <p>Malawi range endings and market notes are unreadable in the screenshots. Confirm the full prices before using them for a sale.</p>
    <div className="form-grid">
      <label className="field"><span>Search price references</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find produce"/></label>
      <label className="field"><span>Price reference category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{[...new Set(prices.items.map(item => item.category))].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <p role="status">{rows.length} of {prices.items.length} produce items</p>
    {rows.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Produce price reference table">
      <table>
        <caption>Source: {prices.source} · supplied screenshots</caption>
        <thead><tr><th scope="col">Produce</th><th scope="col">Unit</th><th scope="col">UK price (GBP)</th><th scope="col">Malawi price (MWK)</th></tr></thead>
        <tbody>{rows.map(item => <tr key={item.source_row}>
          <th scope="row">{item.name}</th>
          <td>{item.unit}</td>
          <td>{pounds.format(item.gbp_from)}{item.gbp_to === null ? ' – end unreadable' : item.gbp_to !== item.gbp_from ? ` – ${pounds.format(item.gbp_to)}` : ''}</td>
          <td>{kwacha.format(item.mwk_visible_from)} – end unreadable</td>
        </tr>)}</tbody>
      </table>
    </div> : <p>No price references match. Try another produce name or choose all categories.</p>}
  </section>;
}
