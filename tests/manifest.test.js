// Static checks: MV3 manifest, minimal permissions, no remote code, sites registry in sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import vm from 'node:vm';
import * as jev from '../extension/jev.js';
const dir = new URL('../extension/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', dir), 'utf8'));
const scripts = (await readdir(dir)).filter(name => /\.(js|html)$/.test(name));
const sources = Object.fromEntries(await Promise.all(scripts.map(async name => [name, await readFile(new URL(name, dir), 'utf8')])));
function loadSites() {
  const context = {}; vm.createContext(context); context.globalThis = context;
  vm.runInContext(sources['sites.js'], context);
  return context.AutoOuiSites;
}
const siteOrigins = [...loadSites().allOrigins()];
test('manifest is MV3 with minimal permissions', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined, 'no permanent host access (TypeSafe included)');
  assert.equal(manifest.content_scripts, undefined, 'scripts are injected only in tabs the user enables');
  assert.equal(manifest.content_security_policy, undefined, 'default MV3 CSP (no remote code)');
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.ok(manifest.description.length <= 132, 'Chrome limits the description to 132 characters');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});
test('every file referenced by the manifest exists', async () => {
  const files = [manifest.background.service_worker, manifest.action.default_popup,
    ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  for (const file of files) await access(new URL(file, dir));
});
test('optional host permissions = sites registry + the TypeSafe API host, nothing else', () => {
  const expected = [...siteOrigins.map(origin => origin + '/*'), jev.API_PERMISSION].sort();
  assert.deepEqual([...manifest.optional_host_permissions].sort(), expected);
  for (const origin of expected) assert.match(origin, /^https:\/\/[a-z0-9.-]+\/\*$/);
  assert.equal(jev.API_PERMISSION, 'https://api.typesafe.ai/*');
  assert.ok(jev.API_URL.startsWith(jev.API_ORIGIN + '/'));
});
test('each site defines the required selectors', () => {
  for (const site of loadSites().SITES) {
    for (const key of ['assistant', 'user', 'input', 'send', 'stop']) assert.ok(site.selectors[key], `${site.id}.${key}`);
  }
});
test('no remote code or eval; network calls only in jev.js, only to the TypeSafe API', () => {
  const allowedUrls = new Set([...siteOrigins, jev.API_ORIGIN]);
  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|sendBeacon|importScripts|\beval\s*\(|new Function\s*\(/, name);
    assert.doesNotMatch(source, /<script[^>]+src=["']https?:/i, name);
    assert.doesNotMatch(source, /import\s*\(?\s*['"]https?:/, name);
    assert.doesNotMatch(source, /from\s+['"]https?:/, name);
    if (name !== 'jev.js') assert.doesNotMatch(source, /\bfetch\b/, name + ' must not use fetch');
    for (const url of source.match(/https?:\/\/[a-z0-9.-]+/gi) || []) assert.ok(allowedUrls.has(url), `${name}: unexpected URL ${url}`);
  }
  assert.equal((sources['jev.js'].match(/\bfetchImpl\(/g) || []).length, 1, 'a single fetch call site');
  assert.match(sources['jev.js'], /fetchImpl\(API_URL,/);
});
test('the TypeSafe key is stored only in chrome.storage.local, never in sync or session storage', () => {
  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /storage\.sync/, name);
    assert.doesNotMatch(source, /console\.(log|info|warn|error|debug)/, name + ': no console logging');
  }
});
