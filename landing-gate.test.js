'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const ssSkipLanding = new Function('return ' + extractFunction(index, 'ssSkipLanding'))();

function loc(partial) {
  return Object.assign({ protocol: 'https:', search: '', hash: '' }, partial);
}
function storage(value) {
  return { getItem(k) { return k === 'sidelinesub.v1' ? value : null; } };
}
function session(value) {
  return { getItem(k) { return k === 'ss.app' ? value : null; } };
}
function media(standalone) {
  return function () { return { matches: !!standalone }; };
}
const nav = { standalone: false };
const ios = { standalone: true };

assert.strictEqual(ssSkipLanding(loc(), storage(null), session(null), nav, media(false)), false, 'first visit shows the landing');
assert.strictEqual(ssSkipLanding(loc(), storage('{"team":1}'), session(null), nav, media(false)), true, 'saved team opens the app');
assert.strictEqual(ssSkipLanding(loc({ search: '?app=1' }), storage(null), session(null), nav, media(false)), true);
assert.strictEqual(ssSkipLanding(loc({ hash: '#app' }), storage(null), session(null), nav, media(false)), true);
assert.strictEqual(ssSkipLanding(loc({ protocol: 'file:' }), storage(null), session(null), nav, media(false)), true);
assert.strictEqual(ssSkipLanding(loc(), storage(null), session(null), nav, media(true)), true, 'installed app opens the lineup');
assert.strictEqual(ssSkipLanding(loc(), storage(null), session(null), ios, media(false)), true);
assert.strictEqual(ssSkipLanding(loc(), storage(null), session('1'), nav, media(false)), true);

assert.strictEqual(ssSkipLanding(loc({ search: '?home=1' }), storage('{"team":1}'), session('1'), ios, media(true)), false, 'home=1 beats a saved team, the installed app, and an open session');
assert.strictEqual(ssSkipLanding(loc({ hash: '#home' }), storage('{"team":1}'), session('1'), nav, media(true)), false, '#home shows the landing');
assert.strictEqual(ssSkipLanding(loc({ search: '?app=1&home=1' }), storage('{"team":1}'), session(null), nav, media(false)), false);
assert.strictEqual(ssSkipLanding(loc({ search: '?home=1&app=1' }), storage('{"team":1}'), session(null), nav, media(false)), false);
assert.strictEqual(ssSkipLanding(loc({ search: '?app=1', hash: '#home' }), storage('{"team":1}'), session(null), nav, media(true)), false);
assert.strictEqual(ssSkipLanding(loc({ search: '?home=1', hash: '#app' }), storage('{"team":1}'), session(null), nav, media(false)), false);
assert.strictEqual(ssSkipLanding(loc({ search: '?foo=1&home=1' }), storage('{"team":1}'), session(null), nav, media(false)), false);
assert.strictEqual(ssSkipLanding(loc({ protocol: 'file:', search: '?home=1' }), storage('{"team":1}'), session(null), nav, media(false)), false);

assert.strictEqual(ssSkipLanding(loc({ search: '?home=2' }), storage('{"team":1}'), session(null), nav, media(false)), true);
assert.strictEqual(ssSkipLanding(loc({ search: '?homework=1' }), storage('{"team":1}'), session(null), nav, media(false)), true);
assert.strictEqual(ssSkipLanding(loc({ search: '?foo=home=1' }), storage('{"team":1}'), session(null), nav, media(false)), true);
assert.strictEqual(ssSkipLanding(loc({ hash: '#homepage' }), storage('{"team":1}'), session(null), nav, media(false)), true);
assert.strictEqual(ssSkipLanding(loc({ hash: '#Home' }), storage('{"team":1}'), session(null), nav, media(false)), true);

assert.strictEqual(ssSkipLanding(loc({ search: '?home=1' }), { getItem() { throw new Error('blocked'); } }, session('1'), nav, media(true)), false, 'home=1 does not need storage');
assert.strictEqual(ssSkipLanding(loc(), { getItem() { throw new Error('blocked'); } }, session(null), nav, media(false)), true, 'storage failure still opens the app');

const enter = index.slice(index.indexOf('function ssEnterApp'));
assert.ok(enter.includes('if(!S.team){ sheetTeam(true); }'));
assert.ok(enter.indexOf('if(!S.team)') < enter.indexOf('else if(!S.role)'));
assert.ok(enter.includes("sessionStorage.setItem('ss.app','1')"));
assert.ok(enter.includes('ssEnterApp(true)'), 'landing buttons enter through the app opener');
assert.ok(enter.includes("S.tab='game'"), 'opening from the landing shows the lineup');
assert.ok(enter.indexOf('if(document.documentElement.classList.contains(\'app-on\')) ssEnterApp();') > 0);

console.log('landing gate tests passed');
