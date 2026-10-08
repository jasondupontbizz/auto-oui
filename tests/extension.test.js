import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const sources = await Promise.all(['core.js', 'sites.js', 'adapters.js', 'content.js'].map(name => readFile(new URL('../extension/' + name, import.meta.url), 'utf8')));
const fixtures = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'));
const turn = (role, text, id = role) => `<article data-testid="conversation-turn-${id}"><div data-message-author-role="${role}" data-message-id="${id}">${text}</div></article>`;
const workTurn = (role, text, id = role) => `<article class="message-row ${role === 'user' ? 'self' : 'grouped-previous'}" data-message-id="${id}"><div class="message-bubble-wrap"><div class="message-content-line"><div class="message-content-stack"><div class="message-content"><div class="message-body" tabindex="0" data-message-id="${id}"><div class="message-surface"><div class="message-bubble"><div class="message-text"><div data-markdown-text-style="assistant-message">${text}</div></div></div></div></div></div></div></div></div></article>`;
async function harness({ html = turn('user', 'Travaille', '1') + turn('assistant', 'M’autorises-tu à transférer les fichiers ?', '2'), work = false, reply = 'Oui' } = {}) {
  const composer = work ? '<div contenteditable="true" role="textbox" aria-label="Message" data-composer-markdown class="ProseMirror"><p><br></p></div><button type="button" aria-label="Send" aria-disabled="true" disabled></button>' : '<textarea id="prompt-textarea"></textarea><button type="button" data-testid="send-button">Envoyer</button>';
  const dom = new JSDOM(`<main>${html}</main><form>${composer}</form>`, { url: 'https://chatgpt.com/' + (work ? 'dots/test' : 'c/test'), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  let now = 1000, enabled = true, sent = 0;
  const listeners = [], intervals = new Map(), statuses = [];
  w.Date.now = () => now;
  w.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 20 }]; };
  w.setInterval = fn => { const id = Math.random(); intervals.set(id, fn); return id; };
  w.clearInterval = id => intervals.delete(id);
  w.setTimeout = fn => { queueMicrotask(fn); return 1; };
  w.chrome = { runtime: {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    getManifest: () => ({ version: '1.0.0' }),
    onMessage: { addListener: listener => listeners.push(listener), removeListener: listener => { const index = listeners.indexOf(listener); if (index !== -1) listeners.splice(index, 1); } },
    sendMessage: async msg => {
      if (msg.type === 'config') return { enabled, settings: { ...w.AutoOuiCore.DEFAULTS, settleMs: 500, reply } };
      if (msg.type === 'status') { statuses.push(msg.status); return { ok: true }; }
      throw new Error('unexpected message ' + msg.type);
    }
  } };
  const sendButton = w.document.querySelector('[data-testid="send-button"], button[aria-label="Send"]');
  if (work) w.document.querySelector('[contenteditable="true"]').addEventListener('input', event => {
    const empty = !event.target.textContent.trim(); sendButton.disabled = empty; sendButton.setAttribute('aria-disabled', String(empty));
  });
  sendButton.addEventListener('click', () => {
    sent++; const input = w.AutoOuiAdapters.composer(w.AutoOuiCore.DEFAULTS);
    const value = w.AutoOuiAdapters.inputValue(input);
    w.document.querySelector('main').insertAdjacentHTML('beforeend', (work ? workTurn : turn)('user', value, 'sent-' + sent));
    if (input.getAttribute('contenteditable') === 'true') input.textContent = ''; else input.value = '';
  });
  for (const source of sources) w.eval(source);
  await new Promise(resolve => setImmediate(resolve));
  return {
    w, dom, statuses, get sent() { return sent; },
    async tick(ms = 600) { now += ms; for (const fn of [...intervals.values()]) await fn(); await new Promise(resolve => setImmediate(resolve)); },
    disable() { enabled = false; for (const fn of listeners) fn({ type: 'apply', enabled: false }, { id: w.chrome.runtime.id }, () => {}); },
    close() { this.disable(); dom.window.close(); }
  };
}
test('synthetic examples: local rules recognize approval and reject progress, quotes, choices', async () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' }); dom.window.eval(sources[0]);
  for (const fixture of fixtures) assert.equal(dom.window.AutoOuiCore.localApproval(fixture.text), fixture.approval, fixture.text);
  dom.window.close();
});
test('sends Oui exactly once and never responds to the resulting user message', async () => {
  const h = await harness(); await h.tick(); await h.tick(); await h.tick();
  assert.equal(h.sent, 1); assert.match(h.w.document.querySelector('main').textContent, /Oui/); h.close();
});
test('ignores older approval when a later human turn exists', async () => {
  const h = await harness({ html: turn('assistant', 'Puis-je déployer ?', '1') + turn('user', 'Attends', '2') });
  await h.tick(); assert.equal(h.sent, 0); h.close();
});
test('does not overwrite a human draft, then approves once the field is empty', async () => {
  const h = await harness(); const input = h.w.document.querySelector('#prompt-textarea'); input.value = 'Ma réponse';
  await h.tick(); assert.equal(h.sent, 0); assert.equal(input.value, 'Ma réponse');
  input.value = ''; await h.tick(); assert.equal(h.sent, 1); h.close();
});
test('waits for streaming to stop and message text to settle', async () => {
  const h = await harness(); const stop = h.w.document.createElement('button'); stop.dataset.testid = 'stop-button'; h.w.document.body.append(stop);
  await h.tick(); assert.equal(h.sent, 0);
  h.w.document.querySelector('[data-message-author-role="assistant"]').textContent += ' Pour effectuer le contrôle.';
  await h.tick(100); stop.remove(); await h.tick(100); assert.equal(h.sent, 0);
  await h.tick(600); assert.equal(h.sent, 1); h.close();
});
test('non-approval agent message is never answered', async () => {
  const h = await harness({ html: turn('user', 'Travaille', '1') + turn('assistant', 'Les tests passent. Je continue avec l’étape suivante.', '2') });
  await h.tick(); await h.tick(); assert.equal(h.sent, 0); assert.equal(h.statuses.at(-1).state, 'En attente'); h.close();
});
test('pending reply is abandoned after disable, route change or new human message', async () => {
  for (const mutation of ['none', 'disable', 'navigate', 'human']) {
    const h = await harness(); const send = h.w.document.querySelector('[data-testid="send-button"]');
    const input = h.w.document.querySelector('#prompt-textarea');
    send.disabled = true;
    // The mutation happens right after Auto-Oui fills the field, while it waits for the Send button.
    input.addEventListener('input', () => {
      if (!input.value) return;
      if (mutation === 'disable') h.disable();
      if (mutation === 'navigate') h.w.history.pushState({}, '', '/c/other');
      if (mutation === 'human') h.w.document.querySelector('main').insertAdjacentHTML('beforeend', turn('user', 'Stop', '3'));
      send.disabled = false;
    });
    await h.tick(); await h.tick();
    // Control case: with no mutation the same flow does send, so the other cases really test the abort.
    assert.equal(h.sent, mutation === 'none' ? 1 : 0, mutation); assert.equal(input.value, '', mutation); h.close();
  }
});
test('approval cards click their actual Confirm button only once, even while task is running', async () => {
  const h = await harness({ html: turn('assistant', 'Je prépare la règle permanente.', '2') });
  const scope = h.w.document.querySelector('article');
  scope.insertAdjacentHTML('beforeend', '<section>Confirm custom rule<button id="approval">Confirm</button></section><button data-testid="stop-button">Stop</button>');
  let clicks = 0; h.w.document.querySelector('#approval').onclick = () => { clicks++; };
  await h.tick(); await h.tick(); await h.tick(); assert.equal(clicks, 1); assert.equal(h.sent, 0); h.close();
});
test('random confirmation dialog and quoted code do not count as agent approval', async () => {
  const h = await harness({ html: turn('assistant', '<pre>Puis-je déployer ?</pre>Voici du code.', '2') });
  h.w.document.body.insertAdjacentHTML('beforeend', '<div role="dialog">Choisir la couleur<button>Confirm</button></div>');
  await h.tick(); assert.equal(h.sent, 0); h.close();
});
test('clicking an approval card also handles its text request without sending a second Oui', async () => {
  const h = await harness();
  h.w.document.querySelector('article:last-child').insertAdjacentHTML('beforeend', '<section>Demande d’approbation<button id="approval">Approuver</button></section>');
  let clicks = 0; h.w.document.querySelector('#approval').onclick = () => { clicks++; };
  await h.tick(); await h.tick(); await h.tick();
  assert.equal(clicks, 1); assert.equal(h.sent, 0); h.close();
});
test('contenteditable ChatGPT composer is filled with Oui and submitted', async () => {
  const h = await harness(); const old = h.w.document.querySelector('textarea');
  old.outerHTML = '<div id="prompt-textarea" contenteditable="true" role="textbox"></div>';
  const send = h.w.document.querySelector('[data-testid="send-button"]'); let value = '';
  send.addEventListener('click', () => { value = h.w.document.querySelector('#prompt-textarea').textContent; h.w.document.querySelector('#prompt-textarea').textContent = ''; }, { capture: true });
  await h.tick(); assert.equal(value, 'Oui'); assert.equal(h.sent, 1); h.close();
});
test('missing send button leaves no automatic draft and no submission', async () => {
  const h = await harness(); h.w.document.querySelector('[data-testid="send-button"]').remove();
  await h.tick(); assert.equal(h.sent, 0); assert.equal(h.w.document.querySelector('#prompt-textarea').value, '');
  assert.equal(h.statuses.at(-1).state, 'Erreur'); h.close();
});
test('session deduplication survives re-injection', async () => {
  const h = await harness(); const original = h.w.document.querySelector('main').innerHTML;
  await h.tick(); h.w.document.querySelector('main').innerHTML = original;
  h.w.eval(sources[2]); await new Promise(r => setImmediate(r)); await h.tick();
  assert.equal(h.sent, 1); h.close();
});
test('long permission request with surrounding explanation sends Oui', async () => {
  const request = fixtures.find(item => item.text.startsWith('Pour terminer la tâche'));
  const h = await harness({ html: turn('user', 'Termine tout', '1') + turn('assistant', request.text, '2') });
  await h.tick(); assert.equal(h.sent, 1); h.close();
});
test('unrecognized message layout is reported and diagnostics show the real structures', async () => {
  const h = await harness({ html: '<section class="unknown-bubble">Autorises-tu cette capacité temporaire, limitée à ce lancement ?</section>' });
  await h.tick(); assert.equal(h.sent, 0); assert.equal(h.statuses.at(-1).state, 'Interface non reconnue');
  const report = h.w.AutoOuiAdapters.diagnostics(h.w.AutoOuiCore.DEFAULTS);
  assert.equal(report.matches.assistant.count, 0); assert.match(report.recentTextStructure.at(-1).snippet, /Autorises-tu/); h.close();
});
test('Work /dots markup: licence request is read and answered through the Send button', async () => {
  const request = fixtures.find(item => item.text.startsWith('Pour compiler l’application')).text + ' Les autres tâches continuent';
  const h = await harness({ work: true, html: workTurn('user', 'Lance les tâches', '1') + workTurn('assistant', request, '2') });
  await h.tick(); await h.tick();
  assert.equal(h.sent, 1); assert.equal(h.w.document.querySelector('article.message-row.self:last-child').textContent, 'Oui');
  h.close();
});
test('custom reply text from the settings is sent instead of Oui', async () => {
  const h = await harness({ reply: 'Oui, vas-y' });
  await h.tick(); assert.equal(h.sent, 1);
  assert.equal(h.w.document.querySelector('main article:last-child').textContent, 'Oui, vas-y'); h.close();
});
test('Work /dots user bubbles with assistant markdown style are never treated as agent requests', async () => {
  const h = await harness({ work: true, html: workTurn('assistant', 'Puis-je déployer ?', '1') + workTurn('user', 'Autorises-tu cette capacité ?', '2') });
  await h.tick(); assert.equal(h.sent, 0); h.close();
});
test('Work /dots own prior Oui blocks a repeated submission after reinjection', async () => {
  const h = await harness({ work: true, html: workTurn('user', 'Travaille', '1') + workTurn('assistant', 'Autorises-tu cette capacité temporaire ?', '2') });
  await h.tick(); h.w.eval(sources[2]); await new Promise(r => setImmediate(r)); await h.tick();
  assert.equal(h.sent, 1); h.close();
});
