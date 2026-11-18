/* Team photos. Bytes go to Firebase Storage. The Realtime Database keeps only
   the record. Originals are not uploaded. Canvas re-encoding drops EXIF,
   including location. Coach status for Storage rules comes from syncCoachClaim,
   which copies teams/{code}/coaches/{uid} into the sign-in token. */
(function () {
  var BUCKET = 'bridge-blue.firebasestorage.app';
  var PROJECT = 'bridge-blue';
  var REGION = 'us-central1';
  var MAX_EDGE = 1600;
  var THUMB_EDGE = 320;
  var MAX_BYTES = 1400 * 1024;
  var CONSENT_KEY = 'sidelinesub.photoConsent';

  function emuOn() {
    try {
      var h = location.hostname;
      if (h === 'www.sidelinesub.com' || h === 'sidelinesub.com') return false;
      if (/[?&]emu=1(?:&|$)/.test(location.search)) localStorage.setItem('sidelinesub.emu', '1');
      return localStorage.getItem('sidelinesub.emu') === '1';
    } catch (e) { return false; }
  }

  if (typeof window !== 'undefined' && window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      if (!emuOn() || typeof input !== 'string') return origFetch(input, init);
      return origFetch(rewriteEmu(input), init);
    };
  }

  function rewriteEmu(url) {
    var out = url;
    if (out.indexOf('https://identitytoolkit.googleapis.com/') === 0) {
      out = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/' + out.slice('https://identitytoolkit.googleapis.com/'.length);
    } else if (out.indexOf('https://securetoken.googleapis.com/') === 0) {
      out = 'http://127.0.0.1:9099/securetoken.googleapis.com/' + out.slice('https://securetoken.googleapis.com/'.length);
    } else if (out.indexOf('https://bridge-blue-default-rtdb.firebaseio.com') === 0) {
      out = 'http://127.0.0.1:9000' + out.slice('https://bridge-blue-default-rtdb.firebaseio.com'.length);
      out += (out.indexOf('?') >= 0 ? '&' : '?') + 'ns=' + PROJECT + '-default-rtdb';
    }
    return out;
  }

  function storageRoot() {
    return emuOn()
      ? 'http://127.0.0.1:9199/v0/b/' + BUCKET
      : 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET;
  }
  function functionUrl() {
    return emuOn()
      ? 'http://127.0.0.1:5001/' + PROJECT + '/' + REGION + '/syncCoachClaim'
      : 'https://' + REGION + '-' + PROJECT + '.cloudfunctions.net/syncCoachClaim';
  }

  var PHOTO = { items: [], reports: [], fetchedAt: 0, loading: false, uploading: false, job: null, viewer: null, coachReady: false, pendingCount: 0, urls: new Map() };

  function groupPhotos(items) {
    var map = {};
    var order = [];
    (items || []).forEach(function (p) {
      var event = String(p.event || 'Team');
      if (!map[event]) {
        map[event] = { event: event, newest: 0, team: [], parents: [] };
        order.push(event);
      }
      var g = map[event];
      var t = +p.created || 0;
      if (t > g.newest) g.newest = t;
      if (p.role === 'coach') g.team.push(p);
      else g.parents.push(p);
    });
    order.sort(function (a, b) { return map[b].newest - map[a].newest; });
    return order.map(function (key) {
      var g = map[key];
      g.team.sort(function (a, b) { return (+b.created || 0) - (+a.created || 0); });
      g.parents.sort(function (a, b) { return (+b.created || 0) - (+a.created || 0); });
      return g;
    });
  }

  function photoId() {
    return 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function consented() {
    try { return localStorage.getItem(CONSENT_KEY) === (typeof CODE === 'function' ? CODE() : ''); }
    catch (e) { return false; }
  }
  function rememberConsent() {
    try { localStorage.setItem(CONSENT_KEY, CODE()); } catch (e) {}
  }

  function decodeImage(file) {
    var heic = /heic|heif/i.test(file.type || '') || /\.heic$|\.heif$/i.test(file.name || '');
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
        return decodeViaElement(file, heic);
      });
    }
    return decodeViaElement(file, heic);
  }
  function decodeViaElement(file, heic) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error(heic
          ? 'This phone cannot read HEIC photos. Set the camera to Most Compatible, or choose a JPEG.'
          : 'Could not read that photo. Try a JPEG.'));
      };
      img.src = url;
    });
  }
  function drawBlob(source, maxEdge, quality) {
    var w = source.width, h = source.height;
    var scale = Math.min(1, maxEdge / Math.max(w, h, 1));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext('2d').drawImage(source, 0, 0, cw, ch);
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
  }
  async function shrink(source, maxEdge) {
    var quality = 0.82;
    var blob = await drawBlob(source, maxEdge, quality);
    while (blob && blob.size > MAX_BYTES && quality > 0.45) {
      quality -= 0.12;
      blob = await drawBlob(source, maxEdge, quality);
    }
    if (!blob) throw new Error('Could not prepare that photo.');
    if (blob.size > MAX_BYTES) throw new Error('That photo is still too large after resizing.');
    return blob;
  }

  function authHeader() {
    return { Authorization: 'Firebase ' + AUTH.token };
  }
  function uploadBlob(path, blob, metadata, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var boundary = 'sideline' + Date.now();
      xhr.open('POST', storageRoot() + '/o?name=' + encodeURIComponent(path));
      xhr.setRequestHeader('Authorization', 'Firebase ' + AUTH.token);
      xhr.setRequestHeader('Content-Type', 'multipart/related; boundary=' + boundary);
      xhr.setRequestHeader('X-Goog-Upload-Protocol', 'multipart');
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText || '{}')); }
          catch (e) { resolve({}); }
        } else {
          reject(new Error(uploadError(xhr.status, xhr.responseText)));
        }
      };
      xhr.onerror = function () { reject(new Error('Could not reach photo storage.')); };
      var meta = JSON.stringify({ name: path, contentType: 'image/jpeg', metadata: metadata });
      var head = '--' + boundary + '\r\nContent-Type: application/json; charset=utf-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: image/jpeg\r\n\r\n';
      var tail = '\r\n--' + boundary + '--';
      xhr.send(new Blob([head, blob, tail]));
    });
  }
  function uploadError(status, body) {
    if (status === 401 || status === 403) return 'Not allowed to save that photo.';
    return 'Upload failed (' + status + ').';
  }
  function fetchBlob(path) {
    if (PHOTO.urls.has(path)) return Promise.resolve(PHOTO.urls.get(path));
    return fetch(storageRoot() + '/o/' + encodeURIComponent(path) + '?alt=media', { headers: authHeader(), cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('load ' + r.status);
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      PHOTO.urls.set(path, url);
      if (PHOTO.urls.size > 120) {
        var first = PHOTO.urls.keys().next().value;
        URL.revokeObjectURL(PHOTO.urls.get(first));
        PHOTO.urls.delete(first);
      }
      return url;
    });
  }
  function patchStatus(path, metadata) {
    return fetch(storageRoot() + '/o/' + encodeURIComponent(path), {
      method: 'PATCH',
      headers: { Authorization: 'Firebase ' + AUTH.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'image/jpeg', metadata: metadata })
    }).then(function (r) {
      if (!r.ok) throw new Error('Not allowed to update that photo.');
    });
  }
  function deleteObject(path) {
    return fetch(storageRoot() + '/o/' + encodeURIComponent(path), { method: 'DELETE', headers: authHeader() }).then(function (r) {
      if (!r.ok && r.status !== 404) throw new Error('Could not delete the photo file.');
    });
  }

  async function syncCoachClaim() {
    if (typeof CODE !== 'function' || !CODE() || !AUTH.token) return false;
    try {
      var r = await fetch(functionUrl(), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + AUTH.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: CODE() })
      });
      if (!r.ok) { PHOTO.coachReady = false; return false; }
      var d = await r.json();
      AUTH.exp = 0;
      await ensureAuth();
      PHOTO.coachReady = !!(d && d.ok && d.coach);
      return PHOTO.coachReady;
    } catch (e) {
      PHOTO.coachReady = false;
      return false;
    }
  }

  function dbRoot() {
    return S.syncUrl.replace(/\/+$/, '');
  }
  function asList(node) {
    if (!node || typeof node !== 'object') return [];
    return Object.keys(node).map(function (id) {
      var row = node[id];
      if (!row || typeof row !== 'object') return null;
      row.id = id;
      return row;
    }).filter(Boolean);
  }
  async function loadPhotoIndex() {
    if (!CODE() || PHOTO.loading) return;
    PHOTO.loading = true;
    try {
      await ensureAuth();
      var approvedReq = await fbFetch(dbRoot() + '/teams/' + encodeURIComponent(CODE()) + '/photos.json');
      var approved = approvedReq.ok ? await approvedReq.json() : null;
      var pending = [];
      if (isViewer()) {
        var mine = await fbFetch(dbRoot() + '/photoPending/' + encodeURIComponent(CODE()) + '/' + encodeURIComponent(AUTH.uid) + '.json');
        pending = mine.ok ? asList(await mine.json()) : [];
      } else {
        var all = await fbFetch(dbRoot() + '/photoPending/' + encodeURIComponent(CODE()) + '.json');
        var tree = all.ok ? await all.json() : null;
        if (tree && typeof tree === 'object') {
          Object.keys(tree).forEach(function (uid) {
            pending = pending.concat(asList(tree[uid]));
          });
        }
        var reports = await fbFetch(dbRoot() + '/photoReports/' + encodeURIComponent(CODE()) + '.json');
        PHOTO.reports = reports.ok ? asList(await reports.json()) : [];
      }
      PHOTO.items = asList(approved).concat(pending);
      PHOTO.pendingCount = pending.length;
      PHOTO.fetchedAt = Date.now();
    } catch (e) {
      PHOTO.error = 'Could not load photos.';
    }
    PHOTO.loading = false;
    if (typeof S !== 'undefined' && S.tab === 'photos' && !PHOTO.uploading) render();
  }

  function eventChoices() {
    var out = ['Team', 'Practice'];
    if (S.game && S.game.opponent) out.push(('Today vs ' + S.game.opponent).slice(0, 60));
    (S.history || []).slice(0, 12).forEach(function (g) {
      var when = g && g.date ? new Date(g.date) : null;
      var label = (when && !isNaN(when.getTime()) ? when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Game');
      if (g && g.opponent) label += ' vs ' + g.opponent;
      label = String(label).slice(0, 60);
      if (out.indexOf(label) < 0) out.push(label);
    });
    return out;
  }
  function card(p) {
    var wait = p.status === 'pending' ? '<div class="phwait">Waiting</div>' : '';
    return '<button class="phcard" data-a="photoopen" data-id="' + esc(p.id) + '"><img alt="" data-path="' + esc(p.thumb || p.path) + '">' + wait + '<div class="phcap">' + esc(p.caption || (p.role === 'coach' ? 'Team' : 'Parent')) + '</div></button>';
  }
  function rowHtml(list) {
    if (!list.length) return '';
    return '<div class="phgrid">' + list.map(card).join('') + '</div>';
  }
  function viewPhotos() {
    if (!CODE()) return '<div class="card">Join a team to see photos.</div>';
    if (!PHOTO.loading && Date.now() - PHOTO.fetchedAt > 3000) loadPhotoIndex();
    var groups = groupPhotos(PHOTO.items);
    var html = '<div class="row"><button class="btn act grow" data-a="photonew">Add photo</button></div>';
    html += '<div class="sub2" style="font-weight:700;color:var(--mut)">Photos are shared with anyone who has the team code. Location data is removed on this phone. Originals are not kept.</div>';
    if (!isViewer() && PHOTO.reports.length) {
      html += '<div class="card"><div class="lbl">Reports</div>' + PHOTO.reports.map(function (r) {
        return '<div class="row"><div class="grow"><b>' + esc(r.event || 'Photo') + '</b><div class="sub2">' + esc(r.text || '') + '</div></div><button class="btn sm ghost" data-a="photoreportdismiss" data-id="' + esc(r.id) + '">Dismiss</button></div>';
      }).join('') + '</div>';
    }
    if (!isViewer()) {
      var pending = PHOTO.items.filter(function (p) { return p.status === 'pending'; });
      if (pending.length) {
        html += '<div class="lbl">Needs approval</div><div class="card">' + pending.map(function (p) {
          return '<div class="row"><img alt="" data-path="' + esc(p.thumb || p.path) + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px"><div class="grow"><b>' + esc(p.name || 'Parent') + '</b><div class="sub2">' + esc(p.event || '') + (p.caption ? ' · ' + esc(p.caption) : '') + '</div></div><button class="btn sm act" data-a="photoapprove" data-id="' + esc(p.id) + '" data-uid="' + esc(p.uid) + '">Approve</button><button class="btn sm ghost" data-a="photodel" data-id="' + esc(p.id) + '" data-uid="' + esc(p.uid) + '">Delete</button></div>';
        }).join('') + '</div>';
      }
    }
    if (PHOTO.error) html += '<div class="warn">' + esc(PHOTO.error) + '</div>';
    if (!groups.length && !PHOTO.loading) html += '<div class="card">No photos yet.</div>';
    if (PHOTO.loading && !groups.length) html += '<div class="card">Loading photos…</div>';
    groups.forEach(function (g) {
      html += '<div class="lbl">' + esc(g.event) + '</div>';
      if (g.team.length) html += '<div class="sub2" style="font-weight:800">Team</div>' + rowHtml(g.team);
      if (g.parents.length) html += '<div class="sub2" style="font-weight:800">Parents</div>' + rowHtml(g.parents);
    });
    (window.queueMicrotask || function (fn) { setTimeout(fn, 0); })(hydratePhotos);
    return html;
  }
  function hydratePhotos() {
    document.querySelectorAll('img[data-path]').forEach(function (img) {
      var path = img.getAttribute('data-path');
      if (!path || img.getAttribute('data-asked') === path) return;
      img.setAttribute('data-asked', path);
      if (PHOTO.urls.has(path)) { img.src = PHOTO.urls.get(path); return; }
      fetchBlob(path).then(function (url) { if (img.isConnected) img.src = url; }).catch(function () {});
    });
  }

  function sheetUpload(message) {
    var choices = eventChoices().map(function (label) {
      return '<option>' + esc(label) + '</option>';
    }).join('');
    var consent = '';
    if (isViewer() && !consented()) {
      consent = '<label class="row" style="font-weight:700"><input id="photo_ok" type="checkbox" style="width:22px;height:22px"> Photos of players are visible to anyone with this team code. Only upload photos you have permission to share.</label>';
    }
    openSheet('<h2>Add photo</h2>'
      + '<div class="sub2" style="font-weight:700;color:var(--mut)">The photo is resized on this phone. Location information is removed. The original file is not uploaded.</div>'
      + (isViewer() ? '<div class="sub2" style="font-weight:800">A coach approves parent photos before the rest of the team sees them.</div>' : '')
      + '<input id="photo_file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif">'
      + '<div class="field"><label for="photo_event">Game or event</label><select id="photo_event">' + choices + '</select></div>'
      + '<div class="field"><label for="photo_caption">Caption (optional)</label><input id="photo_caption" maxlength="140" placeholder="Optional"></div>'
      + consent
      + '<div class="phbar" id="photo_bar" hidden><span id="photo_fill"></span></div>'
      + '<div id="photo_err" class="sub2" style="color:var(--bad);font-weight:800">' + esc(message || '') + '</div>'
      + '<button class="btn act big wide" data-a="photogo">Upload</button>'
      + (PHOTO.job ? '<button class="btn ghost wide" data-a="photoretry">Retry last upload</button>' : '')
      + '<button class="btn ghost wide" data-a="close">Cancel</button>');
  }
  function setProgress(frac) {
    var bar = document.getElementById('photo_bar');
    var fill = document.getElementById('photo_fill');
    if (!bar || !fill) return;
    bar.hidden = false;
    fill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  }
  function uploaderName() {
    if (isViewer()) return String(S.chatName || 'Parent').slice(0, 40);
    return String((S.team && S.team.coach) || S.chatName || 'Coach').slice(0, 40);
  }
  async function prepareFile(file) {
    var source = await decodeImage(file);
    try {
      var main = await shrink(source, MAX_EDGE);
      var thumb = await shrink(source, THUMB_EDGE);
      return { main: main, thumb: thumb };
    } finally {
      if (source && source.close) { try { source.close(); } catch (e) {} }
    }
  }
  async function runUpload(job) {
    if (PHOTO.uploading) return;
    PHOTO.uploading = true;
    PHOTO.job = job;
    var id = job.id;
    var meta = {
      owner: AUTH.uid,
      role: job.role,
      status: job.status
    };
    try {
      setProgress(0.02);
      await uploadBlob(job.path, job.main, meta, function (p) { setProgress(p * 0.7); });
      await uploadBlob(job.thumb, job.thumbBlob, meta, function (p) { setProgress(0.7 + p * 0.25); });
      var record = {
        uid: AUTH.uid,
        role: job.role,
        status: job.status,
        event: job.event,
        caption: job.caption,
        path: job.path,
        thumb: job.thumb,
        created: job.created,
        name: job.name
      };
      var url = job.status === 'approved'
        ? dbRoot() + '/teams/' + encodeURIComponent(CODE()) + '/photos/' + id + '.json'
        : dbRoot() + '/photoPending/' + encodeURIComponent(CODE()) + '/' + encodeURIComponent(AUTH.uid) + '/' + id + '.json';
      var saved = await fbFetch(url, { method: 'PUT', body: JSON.stringify(record) });
      if (!saved.ok) throw new Error(saved.status === 401 || saved.status === 403 ? 'Not allowed to save that photo.' : 'Could not save the photo record.');
      setProgress(1);
      PHOTO.job = null;
      PHOTO.fetchedAt = 0;
      PHOTO.uploading = false;
      closeSheet();
      await loadPhotoIndex();
    } catch (e) {
      PHOTO.uploading = false;
      sheetUpload((e && e.message) || 'Upload failed.');
    }
  }
  async function startUpload(retry) {
    if (!CODE()) return;
    if (!(await ensureAuth()) || !AUTH.uid) { sheetUpload('Sign-in failed. Try again when you have a signal.'); return; }
    var fileInput = document.getElementById('photo_file');
    var eventEl = document.getElementById('photo_event');
    var captionEl = document.getElementById('photo_caption');
    if (!retry) {
      if (isViewer() && !consented()) {
        var box = document.getElementById('photo_ok');
        if (!box || !box.checked) { sheetUpload('Confirm the notice before uploading.'); return; }
        rememberConsent();
      }
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) { sheetUpload('Choose a photo first.'); return; }
      if (!isViewer()) {
        var ready = PHOTO.coachReady || await syncCoachClaim();
        if (!ready) { sheetUpload('Coach photo access is not ready. Deploy syncCoachClaim, then try again.'); return; }
      }
      var err = document.getElementById('photo_err');
      if (err) err.textContent = 'Preparing…';
      try {
        var sized = await prepareFile(file);
      } catch (e) {
        sheetUpload(e.message || 'Could not read that photo.');
        return;
      }
      var id = photoId();
      PHOTO.job = {
        id: id,
        path: 'photos/' + CODE() + '/' + id + '.jpg',
        thumb: 'photos/' + CODE() + '/' + id + '_t.jpg',
        main: sized.main,
        thumbBlob: sized.thumb,
        role: isViewer() ? 'viewer' : 'coach',
        status: isViewer() ? 'pending' : 'approved',
        event: String((eventEl && eventEl.value) || 'Team').slice(0, 60),
        caption: String((captionEl && captionEl.value) || '').slice(0, 140),
        created: Date.now(),
        name: uploaderName()
      };
    }
    if (!PHOTO.job) { sheetUpload('Nothing to retry.'); return; }
    await runUpload(PHOTO.job);
  }

  function findPhoto(id) {
    return PHOTO.items.filter(function (p) { return p.id === id; })[0] || null;
  }
  function canDelete(p) {
    return p && (p.uid === AUTH.uid || !isViewer());
  }
  function openViewer(id) {
    var list = [];
    groupPhotos(PHOTO.items).forEach(function (g) { list = list.concat(g.team, g.parents); });
    var index = Math.max(0, list.findIndex(function (p) { return p.id === id; }));
    PHOTO.viewer = { list: list, index: index };
    drawViewer();
  }
  function drawViewer() {
    var view = PHOTO.viewer;
    if (!view || !view.list.length) { closeViewer(); return; }
    var p = view.list[view.index];
    if (!p) { closeViewer(); return; }
    var existing = document.getElementById('photoview');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'photoview';
      existing.className = 'phview';
      document.body.appendChild(existing);
    }
    existing.innerHTML = '<div class="row" style="padding:12px"><button class="btn sm ghost" data-a="photoprev">Prev</button><div class="grow" style="text-align:center;font-weight:800">' + esc(p.event || '') + '</div><button class="btn sm ghost" data-a="photonext">Next</button><button class="btn sm" data-a="photoclose">Close</button></div>'
      + '<img alt="" id="photofull" data-path="' + esc(p.path) + '" style="flex:1;min-height:0;width:100%;object-fit:contain;background:#000">'
      + '<div style="padding:12px"><div style="font-weight:800">' + esc(p.name || '') + (p.status === 'pending' ? ' · waiting for coach' : '') + '</div><div>' + esc(p.caption || '') + '</div>'
      + '<div class="row" style="margin-top:8px">'
      + (canDelete(p) ? '<button class="btn sm bad" data-a="photodel" data-id="' + esc(p.id) + '" data-uid="' + esc(p.uid) + '">Delete</button>' : '')
      + (p.uid !== AUTH.uid ? '<button class="btn sm ghost" data-a="photoreport" data-id="' + esc(p.id) + '">Report</button>' : '')
      + (!isViewer() && p.status === 'pending' ? '<button class="btn sm act" data-a="photoapprove" data-id="' + esc(p.id) + '" data-uid="' + esc(p.uid) + '">Approve</button>' : '')
      + '</div><div id="photo_err" class="sub2" style="color:#ffb4ab;font-weight:800"></div></div>';
    existing.querySelectorAll('[data-a]').forEach(function (el) {
      el.onclick = function (e) { e.stopPropagation(); photoAct(el.dataset.a, el.dataset, el); };
    });
    hydratePhotos();
  }
  function closeViewer() {
    PHOTO.viewer = null;
    var el = document.getElementById('photoview');
    if (el) el.remove();
  }
  async function approvePhoto(p) {
    if (isViewer() || !p || p.status !== 'pending') return;
    if (!PHOTO.coachReady && !(await syncCoachClaim())) throw new Error('Coach photo access is not ready.');
    var meta = { owner: p.uid, role: 'viewer', status: 'approved' };
    await patchStatus(p.path, meta);
    await patchStatus(p.thumb, meta);
    var record = {
      uid: p.uid, role: 'viewer', status: 'approved', event: p.event, caption: p.caption || '',
      path: p.path, thumb: p.thumb, created: p.created, name: p.name || 'Parent'
    };
    var put = await fbFetch(dbRoot() + '/teams/' + encodeURIComponent(CODE()) + '/photos/' + encodeURIComponent(p.id) + '.json', { method: 'PUT', body: JSON.stringify(record) });
    if (!put.ok) throw new Error('Could not publish that photo.');
    await fbFetch(dbRoot() + '/photoPending/' + encodeURIComponent(CODE()) + '/' + encodeURIComponent(p.uid) + '/' + encodeURIComponent(p.id) + '.json', { method: 'DELETE' });
  }
  async function deletePhoto(p) {
    if (!canDelete(p)) return;
    await deleteObject(p.path);
    await deleteObject(p.thumb);
    if (p.status === 'pending') {
      await fbFetch(dbRoot() + '/photoPending/' + encodeURIComponent(CODE()) + '/' + encodeURIComponent(p.uid) + '/' + encodeURIComponent(p.id) + '.json', { method: 'DELETE' });
    } else {
      var r = await fbFetch(dbRoot() + '/teams/' + encodeURIComponent(CODE()) + '/photos/' + encodeURIComponent(p.id) + '.json', { method: 'DELETE' });
      if (!r.ok) throw new Error('Could not remove that photo.');
    }
  }

  async function photoAct(a, d) {
    try {
      if (a === 'photonew') { sheetUpload(''); return; }
      if (a === 'photogo') { await startUpload(false); return; }
      if (a === 'photoretry') { await startUpload(true); return; }
      if (a === 'photoopen') { openViewer(d.id); return; }
      if (a === 'photoclose') { closeViewer(); return; }
      if (a === 'photoprev' || a === 'photonext') {
        if (!PHOTO.viewer) return;
        var n = PHOTO.viewer.list.length;
        PHOTO.viewer.index = (PHOTO.viewer.index + (a === 'photonext' ? 1 : -1) + n) % n;
        drawViewer();
        return;
      }
      if (a === 'photoapprove') {
        var item = findPhoto(d.id);
        await approvePhoto(item);
        closeViewer();
        PHOTO.fetchedAt = 0;
        await loadPhotoIndex();
        return;
      }
      if (a === 'photodel') {
        openSheet('<h2>Delete this photo?</h2><button class="btn bad big wide" data-a="photodelok" data-id="' + esc(d.id) + '">Delete</button><button class="btn ghost wide" data-a="photoclose2">Cancel</button>');
        return;
      }
      if (a === 'photoclose2') { closeSheet(); if (PHOTO.viewer) drawViewer(); return; }
      if (a === 'photodelok') {
        var victim = findPhoto(d.id);
        await deletePhoto(victim);
        closeSheet();
        closeViewer();
        PHOTO.fetchedAt = 0;
        await loadPhotoIndex();
        return;
      }
      if (a === 'photoreport') {
        openSheet('<h2>Report to coach</h2><div class="field"><label for="photo_reason">What is wrong?</label><input id="photo_reason" maxlength="200"></div><div id="photo_err" class="sub2" style="color:var(--bad);font-weight:800"></div><button class="btn act big wide" data-a="photoreportsend" data-id="' + esc(d.id) + '">Send</button><button class="btn ghost wide" data-a="photoclose2">Cancel</button>');
        return;
      }
      if (a === 'photoreportsend') {
        var photo = findPhoto(d.id);
        var text = String((document.getElementById('photo_reason') || {}).value || '').trim().slice(0, 200);
        if (!text) { var box = document.getElementById('photo_err'); if (box) box.textContent = 'Say what is wrong.'; return; }
        var sent = await fbFetch(dbRoot() + '/photoReports/' + encodeURIComponent(CODE()) + '/' + encodeURIComponent(d.id) + '.json', {
          method: 'PUT',
          body: JSON.stringify({ uid: AUTH.uid, text: text, t: Date.now(), event: (photo && photo.event) || '' })
        });
        if (!sent.ok) { sheetUpload('Could not send the report.'); return; }
        closeSheet();
        if (PHOTO.viewer) drawViewer();
        return;
      }
      if (a === 'photoreportdismiss') {
        await fbFetch(dbRoot() + '/photoReports/' + encodeURIComponent(CODE()) + '/' + encodeURIComponent(d.id) + '.json', { method: 'DELETE' });
        PHOTO.fetchedAt = 0;
        await loadPhotoIndex();
      }
    } catch (e) {
      var note = document.getElementById('photo_err');
      if (note) note.textContent = (e && e.message) || 'Something went wrong.';
    }
  }

  function installPhotos() {
    if (typeof act !== 'function' || window.__photosInstalled) return;
    window.__photosInstalled = true;
    var style = document.createElement('style');
    style.textContent = '.phgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.phcard{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;background:var(--card);padding:0}.phcard img,.phview img{width:100%;height:100%;object-fit:cover;background:#111}.phcap,.phwait{position:absolute;left:0;right:0;font-size:12px;font-weight:800;color:#fff;text-shadow:0 1px 2px #000}.phcap{bottom:0;padding:4px 6px;background:linear-gradient(transparent,#000)}.phwait{top:6px;left:6px;right:auto;background:#8a5a00;border-radius:8px;padding:2px 6px}.phview{position:fixed;inset:0;z-index:40;background:#000;color:#fff;display:flex;flex-direction:column}.phview img{object-fit:contain;flex:1;min-height:0}.phbar{height:10px;background:var(--line);border-radius:99px;overflow:hidden}.phbar span{display:block;height:100%;background:var(--act);width:0}';
    document.head.appendChild(style);
    var previousAct = act;
    act = async function (a, d, el) {
      if (a && a.indexOf('photo') === 0) return photoAct(a, d, el);
      var result = await previousAct(a, d, el);
      return result;
    };
    var previousCoach = becomeCoach;
    becomeCoach = async function (pin, establish) {
      var result = await previousCoach(pin, establish);
      if (result && result.ok) await syncCoachClaim();
      return result;
    };
    var previousNav = renderNav;
    renderNav = function () {
      previousNav();
      var button = document.querySelector('#nav button[data-tab=photos]');
      if (!button) return;
      var count = PHOTO.pendingCount || 0;
      button.querySelector('.ic').textContent = count ? '📷 ' + count : '📷';
    };
    if (typeof S !== 'undefined' && S.role === 'coach') syncCoachClaim();
    if (typeof S !== 'undefined' && S.tab === 'photos') loadPhotoIndex();
  }

  if (typeof window !== 'undefined') {
    window.viewPhotos = viewPhotos;
    window.groupPhotos = groupPhotos;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPhotos);
    else installPhotos();
  }
  if (typeof module === 'object' && module.exports) module.exports = { groupPhotos: groupPhotos };
})();
