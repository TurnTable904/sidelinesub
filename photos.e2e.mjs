/* End-to-end check against the local emulators.
   Start them with: firebase emulators:start --only auth,database,storage,functions --project bridge-blue
   Then: NODE_PATH=node_modules node photos.e2e.mjs
   Needs puppeteer-core and Google Chrome. */
import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const root = '/agent/repos/sidelinesub';
const port = 8766;
const teamCode = ('T' + Date.now().toString(36)).toUpperCase().slice(0, 8);
const shots = '/opt/cursor/artifacts';
fs.mkdirSync(shots, { recursive: true });

function bmp(w, h, rgb) {
  const row = Math.ceil(w * 3 / 4) * 4;
  const pixels = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * row + x * 3;
      pixels[i] = rgb[2];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[0];
    }
  }
  const header = Buffer.alloc(54);
  header.write('BM');
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(w, 18);
  header.writeInt32LE(h, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  return Buffer.concat([header, pixels]);
}
const coachFile = '/tmp/coach-photo.bmp';
const parentFile = '/tmp/parent-photo.bmp';
fs.writeFileSync(coachFile, Buffer.concat([bmp(48, 36, [20, 90, 200]), Buffer.from('GPSLatitude')]));
fs.writeFileSync(parentFile, bmp(48, 36, [220, 120, 30]));

function contentType(file) {
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const file = path.normalize(path.join(root, pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(root, '404.html')));
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function boot(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', err => console.log('pageerror', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('console', msg.text());
  });
  page.on('response', async (res) => {
    if (res.status() >= 400 && /9000|9099|9199|5001/.test(res.url())) {
      let body = '';
      try { body = (await res.text()).slice(0, 180); } catch (e) {}
      console.log('HTTP', res.status(), res.url().slice(0, 140), body);
    }
  });
  await page.goto('http://127.0.0.1:' + port + '/?emu=1', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => document.body.innerText.includes('Welcome to Sideline Sub'), { timeout: 15000 });
  return page;
}

