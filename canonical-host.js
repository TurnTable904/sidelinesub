/* Canonical host for the website.
   This file is inlined in index.html, app-fragment.html, and 404.html
   so a bookmark on the old host can redirect before any other request.
   Keep those three copies identical to this file. */
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.SidelineHost = api;
    api.boot();
  }
})(function () {
  var CANON_HOST = 'www.sidelinesub.com';
  var MARK = 'ssmigrate:v1:';
  var MAX = 500000;
  var ALLOW_REF = {
    'turntable904.github.io': 1,
    'sidelinesub.com': 1,
    'www.sidelinesub.com': 1
  };

  function devHost(h) {
    if (!h) return true;
    h = String(h).toLowerCase();
    if (h.charAt(0) === '[' && h.charAt(h.length - 1) === ']') h = h.slice(1, -1);
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
    if (/\.localhost$/.test(h) || /\.local$/.test(h)) return true;
    if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
    if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;
    return false;
  }

  function allowKey(k) {
    return k === 'sidelinesub.v1' || k === 'sidelinesub.auth.v1' || k === 'ss.hint' ||
      (typeof k === 'string' && k.indexOf('sidelinesub.groups.') === 0);
  }

  function leaving(loc) {
    if (!loc || loc.protocol === 'file:') return false;
    var h = (loc.hostname || '').toLowerCase();
    if (devHost(h)) return false;
    if (h === CANON_HOST && loc.protocol === 'https:') return false;
    return true;
  }

  function target(loc) {
    var path = loc.pathname || '/';
    if (path === '/sidelinesub') path = '/';
    else if (path.indexOf('/sidelinesub/') === 0) path = path.slice('/sidelinesub'.length) || '/';
    if (!path || path.charAt(0) !== '/') path = '/' + (path || '');
    return 'https://' + CANON_HOST + path + (loc.search || '') + (loc.hash || '');
  }

  function pack(storage) {
    try {
      if (!storage || typeof storage.length !== 'number') return '';
      var data = {};
      var n = 0;
      for (var i = 0; i < storage.length; i++) {
        var k = storage.key(i);
        if (!allowKey(k)) continue;
        var v = storage.getItem(k);
        if (typeof v !== 'string') continue;
        data[k] = v;
        n++;
      }
      if (!n) return '';
      var raw = JSON.stringify(data);
      if (raw.length > MAX) return '';
      return raw;
    } catch (e) {
      return '';
    }
  }

  function refHost(referrer) {
    try {
      if (!referrer) return '';
      return new URL(referrer).hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function accept(storage, name, referrer) {
    try {
      if (!name || name.indexOf(MARK) !== 0) return name || '';
      var raw = name.slice(MARK.length);
      if (!storage || raw.length > MAX) return '';
      if (!ALLOW_REF[refHost(referrer)]) return '';
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Object.prototype.toString.call(data) !== '[object Object]') return '';
      if (storage.getItem('sidelinesub.v1')) return '';
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!allowKey(k) || typeof data[k] !== 'string') continue;
        storage.setItem(k, data[k]);
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function apply(loc, storage, name, referrer) {
    name = name || '';
    if (!leaving(loc)) {
      if (loc && loc.protocol === 'https:' && (loc.hostname || '').toLowerCase() === CANON_HOST) {
        name = accept(storage, name, referrer);
      }
      return { redirect: null, name: name, stay: true };
    }
    var packed = pack(storage);
    if (packed) name = MARK + packed;
    return { redirect: target(loc), name: name, stay: false };
  }

  function boot() {
    try {
      var r = apply(window.location, window.localStorage, window.name || '', (document && document.referrer) || '');
      if (r.name !== window.name) window.name = r.name;
      if (r.redirect) {
        window.__ssLeaving = true;
        window.location.replace(r.redirect);
      } else {
        window.__ssStay = true;
      }
    } catch (e) {}
  }

  return {
    CANON_HOST: CANON_HOST,
    devHost: devHost,
    allowKey: allowKey,
    apply: apply,
    boot: boot
  };
});
