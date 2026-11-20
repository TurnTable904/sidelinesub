'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const host = require('./canonical-host.js');

function mem(initial) {
  const map = Object.assign({}, initial || {});
  return {
    get length() { return Object.keys(map).length; },
    key(i) { return Object.keys(map)[i]; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem(k, v) { map[k] = String(v); },
    dump() { return Object.assign({}, map); }
  };
}
function loc(partial) {
  return Object.assign({ protocol: 'https:', hostname: 'www.sidelinesub.com', pathname: '/', search: '', hash: '' }, partial);
}

const pages = ['index.html', 'app-fragment.html', '404.html'];
const src = fs.readFileSync(path.join(__dirname, 'canonical-host.js'), 'utf8');
for (const page of pages) {
  const html = fs.readFileSync(path.join(__dirname, page), 'utf8');
  assert.ok(html.includes(src), page + ' is missing the canonical-host script');
}

assert.strictEqual(host.apply(loc(), mem(), '', '').redirect, null);
assert.strictEqual(host.apply(loc({ pathname: '/index.html', search: '?a=1', hash: '#b' }), mem(), '', '').redirect, null);

assert.strictEqual(
  host.apply(loc({ protocol: 'http:' }), mem(), '', '').redirect,
  'https://www.sidelinesub.com/'
);
assert.strictEqual(
  host.apply(loc({
    protocol: 'https:',
    hostname: 'turntable904.github.io',
    pathname: '/sidelinesub/',
    search: '',
    hash: ''
  }), mem(), '', '').redirect,
  'https://www.sidelinesub.com/'
);
assert.strictEqual(
  host.apply(loc({
    protocol: 'https:',
    hostname: 'turntable904.github.io',
    pathname: '/sidelinesub/index.html',
    search: '?team=abc',
    hash: '#game'
  }), mem(), '', '').redirect,
  'https://www.sidelinesub.com/index.html?team=abc#game'
);
assert.strictEqual(
  host.apply(loc({ protocol: 'https:', hostname: 'turntable904.github.io', pathname: '/sidelinesub' }), mem(), '', '').redirect,
  'https://www.sidelinesub.com/'
);
assert.strictEqual(
  host.apply(loc({ protocol: 'https:', hostname: 'sidelinesub.com', pathname: '/foo', search: '?x=1', hash: '#y' }), mem(), '', '').redirect,
  'https://www.sidelinesub.com/foo?x=1#y'
);
assert.strictEqual(
  host.apply(loc({ protocol: 'http:', hostname: 'sidelinesub.com', pathname: '/' }), mem(), '', '').redirect,
  'https://www.sidelinesub.com/'
);
assert.strictEqual(
  host.apply(loc({ protocol: 'https:', hostname: 'turntable904.github.io', pathname: '/sidelinesubfoo' }), mem(), '', '').redirect,
  'https://www.sidelinesub.com/sidelinesubfoo'
);

for (const hostname of ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', '192.168.1.20', '10.0.0.5', '172.16.0.8', 'app.localhost', 'phone.local']) {
  assert.strictEqual(host.apply(loc({ protocol: 'http:', hostname: hostname, pathname: '/sidelinesub/index.html' }), mem(), '', '').redirect, null, hostname);
}
assert.strictEqual(host.apply(loc({ protocol: 'file:', hostname: '', pathname: '/android_asset/index.html' }), mem(), '', '').redirect, null);
assert.ok(host.apply(loc({ protocol: 'http:', hostname: '172.15.5.5', pathname: '/' }), mem(), '', '').redirect);

const store = mem({
  'sidelinesub.v1': '{"team":1}',
  'sidelinesub.groups.ABC': '{"p1":"core"}',
  'sidelinesub.auth.v1': '{"refresh":"r"}',
  'ss.hint': '1',
  'other': 'no'
});
const packed = host.apply(loc({ protocol: 'http:', hostname: 'www.sidelinesub.com' }), store, 'keep', '');
assert.ok(packed.name.indexOf('ssmigrate:v1:') === 0);
assert.ok(!packed.name.includes('"other"'));
assert.ok(packed.name.includes('sidelinesub.groups.ABC'));

const dest = mem();
const imported = host.apply(loc(), dest, packed.name, 'https://turntable904.github.io/sidelinesub/');
assert.strictEqual(imported.redirect, null);
assert.strictEqual(imported.name, '');
assert.strictEqual(dest.getItem('sidelinesub.v1'), '{"team":1}');
assert.strictEqual(dest.getItem('sidelinesub.groups.ABC'), '{"p1":"core"}');
assert.strictEqual(dest.getItem('sidelinesub.auth.v1'), '{"refresh":"r"}');
assert.strictEqual(dest.getItem('ss.hint'), '1');
assert.strictEqual(dest.getItem('other'), null);

const existing = mem({ 'sidelinesub.v1': '{"keep":true}' });
const skipped = host.apply(loc(), existing, packed.name, 'http://www.sidelinesub.com/');
assert.strictEqual(existing.getItem('sidelinesub.v1'), '{"keep":true}');
assert.strictEqual(skipped.name, '');

const poisoned = mem();
const rejected = host.apply(loc(), poisoned, packed.name, 'https://evil.github.io/sidelinesub/');
assert.strictEqual(poisoned.getItem('sidelinesub.v1'), null);
assert.strictEqual(rejected.name, '');

const stranger = mem();
host.apply(loc(), stranger, 'ssmigrate:v1:' + JSON.stringify({ 'sidelinesub.v1': 'x', stolen: 'y' }), 'https://sidelinesub.com/');
assert.strictEqual(stranger.getItem('sidelinesub.v1'), 'x');
assert.strictEqual(stranger.getItem('stolen'), null);

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
assert.strictEqual(manifest.id, 'https://www.sidelinesub.com/');
assert.strictEqual(manifest.start_url, '/?app=1');
assert.ok(manifest.start_url.startsWith('/'));
assert.ok(!manifest.start_url.includes('/sidelinesub'));
assert.strictEqual(manifest.scope, '/');
assert.ok(manifest.icons.every(icon => icon.src.startsWith('/')));

const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
assert.ok(sw.includes("var CACHE = 'sidelinesub-root-3'"));
assert.ok(sw.includes("'/index.html'"));
assert.ok(sw.includes("caches.delete"));
assert.ok(!sw.includes("'/sidelinesub/index.html'"));
assert.ok(sw.includes("'/sidelinesub/'"));
assert.strictEqual(fs.readFileSync(path.join(__dirname, 'CNAME'), 'utf8').trim(), 'www.sidelinesub.com');

const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.ok(index.includes('rel="canonical" href="https://www.sidelinesub.com/"'));
assert.ok(index.includes('content="https://www.sidelinesub.com/"'));
assert.ok(index.includes("register('/sw.js',{scope:'/'})"));
assert.ok(!index.includes('https://turntable904.github.io/sidelinesub'));
const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
assert.ok(readme.includes('https://www.sidelinesub.com/'));
assert.ok(!readme.includes('https://turntable904.github.io/sidelinesub/'));
const migration = fs.readFileSync(path.join(__dirname, 'MIGRATION.md'), 'utf8');
assert.ok(migration.includes('https://www.sidelinesub.com/'));
assert.ok(!migration.includes('https://turntable904.github.io/sidelinesub/'));

console.log('canonical-host tests passed');
