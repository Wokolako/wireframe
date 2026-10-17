import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {guestLimits} from '../shared/guest-limits.mjs';

const prices = JSON.parse(await readFile(new URL('../shared/produce-prices.json', import.meta.url), 'utf8'));

test('screenshot reference rows map one-to-one to the existing produce catalogue and preserve sale units', () => {
  assert.equal(prices.items.length, 44);
  assert.deepEqual(prices.items.map(row => row.source_row), Array.from({length:44}, (_, i) => i + 2));
  assert.deepEqual(prices.items.map(row => row.name).sort(), guestLimits.map(row => row.name).sort());
  const units = {kg:'1 kg',cobs:'1 cob',bundles:'1 bundle',heads:'1 head',fruits:'1 fruit',bunches:'1 bunch (~1 kg)',canes:'1 cane'};
  for (const item of prices.items) {
    assert.equal(item.unit, units[guestLimits.find(row => row.name === item.name).unit]);
    assert.ok(item.gbp_from > 0);
    assert.ok(item.gbp_to === null || item.gbp_to >= item.gbp_from);
    assert.ok(item.mwk_visible_from > 0);
  }
});

test('partial screenshot prices retain uncertainty and source provenance', () => {
  assert.equal(prices.source_type, 'user_screenshot');
  assert.equal(prices.price_date, null);
  assert.equal(prices.mwk_to, null);
  assert.equal(prices.mwk_status, 'range_end_unreadable');
  assert.equal(prices.market_notes, null);
  assert.deepEqual(prices.items.filter(row => row.gbp_to === null).map(row => row.source_row), [27,44,45]);
  const tomato = prices.items.find(row => row.name === 'Tomatoes');
  assert.equal(tomato.gbp_from, 1.8);
  assert.equal(tomato.gbp_to, 2.2);
  assert.equal(tomato.mwk_visible_from, 2600);
});
