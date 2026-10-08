// Accès au DOM de la page : lecture du dernier message, champ de saisie, boutons.
(function (root) {
  const { normalize, approvalLabel } = root.AutoOuiCore;
  const { SITES, siteForUrl } = root.AutoOuiSites;
  // Sélecteurs du site courant (premier site du registre par défaut).
  function siteSelectors() { return (siteForUrl(location.href) || SITES[0]).selectors; }
  const SELECTORS = siteSelectors();
  function visible(el) {
    if (!el?.isConnected || el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
  }
  function enabled(el) { return visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
  function label(el) { return el.getAttribute('aria-label') || el.innerText || el.textContent || ''; }
  function text(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('pre, code, blockquote, button, script, style, [aria-hidden="true"]').forEach(node => node.remove());
    return (clone.innerText || clone.textContent || '').trim();
  }
  function inputValue(el) { return el ? (el.isContentEditable || el.getAttribute('contenteditable') === 'true' ? el.textContent : el.value) || '' : ''; }
  // Les sélecteurs avancés du popup remplacent ceux du site, clé par clé.
  function selectors(settings) {
    const base = siteSelectors();
    return Object.fromEntries(['assistant', 'user', 'input', 'send', 'stop'].map(key => [key, settings[key + 'Selector'] || base[key]]));
  }
  function validateSelectors(settings) {
    for (const selector of Object.values(selectors(settings))) document.querySelector(selector);
  }
  function lastMessage(settings) {
    const s = selectors(settings);
    const nodes = [...document.querySelectorAll(`${s.assistant}, ${s.user}`)].filter(visible);
    // Only the actual last turn can request approval. Never reply to historical assistant turns.
    const last = nodes.at(-1);
    if (!last || !last.matches(s.assistant)) return null;
    const value = text(last);
    if (!value) return null;
    const id = last.getAttribute('data-message-id') || last.closest('[data-message-id]')?.getAttribute('data-message-id')
      || last.closest('[data-turn-id]')?.getAttribute('data-turn-id') || String(nodes.length);
    const context = nodes.slice(-4, -1).map(node => `${node.matches(s.user) ? 'user' : 'assistant'}: ${text(node)}`).join('\n').slice(-4000);
    return { element: last, text: value, id, context };
  }
  function composer(settings) { return [...document.querySelectorAll(selectors(settings).input)].find(enabled); }
  function sendButton(settings) {
    return [...document.querySelectorAll(selectors(settings).send)].find(el => enabled(el) && !/stop|arreter/.test(normalize(label(el))));
  }
  function streaming(settings) {
    return [...document.querySelectorAll(selectors(settings).stop)].some(visible)
      || Boolean(siteSelectors().streaming && document.querySelector(siteSelectors().streaming));
  }
  function approvalButton(settings, latest) {
    if (!settings.clickApprovals) return null;
    const scopes = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(visible);
    const turnSelector = siteSelectors().turn || 'article';
    const turn = latest?.element.closest(turnSelector + ', article') || latest?.element;
    if (turn) scopes.push(turn);
    // Some tool cards live outside the assistant text. Only the final conversation turn qualifies.
    const finalTurn = [...document.querySelectorAll(turnSelector)].filter(visible).at(-1);
    if (finalTurn && !scopes.includes(finalTurn)) scopes.push(finalTurn);
    for (const scope of scopes) {
      const scopeText = normalize(scope.innerText || scope.textContent);
      const approvalContext = /approval|permission|autorisation|approbation|confirm custom rule|update custom rule|confirmer.*regle|demande.*confirmation|allow.*tool|autoriser.*outil/.test(scopeText);
      for (const button of scope.querySelectorAll('button, [role="button"]')) {
        if (!enabled(button) || !approvalLabel(label(button))) continue;
        // Generic Yes/Confirm only in an explicit approval card; never a random dialog.
        if (!approvalContext && !/^(?:approve|allow|approuver|autoriser)(?: |$)/.test(normalize(label(button)))) continue;
        return { element: button, text: label(button), scopeText: scopeText.slice(0, 1000) };
      }
    }
    return null;
  }
  function fill(el, value) {
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      el.focus();
      const range = document.createRange(); range.selectNodeContents(el);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      if (!document.execCommand || !document.execCommand('insertText', false, value)) {
        el.textContent = value;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      }
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    }
  }
  function diagnostics(settings) {
    const s = selectors(settings);
    const describe = el => ({
      tag: el.tagName?.toLowerCase(), id: el.id || undefined, class: String(el.className || '').slice(0, 250),
      attributes: Object.fromEntries([...el.attributes].filter(attr => /^(role|contenteditable|placeholder|aria-label|data-(?:testid|role|message-author-role|message-id|turn-id))$/.test(attr.name)).map(attr => [attr.name, attr.value.slice(0, 160)])),
      visible: visible(el)
    });
    const matches = Object.fromEntries(Object.entries(s).map(([kind, selector]) => [kind, { selector, count: document.querySelectorAll(selector).length, visible: [...document.querySelectorAll(selector)].filter(visible).length }]));
    const controls = [...document.querySelectorAll('textarea, input:not([type="password"]), [contenteditable="true"], button, [role="button"]')]
      .filter(visible).slice(-45).map(describe);
    const candidates = [];
    const walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const value = node.textContent.trim();
      if (value.length < 25 || node.parentElement.closest('pre, code, script, style, textarea, input, [contenteditable="true"], button') || !visible(node.parentElement)) continue;
      candidates.push({ snippet: value.slice(0, 180), ancestors: [node.parentElement, node.parentElement.parentElement, node.parentElement.parentElement?.parentElement].filter(Boolean).map(describe) });
    }
    return { version: root.chrome?.runtime?.getManifest?.().version, origin: location.origin, matches, streaming: streaming(settings), controls, recentTextStructure: candidates.slice(-8) };
  }
  root.AutoOuiAdapters = { SELECTORS, visible, enabled, label, text, inputValue, validateSelectors, lastMessage, composer, sendButton, streaming, approvalButton, fill, diagnostics };
})(globalThis);
