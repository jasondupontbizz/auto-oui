const $ = id => document.getElementById(id);
let tab, active = false;
const fields = Object.keys(AutoOuiCore.DEFAULTS);
async function rpc(data) {
  const response = await chrome.runtime.sendMessage(data);
  if (response?.error) throw new Error(response.error);
  return response;
}
function getSettings() {
  const data = Object.fromEntries(fields.map(key => [key, key === 'clickApprovals' ? $(key).checked : $(key).value]));
  const settings = AutoOuiCore.validateSettings(data);
  // Throws on an invalid CSS selector before anything is saved.
  for (const key of AutoOuiCore.SELECTOR_FIELDS) if (settings[key]) document.querySelector(settings[key]);
  return settings;
}
function putSettings(settings) {
  for (const key of fields) if (key === 'clickApprovals') $(key).checked = settings[key]; else $(key).value = settings[key];
}
async function refresh() {
  if (!tab) return;
  const result = await rpc({ type: 'state', tabId: tab.id });
  active = Boolean(result.tab?.enabled);
  $('toggle').textContent = active ? 'Désactiver cet onglet' : 'Activer sur cet onglet';
  $('toggle').classList.toggle('stop', active); $('dot').classList.toggle('on', active);
  $('state').textContent = active ? result.status?.state || 'Actif' : 'Désactivé';
  $('detail').textContent = active ? (result.status?.detail || 'En attente d’une demande.') : 'Active cet onglet pour commencer.';
}
async function enable() {
  const settings = getSettings();
  const site = AutoOuiSites.siteForUrl(tab.url);
  if (!site) throw new Error('Site non pris en charge.');
  // Called directly from a user click to obtain the optional host permission.
  const granted = await chrome.permissions.request({ origins: [new URL(tab.url).origin + '/*'] });
  if (!granted) throw new Error(`L’accès à ${site.name} n’a pas été accordé.`);
  await rpc({ type: 'enable', tabId: tab.id, settings });
}
$('toggle').addEventListener('click', async () => {
  $('error').textContent = '';
  try {
    if (active) await rpc({ type: 'disable', tabId: tab.id }); else await enable();
    await refresh();
  } catch (error) { $('error').textContent = error.message; }
});
$('save').addEventListener('click', async () => {
  $('error').textContent = '';
  try {
    const settings = getSettings(); await chrome.storage.local.set({ settings });
    if (active) await rpc({ type: 'enable', tabId: tab.id, settings });
    await refresh();
  } catch (error) { $('error').textContent = error.message; }
});
$('diagnostics').addEventListener('click', async () => {
  $('error').textContent = '';
  try {
    const state = await rpc({ type: 'state', tabId: tab.id });
    const dom = await chrome.tabs.sendMessage(tab.id, { type: 'diagnostics' });
    if (!dom?.matches) throw new Error('Active d’abord Auto-Oui sur cet onglet (ou recharge l’onglet), puis réessaie.');
    const report = JSON.stringify({ state, dom }, null, 2);
    const output = $('diagnosticOutput'); output.hidden = false; output.value = report; output.select();
    try { await navigator.clipboard.writeText(report); $('diagnostics').textContent = 'Diagnostic copié (relis-le avant de le partager)'; }
    catch { $('diagnostics').textContent = 'Diagnostic affiché : Ctrl+C pour copier'; }
  } catch (error) { $('error').textContent = error.message; }
});
(async () => {
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  const stored = await chrome.storage.local.get('settings');
  putSettings({ ...AutoOuiCore.DEFAULTS, ...stored.settings });
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = tab?.url ? AutoOuiSites.siteForUrl(tab.url) : null;
  $('site').textContent = tab?.url ? new URL(tab.url).hostname + (site ? ` · ${site.name}` : ' · site non pris en charge') : 'Aucun onglet';
  $('toggle').disabled = !site;
  await refresh();
  setInterval(refresh, 1000);
})().catch(error => { $('error').textContent = error.message; });