async function main() {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-features=HttpsUpgrades']
  });
  try {
    const coach = await boot(browser);
    await coach.click('[data-a=teamcreate]');
    await coach.waitForSelector('#tc_name');
    await coach.type('#tc_name', 'U10 Thunder');
    await coach.type('#tc_coach', 'Coach Kim');
    await coach.type('#tc_pin', '2468');
    await coach.type('#tc_code', teamCode);
    await coach.click('[data-a=teamcreatego]');
    await coach.waitForFunction(() => {
      if (document.body.innerText.includes('Team created')) return true;
      const err = document.getElementById('tc_err');
      const text = err && err.textContent || '';
      return text && text !== 'Checking code…';
    }, { timeout: 20000 });
    const created = await coach.evaluate(() => document.body.innerText.includes('Team created'));
    if (!created) {
      const why = await coach.evaluate(() => (document.getElementById('tc_err') || {}).textContent || document.body.innerText.slice(0, 400));
      throw new Error('team create failed: ' + why);
    }
    await coach.click('[data-a=close]');
    await coach.click('#nav button[data-tab=photos]');
    try {
      await coach.waitForFunction(() => document.body.innerText.toLowerCase().includes('add photo'), { timeout: 8000 });
    } catch (e) {
      const info = await coach.evaluate(() => ({
        tab: typeof S !== 'undefined' ? S.tab : 'no S',
        photos: typeof viewPhotos,
        text: document.body.innerText.slice(0, 700)
      }));
      throw new Error('photos tab did not open ' + JSON.stringify(info));
    }
    await coach.click('[data-a=photonew]');
    await coach.waitForSelector('#photo_file');
    await coach.screenshot({ path: path.join(shots, 'photo_upload_sheet.png') });
    const chooser = await coach.$('#photo_file');
    await chooser.uploadFile(coachFile);
    await coach.select('#photo_event', 'Team');
    await coach.click('[data-a=photogo]');
    await coach.waitForFunction(() => {
      if (document.querySelector('.phgrid img')) return true;
      const text = (document.getElementById('photo_err') || {}).textContent || '';
      return text && text !== 'Preparing…';
    }, { timeout: 20000 });
    const coachErr = await coach.evaluate(() => {
      if (document.querySelector('.phgrid img')) return '';
      return (document.getElementById('photo_err') || {}).textContent || '';
    });
    if (coachErr) throw new Error('coach upload: ' + coachErr);
    await coach.waitForSelector('.phgrid img');
    await coach.screenshot({ path: path.join(shots, 'photo_gallery_coach.png') });
    const stripped = await coach.evaluate(async () => {
      const img = document.querySelector('.phgrid img');
      const res = await fetch(img.src);
      const buf = new Uint8Array(await res.arrayBuffer());
      const text = new TextDecoder().decode(buf);
      return text.includes('GPSLatitude');
    });
    assert(stripped === false, 'resized photo still contains GPSLatitude');

    const parent = await boot(browser);
    await parent.click('[data-a=teamjoin]');
    await parent.waitForSelector('#tj_code');
    await parent.type('#tj_code', teamCode);
    await parent.click('[data-a=teamjoingo][data-r=viewer]');
    await parent.waitForFunction(() => {
      const text = (document.getElementById('tj_err') || {}).textContent || '';
      if (text && text !== 'Looking up team…') return true;
      return document.body.innerText.includes('U10 THUNDER') && !document.body.innerText.includes('Welcome to Sideline Sub');
    }, { timeout: 20000 });
    const joinErr = await parent.evaluate(() => {
      const text = (document.getElementById('tj_err') || {}).textContent || '';
      if (!text || text === 'Looking up team…') return '';
      return text;
    });
    if (joinErr) throw new Error('join failed: ' + joinErr);
    await parent.click('#nav button[data-tab=photos]');
    await parent.waitForFunction(() => document.body.innerText.toLowerCase().includes('add photo') && document.querySelector('.phgrid img'), { timeout: 15000 });
    const hiddenPending = await parent.evaluate(async (code) => {
      const r = await fetch('http://127.0.0.1:9000/photoPending/' + code + '.json?ns=bridge-blue-default-rtdb&auth=' + encodeURIComponent(AUTH.token));
      return r.status;
    }, teamCode);
    assert(hiddenPending === 401 || hiddenPending === 403, 'parent listed every pending photo: ' + hiddenPending);
    await parent.click('[data-a=photonew]');
    await parent.waitForSelector('#photo_ok');
    await parent.screenshot({ path: path.join(shots, 'photo_parent_consent.png') });
    await parent.click('#photo_ok');
    await (await parent.$('#photo_file')).uploadFile(parentFile);
    await parent.select('#photo_event', 'Practice');
    await parent.type('#photo_caption', 'Sideline');
    await parent.click('[data-a=photogo]');
    await parent.waitForFunction(() => {
      if (document.body.innerText.includes('Waiting')) return true;
      const text = (document.getElementById('photo_err') || {}).textContent || '';
      return text && text !== 'Preparing…';
    }, { timeout: 20000 });
    const parentErr = await parent.evaluate(() => document.body.innerText.includes('Waiting') ? '' : ((document.getElementById('photo_err') || {}).textContent || ''));
    if (parentErr) throw new Error('parent upload: ' + parentErr);

    await coach.click('#nav button[data-tab=game]');
    await new Promise(r => setTimeout(r, 3200));
    await coach.click('#nav button[data-tab=photos]');
    await coach.waitForFunction(() => document.body.innerText.toLowerCase().includes('needs approval'), { timeout: 15000 });
    await coach.screenshot({ path: path.join(shots, 'photo_approval_queue.png') });
    await coach.click('[data-a=photoapprove]');
    await coach.waitForFunction(() => !document.body.innerText.toLowerCase().includes('needs approval'), { timeout: 15000 });
    await coach.screenshot({ path: path.join(shots, 'photo_gallery_approved.png') });

    await parent.click('#nav button[data-tab=game]');
    await new Promise(r => setTimeout(r, 3200));
    await parent.click('#nav button[data-tab=photos]');
    await parent.waitForFunction(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('parents') && text.includes('sideline') && !text.includes('waiting');
    }, { timeout: 15000 });
    await parent.click('.phgrid .phcard');
    await parent.waitForSelector('#photoview');
    await parent.screenshot({ path: path.join(shots, 'photo_viewer.png') });
    console.log('photo emulator flow passed');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
