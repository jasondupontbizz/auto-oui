// Service worker + Jev (TypeSafe API) tests with a mocked chrome API and a mocked fetch.
// No real network call is made and no real key is used.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as jev from '../extension/jev.js';

const KEY = 'FAKE-TEST-KEY-not-a-real-typesafe-key';
const EXT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const POPUP = `chrome-extension://${EXT_ID}/popup.html`;
const TAB = { id: 7, url: 'https://chatgpt.com/c/test' };
const store = { local: {}, session: {} };
const granted = new Set();
const listeners = { message: [], storage: [], permAdded: [], permRemoved: [] };
const tabMessages = [];
const fetchCalls = [];
let fetchImpl;
const logged = [];
function area(name) {
  return {
    get: async key => (typeof key === 'string' ? (key in store[name] ? { [key]: store[name][key] } : {}) : { ...store[name] }),
    set: async items => {
      const changes = Object.fromEntries(Object.keys(items).map(k => [k, { newValue: items[k] }]));
      Object.assign(store[name], structuredClone(items));
      for (const fn of listeners.storage) fn(changes, name);
    },
    remove: async key => { delete store[name][key]; for (const fn of listeners.storage) fn({ [key]: {} }, name); }
  };
}
globalThis.chrome = {
  runtime: { id: EXT_ID, getURL: path => `chrome-extension://${EXT_ID}/${path}`, getManifest: () => ({ version: '1.1.0' }),
    onMessage: { addListener: fn => listeners.message.push(fn) } },
  storage: { local: area('local'), session: area('session'), onChanged: { addListener: fn => listeners.storage.push(fn) } },
  permissions: {
    contains: async ({ origins }) => origins.every(o => granted.has(o)),
    onAdded: { addListener: fn => listeners.permAdded.push(fn) }, onRemoved: { addListener: fn => listeners.permRemoved.push(fn) }
  },
  tabs: { get: async () => TAB, sendMessage: async (id, msg) => { tabMessages.push(structuredClone(msg)); return { ok: true }; },
    onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
  scripting: { executeScript: async () => [] },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} }
};
globalThis.fetch = async (url, init) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };
// Capture anything the extension might log.
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[level];
  console[level] = (...args) => { logged.push(args.map(String).join(' ')); if (level === 'error') original(...args); };
}
await import('../extension/background.js');

const ok = noul => async () => new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { requests_approval: { type: 'noul', noul } } }), { status: 200 });
function send(message, sender) {
  return new Promise(resolve => { for (const fn of listeners.message) fn(message, sender, resolve); });
}
const fromTab = message => send(message, { id: EXT_ID, tab: TAB, url: TAB.url });
const fromPopup = message => send(message, { id: EXT_ID, url: POPUP });
let n = 0;
const unique = () => `Je lance la migration n°${++n} maintenant, ça te va ?`;
beforeEach(async () => {
  store.local = {}; store.session = { tabs: { [TAB.id]: { enabled: true, origin: 'https://chatgpt.com', settings: { mode: 'hybrid', threshold: 0.9 } } } };
  granted.clear(); granted.add('https://chatgpt.com/*');
  fetchCalls.length = 0; tabMessages.length = 0; logged.length = 0;
  fetchImpl = ok(0.97);
});
function assertKeyNeverExposed(...values) {
  for (const value of [...values, logged, store.session, tabMessages]) assert.doesNotMatch(JSON.stringify(value ?? null), new RegExp(KEY), 'key leaked');
}

