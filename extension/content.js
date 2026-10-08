// Script injecté dans l'onglet activé : surveille le dernier message et répond.
(function () {
  const VERSION = chrome.runtime.getManifest?.().version || 'dev';
  if (globalThis.__autoOui?.version === VERSION) { globalThis.__autoOui.refresh(); return; }
  // Replace previous instances when reinjected after a source update.
  if (globalThis.__autoOui?.dispose) globalThis.__autoOui.dispose();
  else if (globalThis.__autoOui) {
    // Legacy instances captured the previous adapters. Reloading the page replaces
    // their invalidated listeners; do not layer a second active engine over them.
    chrome.runtime.sendMessage({ type: 'status', status: { state: 'Rechargement requis', detail: 'Recharge cet onglet pour charger la nouvelle version d’Auto-Oui.' } }).catch(() => {});
    return;
  }
  const C = globalThis.AutoOuiCore, A = globalThis.AutoOuiAdapters;
  let enabled = false, settings = C.DEFAULTS, busy = false, epoch = 0;
  let route = location.href, candidate = '', stableSince = 0, lastStatus = '', retryAt = 0;
  const decisions = new Map();
  let interval;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function message(data) {
    const result = await chrome.runtime.sendMessage(data);
    if (result?.error) throw new Error(result.error);
    return result;
  }
  function status(state, detail = '') {
    const key = `${state}:${detail}`;
    if (key === lastStatus) return;
    lastStatus = key;
    message({ type: 'status', status: { state, detail } }).catch(() => {});
  }
  function storageKey() { return 'auto-oui:handled:' + location.pathname + location.search; }
  function handled() {
    try { return new Set(JSON.parse(sessionStorage.getItem(storageKey()) || '[]')); } catch { return new Set(); }
  }
  function mark(key) {
    const items = [...handled(), key].slice(-200);
    try { sessionStorage.setItem(storageKey(), JSON.stringify(items)); } catch { enabled = false; throw new Error('Stockage de déduplication indisponible.'); }
  }
  function signature(m) { return m ? `${m.id}:${m.text}` : ''; }
  function fresh(expected, token) { return enabled && epoch === token && location.href === route && signature(A.lastMessage(settings)) === expected; }
  function apply(config) {
    epoch++; enabled = Boolean(config.enabled); candidate = ''; stableSince = 0; retryAt = 0; lastStatus = '';
    if (config.settings) settings = C.validateSettings(config.settings);
    clearInterval(interval);
    if (enabled) {
      try { A.validateSelectors(settings); } catch { enabled = false; status('Erreur', 'Sélecteur CSS invalide.'); return; }
      interval = setInterval(tick, 700);
      status('Actif', 'En attente d’une demande d’approbation.');
      tick();
    }
  }
  async function refresh() {
    try { apply(await message({ type: 'config' })); } catch { apply({ enabled: false }); }
  }
  async function tick() {
    if (!enabled || busy) return;
    if (location.href !== route) {
      route = location.href; epoch++; candidate = ''; stableSince = 0; decisions.clear(); retryAt = 0;
    }
    let latest;
    try { latest = A.lastMessage(settings); } catch (error) { status('Erreur', error.message); return; }
    const approval = A.approvalButton(settings, latest);
    const sig = signature(latest);
    const observed = sig + (approval ? ':card:' + approval.scopeText + ':' + approval.text : '');
    const now = Date.now();
    if (observed !== candidate) { candidate = observed; stableSince = now; retryAt = 0; }
    if (now - stableSince < settings.settleMs || now < retryAt) return;
    const token = epoch;
    busy = true;
    try {
      // Button approvals are handled even when a task is waiting with its Stop button still visible.
      const button = A.approvalButton(settings, latest);
      if (button) {
        const key = `button:${latest?.id || 'dialog'}:${button.scopeText}:${C.normalize(button.text)}`;
        if (!handled().has(key) && A.enabled(button.element) && enabled && epoch === token) {
          mark(key);
          if (latest) mark('text:' + sig);
          button.element.click();
          status('Approbation cliquée', button.text);
          return;
        }
      }
      if (!latest) {
        const selectors = { assistant: settings.assistantSelector || A.SELECTORS.assistant, user: settings.userSelector || A.SELECTORS.user };
        if (!document.querySelector(selectors.assistant) && !document.querySelector(selectors.user)) {
          status('Interface non reconnue', 'Aucune bulle de conversation trouvée. Copier le diagnostic dans le popup.');
        } else status('En attente', 'Aucun nouveau message de l’agent à traiter.');
        return;
      }
      if (handled().has('text:' + sig)) return;
      if (A.streaming(settings)) { status('En attente', 'L’agent écrit encore.'); return; }
      const input = A.composer(settings);
      if (!input) { status('Interface non reconnue', 'Champ de message introuvable. Voir les sélecteurs avancés.'); return; }
      if (A.inputValue(input).trim()) { status('Brouillon présent', 'Envoi différé jusqu’à ce que le champ soit vide.'); return; }
      let verdict = decisions.get(sig);
      if (!verdict) {
        status('Analyse', 'Détection de la demande…');
        verdict = { approve: C.localApproval(latest.text), source: 'règles locales' };
        decisions.set(sig, verdict);
        if (decisions.size > 100) decisions.delete(decisions.keys().next().value);
      }
      if (!fresh(sig, token)) return;
      if (!verdict.approve) { status('En attente', 'Ce message ne demande pas d’approbation.'); return; }
      if (A.streaming(settings) || A.inputValue(input).trim()) return;
      A.fill(input, settings.reply);
      let send;
      for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(100);
        if (!fresh(sig, token) || A.streaming(settings) || A.inputValue(input).trim() !== settings.reply) {
          if (A.inputValue(input).trim() === settings.reply) A.fill(input, '');
          return;
        }
        send = A.sendButton(settings);
        if (send) break;
      }
      if (!send) {
        if (A.inputValue(input).trim() === settings.reply) A.fill(input, '');
        throw new Error('Bouton Envoyer introuvable ou désactivé.');
      }
      // Record before clicking: reloads, slow acknowledgements and network failures cannot send twice.
      mark('text:' + sig);
      send.click();
      let acknowledged = false;
      for (let attempt = 0; attempt < 25; attempt++) {
        await sleep(200);
        if (!enabled || epoch !== token || location.href !== route) return;
        if (!A.inputValue(input).trim() || signature(A.lastMessage(settings)) !== sig || A.streaming(settings)) { acknowledged = true; break; }
      }
      if (acknowledged) status('Réponse envoyée', `« ${settings.reply} » (${verdict.source})`);
      else status('Envoi à vérifier', 'Clic effectué, réception non confirmée. Aucun renvoi automatique.');
    } catch (error) {
      retryAt = Date.now() + 30000;
      status('Erreur', error.message);
    } finally { busy = false; }
  }
  const observer = new MutationObserver(() => { if (enabled && !busy) tick(); });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  const onPageHide = () => { enabled = false; epoch++; clearInterval(interval); observer.disconnect(); };
  const onPageShow = event => { if (event.persisted) { observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true }); refresh(); } };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  const onMessage = (data, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (data.type === 'apply') { apply(data); reply({ ok: true }); }
    if (data.type === 'diagnostics') { reply(A.diagnostics(settings)); }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  function dispose() {
    onPageHide();
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    chrome.runtime.onMessage.removeListener(onMessage);
  }
  globalThis.__autoOui = { version: VERSION, refresh, dispose };
  refresh();
})();
