// Service worker : état d'activation par onglet, injection du script, messages du popup.
// Aucun appel réseau : tout se passe dans le navigateur.
import './core.js';
import './sites.js';
const core = globalThis.AutoOuiCore;
const sites = globalThis.AutoOuiSites;
const CONTENT_FILES = ['core.js', 'sites.js', 'adapters.js', 'content.js'];
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
async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error('Émetteur invalide.');
  const tabId = sender.tab?.id;
  if (tabId !== undefined) {
    const state = (await tabsState())[tabId];
    const permitted = state?.enabled && origin(sender.tab.url) === state.origin;
    if (message.type === 'config') return permitted ? { enabled: true, settings: state.settings } : { enabled: false };
    if (!permitted) throw new Error('Cet onglet n’est pas activé.');
    if (message.type === 'status') {
      await chrome.storage.session.set({ [`status:${tabId}`]: { ...message.status, at: Date.now() } });
      return { ok: true };
    }
    throw new Error('Action inconnue.');
  }
  // Control messages are accepted only from our popup (never a page content script).
  if (sender.url !== chrome.runtime.getURL('popup.html')) throw new Error('Contrôle réservé au popup.');
  if (message.type === 'state') {
    return { tab: (await tabsState())[message.tabId], status: (await chrome.storage.session.get(`status:${message.tabId}`))[`status:${message.tabId}`] };
  }
  if (message.type === 'enable') {
    const tab = await chrome.tabs.get(message.tabId);
    const tabOrigin = origin(tab.url);
    if (!sites.siteForUrl(tab.url)) throw new Error('Site non pris en charge.');
    const settings = core.validateSettings(message.settings);
    if (!await chrome.permissions.contains({ origins: [tabOrigin + '/*'] })) throw new Error('Permission du site absente.');
    await setTab(tab.id, { enabled: true, origin: tabOrigin, settings });
    await chrome.storage.local.set({ settings });
    try {
      await inject(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'apply', enabled: true, settings });
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