test('no key: Jev inactive, classify refused, no network call', async () => {
  assert.deepEqual(await fromPopup({ type: 'jev' }), { configured: false, permitted: false, active: false });
  assert.equal((await fromTab({ type: 'config' })).jev, false);
  const result = await fromTab({ type: 'classify', text: unique(), context: '' });
  assert.match(result.error, /Clé TypeSafe absente/); assert.equal(fetchCalls.length, 0);
});
test('key saved but API access not granted: Jev inactive, no network call', async () => {
  store.local.typesafeKey = KEY;
  assert.deepEqual(await fromPopup({ type: 'jev' }), { configured: true, permitted: false, active: false });
  assert.equal((await fromTab({ type: 'config' })).jev, false);
  assert.match((await fromTab({ type: 'classify', text: unique() })).error, /non autorisé/); assert.equal(fetchCalls.length, 0);
});
test('key + permission: calls TypeSafe exactly like the original bridge and returns the Jev probability', async () => {
  store.local.typesafeKey = KEY; granted.add(jev.API_PERMISSION);
  assert.equal((await fromTab({ type: 'config' })).jev, true);
  const text = unique();
  const result = await fromTab({ type: 'classify', text, context: 'user: Prépare la migration' });
  assert.deepEqual(result, { probability: 0.97, source: 'typesafe' });
  assert.equal(fetchCalls.length, 1);
  const { url, init } = fetchCalls[0];
  assert.equal(url, 'https://api.typesafe.ai/v1/systemone'); assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer ' + KEY); assert.equal(init.credentials, 'omit');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(body.state, { latest_assistant_message: text, previous_messages: 'user: Prépare la migration' });
  assert.equal(body.questions.requests_approval.type, 'noul');
  assert.match(body.questions.requests_approval.instructions, /ask the user for permission/);
  // Same text again: served from the 10-minute cache.
  await fromTab({ type: 'classify', text, context: 'user: Prépare la migration' }); assert.equal(fetchCalls.length, 1);
  assertKeyNeverExposed(result);
});
test('context is capped at 4000 characters and the message at 24000', async () => {
  store.local.typesafeKey = KEY; granted.add(jev.API_PERMISSION);
  await fromTab({ type: 'classify', text: unique(), context: 'x'.repeat(9000) });
  assert.equal(JSON.parse(fetchCalls[0].init.body).state.previous_messages.length, 4000);
  assert.match((await fromTab({ type: 'classify', text: 'y'.repeat(24001) })).error, /trop long/); assert.equal(fetchCalls.length, 1);
});
test('API errors return key-free messages and never a probability', async () => {
  store.local.typesafeKey = KEY; granted.add(jev.API_PERMISSION);
  const cases = [
    [async () => new Response(JSON.stringify({ echo: KEY }), { status: 401 }), /clé refusée/],
    [async () => new Response('{"detail":"overloaded"}', { status: 529 }), /HTTP 529/],
    [async () => { throw new TypeError('network down ' + KEY); }, /ne répond pas/],
    [async () => new Response('not json', { status: 200 }), /invalide/],
    [async () => new Response(JSON.stringify({ answers: { requests_approval: { noul: 1.7 } } }), { status: 200 }), /invalide/]
  ];
  for (const [impl, pattern] of cases) {
    fetchImpl = impl;
    const result = await fromTab({ type: 'classify', text: unique() });
    assert.equal(result.probability, undefined); assert.match(result.error, pattern);
    assertKeyNeverExposed(result);
  }
});
test('the key never appears in popup state, Jev status, tab messages, session storage or logs', async () => {
  store.local.typesafeKey = KEY; granted.add(jev.API_PERMISSION);
  const replies = [await fromPopup({ type: 'jev' }), await fromPopup({ type: 'state', tabId: TAB.id }), await fromTab({ type: 'config' }),
    await fromPopup({ type: 'enable', tabId: TAB.id, settings: { mode: 'hybrid' } }), await fromTab({ type: 'classify', text: unique() })];
  assert.ok(tabMessages.some(m => m.type === 'apply' && m.jev === true));
  assertKeyNeverExposed(...replies);
});
test('saving or removing the key re-applies Jev status to enabled tabs', async () => {
  granted.add(jev.API_PERMISSION);
  await chrome.storage.local.set({ typesafeKey: KEY }); await new Promise(r => setTimeout(r, 10));
  assert.equal(tabMessages.at(-1).jev, true);
  await chrome.storage.local.remove('typesafeKey'); await new Promise(r => setTimeout(r, 10));
  assert.equal(tabMessages.at(-1).jev, false);
  assertKeyNeverExposed();
});
test('page scripts cannot use popup controls or read the Jev status', async () => {
  assert.match((await send({ type: 'jev' }, { id: EXT_ID, url: 'https://chatgpt.com/' })).error, /popup/);
  assert.match((await fromTab({ type: 'jev' })).error, /inconnue/);
  assert.match((await send({ type: 'classify', text: 'x' }, { id: 'other-extension', tab: TAB })).error, /Émetteur/);
});
test('jev.probability rejects a missing key without calling the network', async () => {
  let called = false;
  await assert.rejects(jev.probability('Puis-je ?', '', '', { fetchImpl: async () => { called = true; } }), /absente/);
  assert.equal(called, false);
});
