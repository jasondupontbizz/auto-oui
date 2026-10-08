// Service worker : état d'activation par onglet, injection du script, messages du popup,
// et appel optionnel à Jev (API TypeSafe) avec la clé de l'utilisateur.
import './core.js';
import './sites.js';
import * as jev from './jev.js';
const core = globalThis.AutoOuiCore;
const sites = globalThis.AutoOuiSites;
const CONTENT_FILES = ['core.js', 'sites.js', 'adapters.js', 'content.js'];
const KEY_STORAGE = 'typesafeKey';
const CACHE_MS = 10 * 60 * 1000, CACHE_MAX = 128;
const pending = new Map();
const cache = new Map();
let tabWrites = Promise.resolve();
async function tabsState() { return (await chrome.storage.session.get('tabs')).tabs || {}; }
async function setTab(id, value) {
  const update = tabWrites.then(async () => {
    const tabs = await tabsState();
    if (value) tabs[id] = value; else delete tabs[id];
    await chrome.storage.session.set({ tabs });
    await chrome.action.setBadgeText({ tabId: id, text: value?.enabled ? 'OUI' : '' }).catch(() => {});
    await chrome.action.setBadgeBackgroundColor({ tabId: id, color: '#13795b' }).catch(() => {});
  });
  tabWrites = update.catch(() => {});
  return update;
}
function origin(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Ouvre un site de conversation dans Chrome.');
  return parsed.origin;
}
async function inject(id) {
  await chrome.scripting.executeScript({ target: { tabId: id }, files: CONTENT_FILES });
}
// The key stays in chrome.storage.local (this browser profile only). It is read here, at call time.
async function storedKey() { return String((await chrome.storage.local.get(KEY_STORAGE))[KEY_STORAGE] || '').trim(); }
async function jevStatus() {
  const configured = Boolean(await storedKey());
  const permitted = configured && await chrome.permissions.contains({ origins: [jev.API_PERMISSION] });
  return { configured, permitted, active: configured && permitted };
}
async function classify(text, context) {
  const key = await storedKey();
  if (!key) throw new Error('Clé TypeSafe absente.');
  if (!await chrome.permissions.contains({ origins: [jev.API_PERMISSION] })) throw new Error('Accès à l’API TypeSafe non autorisé.');
  const cacheKey = context + '\u0000' + text;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return { probability: hit.value, source: 'typesafe' };
  if (!pending.has(cacheKey)) {
    pending.set(cacheKey, jev.probability(text, context, key).then(value => {
      cache.set(cacheKey, { at: Date.now(), value });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return value;
    }).finally(() => pending.delete(cacheKey)));
  }
  return { probability: await pending.get(cacheKey), source: 'typesafe' };
}
async function applyToTab(id, state) {
  await chrome.tabs.sendMessage(id, { type: 'apply', enabled: true, settings: state.settings, jev: (await jevStatus()).active });
}
async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error('Émetteur invalide.');
  const tabId = sender.tab?.id;
  if (tabId !== undefined) {
    const state = (await tabsState())[tabId];
    const permitted = state?.enabled && origin(sender.tab.url) === state.origin;
    if (message.type === 'config') return permitted ? { enabled: true, settings: state.settings, jev: (await jevStatus()).active } : { enabled: false };
    if (!permitted) throw new Error('Cet onglet n’est pas activé.');
    if (message.type === 'status') {
      await chrome.storage.session.set({ [`status:${tabId}`]: { ...message.status, at: Date.now() } });
      return { ok: true };
    }
    if (message.type === 'classify') {
      if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > jev.MAX_TEXT) throw new Error('Message invalide ou trop long.');
      return classify(message.text, String(message.context || '').slice(-jev.MAX_CONTEXT));
    }
    throw new Error('Action inconnue.');
  }
  // Control messages are accepted only from our popup (never a page content script).
  if (sender.url !== chrome.runtime.getURL('popup.html')) throw new Error('Contrôle réservé au popup.');
  if (message.type === 'state') {
    return { tab: (await tabsState())[message.tabId], status: (await chrome.storage.session.get(`status:${message.tabId}`))[`status:${message.tabId}`] };
  }
  if (message.type === 'jev') return jevStatus();
  if (message.type === 'enable') {
    const tab = await chrome.tabs.get(message.tabId);
    const tabOrigin = origin(tab.url);
    if (!sites.siteForUrl(tab.url)) throw new Error('Site non pris en charge.');
    const settings = core.validateSettings(message.settings);
    if (!await chrome.permissions.contains({ origins: [tabOrigin + '/*'] })) throw new Error('Permission du site absente.');
    const state = { enabled: true, origin: tabOrigin, settings };
    await setTab(tab.id, state);
    await chrome.storage.local.set({ settings });
    try {
      await inject(tab.id);
      await applyToTab(tab.id, state);
    } catch (error) {
      await setTab(tab.id, null);
      throw new Error('Impossible d’injecter l’extension : ' + error.message);
    }
    return { ok: true };
  }
  if (message.type === 'disable') {
    await setTab(message.tabId, null);
    await chrome.tabs.sendMessage(message.tabId, { type: 'apply', enabled: false }).catch(() => {});
    return { ok: true };
  }
  throw new Error('Action inconnue.');
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  handle(message, sender).then(reply).catch(error => reply({ error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(async id => {
  await setTab(id, null);
  await chrome.storage.session.remove(`status:${id}`);
});
// Re-inject after a reload or in-site navigation, as long as the tab stays on the same site.
chrome.tabs.onUpdated.addListener(async (id, change, tab) => {
  if (change.status !== 'complete') return;
  const state = (await tabsState())[id];
  if (!state?.enabled) return;
  try {
    if (origin(tab.url) !== state.origin) { await setTab(id, null); return; }
    await inject(id);
  } catch { /* Restricted pages and tabs closing cannot be injected. */ }
});
// When the key is saved or removed, tell the enabled tabs whether Jev mode is now active.
async function refreshJevInTabs() {
  cache.clear();
  for (const [id, state] of Object.entries(await tabsState())) {
    if (state?.enabled) await applyToTab(Number(id), state).catch(() => {});
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && KEY_STORAGE in changes) refreshJevInTabs();
});
chrome.permissions.onAdded?.addListener(refreshJevInTabs);
chrome.permissions.onRemoved?.addListener(refreshJevInTabs);
