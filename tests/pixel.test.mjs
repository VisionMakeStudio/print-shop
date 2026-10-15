import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrompt} from '../netlify/lib/pixel/core.mjs';

test('Pixel requests clean vector-style transparent artwork',()=>{
  const prompt=buildPrompt({topic:'Thanksgiving',direction:'A balanced turkey and harvest arrangement.'},0);
  assert.match(prompt,/vector-style/);
  assert.match(prompt,/fully opaque/);
  assert.match(prompt,/No blurry edges/);
  assert.match(prompt,/background leakage/);
  assert.match(prompt,/transparent PNG/);
  assert.match(prompt,/distressed texture/i);
});
