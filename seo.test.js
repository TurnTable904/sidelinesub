'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const fragment = fs.readFileSync(path.join(root, 'app-fragment.html'), 'utf8');
const missing = fs.readFileSync(path.join(root, '404.html'), 'utf8');
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function decode(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const visible = index.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
const text = decode(visible.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

assert.strictEqual((index.match(/<title>/g) || []).length, 1, 'one title');
const title = decode(index.match(/<title>([^<]*)<\/title>/)[1]);
assert.ok(title.length >= 45 && title.length <= 65, 'title length ' + title.length + ': ' + title);
assert.ok(title.includes('Sideline Sub'), title);
assert.ok(/youth soccer/i.test(title), title);

const desc = index.match(/<meta name="description" content="([^"]*)"/)[1];
assert.ok(desc.length >= 120 && desc.length <= 165, 'description length ' + desc.length);
assert.ok(!/noindex/i.test(index), 'home page must be indexable');
assert.ok(index.includes('content="index, follow, max-image-preview:large"'));
assert.ok(index.includes('rel="canonical" href="https://www.sidelinesub.com/"'));
assert.ok(index.includes('property="og:url" content="https://www.sidelinesub.com/"'));
assert.ok(index.includes('property="og:image" content="https://www.sidelinesub.com/og.png"'));
assert.ok(index.includes('name="twitter:card" content="summary_large_image"'));
assert.ok(index.includes('name="twitter:image" content="https://www.sidelinesub.com/og.png"'));
assert.strictEqual((index.match(/<h1[\s>]/g) || []).length, 1, 'one h1');
assert.strictEqual((index.match(/<main[\s>]/g) || []).length, 1, 'one main');
assert.ok(text.includes('Youth soccer substitution app for equal playing time'));
assert.ok(text.includes('Equal playing time tracker'));
assert.ok(text.includes('Soccer lineup rotation'));
assert.ok(text.includes('Sub timer for coaches'));
assert.ok(text.includes('Questions coaches and parents ask'));
assert.ok(!text.includes('AIza'), 'API key must stay out of the public landing text');
assert.ok(!/firebasestorage|firebaseio/i.test(visible), 'landing HTML must not point at team data');
assert.ok(!visible.includes('turntable904.github.io'));
assert.ok(index.includes("storage.getItem('sidelinesub.v1')"), 'saved teams skip the landing');
assert.ok(index.includes('function ssSkipLanding'));
assert.ok(index.includes('function ssEnterApp'));
assert.ok(index.includes('href="/?app=1" data-open-app'), 'landing buttons still open the app');
assert.ok(index.includes('class="about-link" href="/?home=1"'), 'settings links to the home override');
assert.ok(index.includes('About Sideline Sub'));
assert.ok(!index.includes('href="/?home=1" data-open-app'));
const gateAt = index.indexOf('function ssSkipLanding');
const teamSkipAt = index.indexOf("storage.getItem('sidelinesub.v1')", gateAt);
assert.ok(gateAt > 0 && teamSkipAt > gateAt);
assert.ok(index.indexOf("hash === '#home'") < teamSkipAt, 'home override is decided before a saved team');
assert.ok(index.includes('rel="canonical" href="https://www.sidelinesub.com/"'));
assert.ok(fragment.includes('<main id="view"></main>'), 'the Android app keeps the plain app shell');
assert.ok(!fragment.includes('id="landing"'));
assert.ok(!fragment.includes('ssEnterApp'));
assert.ok(!fragment.includes('ssSkipLanding'));
assert.ok(!fragment.includes('about-link'));
assert.ok(!fragment.includes('home=1'));
assert.ok(/noindex/i.test(missing), 'unknown URLs stay out of the index');

const ld = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
assert.strictEqual(ld.length, 1);
const graph = ld[0]['@graph'];
const byType = {};
for (const node of graph) byType[node['@type']] = node;
for (const type of ['WebSite', 'Organization', 'WebApplication', 'FAQPage']) {
  assert.ok(byType[type], type);
}
assert.strictEqual(byType.WebSite.url, 'https://www.sidelinesub.com/');
assert.strictEqual(byType.Organization.founder.name, 'Chad Turner');
assert.strictEqual(byType.Organization.logo.url, 'https://www.sidelinesub.com/icon-512.png');
assert.strictEqual(byType.WebApplication.offers.price, '0');
assert.strictEqual(byType.WebApplication.applicationCategory, 'SportsApplication');
assert.ok(byType.WebApplication.url === 'https://www.sidelinesub.com/');
const faqs = byType.FAQPage.mainEntity;
assert.ok(faqs.length >= 6);
for (const q of faqs) {
  assert.strictEqual(q['@type'], 'Question');
  assert.ok(text.includes(q.name), 'missing question: ' + q.name);
  assert.ok(text.includes(q.acceptedAnswer.text), 'missing answer: ' + q.name);
}

assert.ok(/^User-agent:\s*\*/m.test(robots));
assert.ok(/^Allow:\s*\/\s*$/m.test(robots));
assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots), 'do not block the whole site');
assert.ok(robots.includes('Sitemap: https://www.sidelinesub.com/sitemap.xml'));
assert.ok(robots.includes('Content-Signal: search=yes, ai-input=yes, ai-train=no'));

assert.ok(sitemap.includes('<loc>https://www.sidelinesub.com/</loc>'));
assert.strictEqual((sitemap.match(/<loc>/g) || []).length, 1);
assert.ok(!sitemap.includes('home=1'), 'the home override is not a second indexed URL');
assert.ok(!sitemap.includes('github.io'));
assert.ok(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap));

assert.strictEqual(manifest.start_url, '/?app=1');
assert.strictEqual(manifest.scope, '/');
assert.ok(manifest.description && manifest.description.length > 40);
assert.ok(manifest.icons.some(icon => icon.purpose === 'any'));
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));

assert.ok(sw.includes('/og.png'));
assert.ok(sw.includes('/sitemap.xml'));
assert.ok(sw.includes('/robots.txt'));

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.strictEqual(buf.toString('ascii', 1, 4), 'PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}
const og = pngSize(path.join(root, 'og.png'));
assert.strictEqual(og.width, 1200);
assert.strictEqual(og.height, 630);
assert.ok(og.bytes < 200000, 'og.png is ' + og.bytes);
const icon32 = pngSize(path.join(root, 'favicon-32.png'));
assert.strictEqual(icon32.width, 32);
assert.strictEqual(icon32.height, 32);
const ico = fs.readFileSync(path.join(root, 'favicon.ico'));
assert.strictEqual(ico.readUInt16LE(0), 0);
assert.strictEqual(ico.readUInt16LE(2), 1);
assert.ok(ico.readUInt16LE(4) >= 1);

console.log('seo tests passed');
