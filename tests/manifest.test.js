// Static checks: MV3 manifest, minimal permissions, no remote code, sites registry in sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import vm from 'node:vm';
const dir = new URL('../extension/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', dir), 'utf8'));
const scripts = (await readdir(dir)).filter(name => /\.(js|html)$/.test(name));
const sources = Object.fromEntries(await Promise.all(scripts.map(async name => [name, await readFile(new URL(name, dir), 'utf8')])));
function loadSites() {
  const context = {}; vm.createContext(context); context.globalThis = context;
  vm.runInContext(sources['sites.js'], context);
  return context.AutoOuiSites;
}
test('manifest is MV3 with minimal permissions', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined, 'no permanent host access');
  assert.equal(manifest.content_scripts, undefined, 'scripts are injected only in tabs the user enables');
  assert.equal(manifest.content_security_policy, undefined, 'default MV3 CSP (no remote code)');
  assert.equal(manifest.background.service_worker, 'background.js');
});
test('every file referenced by the manifest exists', async () => {
  const files = [manifest.background.service_worker, manifest.action.default_popup,
    ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  for (const file of files) await access(new URL(file, dir));
});
test('optional host permissions match the sites registry exactly', () => {
  const origins = [...loadSites().allOrigins()].map(origin => origin + '/*').sort();
  assert.deepEqual([...manifest.optional_host_permissions].sort(), origins);
  for (const origin of origins) assert.match(origin, /^https:\/\/[a-z0-9.-]+\/\*$/);
});
test('each site defines the required selectors', () => {
  for (const site of loadSites().SITES) {
    for (const key of ['assistant', 'user', 'input', 'send', 'stop']) assert.ok(site.selectors[key], `${site.id}.${key}`);
  }
});
test('no remote code, network calls or eval in extension sources', () => {
  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|importScripts|\beval\s*\(|new Function\s*\(/, name);
    assert.doesNotMatch(source, /<script[^>]+src=["']https?:/i, name);
    assert.doesNotMatch(source, /import\s*\(?\s*['"]https?:/, name);
  }
});
