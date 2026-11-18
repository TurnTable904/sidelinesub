'use strict';
const assert = require('assert');
const { groupPhotos } = require('./photos.js');

const groups = groupPhotos([
  { id: 'a', role: 'viewer', event: 'Practice', created: 10 },
  { id: 'b', role: 'coach', event: 'Practice', created: 30 },
  { id: 'c', role: 'viewer', event: 'vs Eagles', created: 50 },
  { id: 'd', role: 'coach', event: 'vs Eagles', created: 40 }
]);
assert.strictEqual(groups[0].event, 'vs Eagles');
assert.deepStrictEqual(groups[0].team.map(p => p.id), ['d']);
assert.deepStrictEqual(groups[0].parents.map(p => p.id), ['c']);
assert.strictEqual(groups[1].event, 'Practice');
assert.deepStrictEqual(groups[1].team.map(p => p.id), ['b']);
assert.deepStrictEqual(groups[1].parents.map(p => p.id), ['a']);
assert.strictEqual(groupPhotos([]) .length, 0);
console.log('photos tests passed');
