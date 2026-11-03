import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { callModel, imageBytes } from './evaluate-openrouter.mjs';

test('uses the dedicated Image API and reports measured cost without returning credentials', async () => {
  const result = await callModel(
    'synthetic-private-key',
    'images',
    { model: 'synthetic/image', prompt: 'decorative nickname' },
    async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/images');
      assert.equal(options.redirect, 'error');
      assert.equal(JSON.parse(options.body).model, 'synthetic/image');
      assert.ok(!options.body.includes('synthetic-private-key'));
      return new Response(JSON.stringify({ data: [], usage: { cost: 0.02 } }));
    },
  );
  assert.equal(result.costUsd, 0.02);
  assert.ok(result.seconds >= 0);
});
test('provider errors expose no diagnostics and do not trigger a retry', async () => {
  let calls = 0;
  await assert.rejects(
    callModel('synthetic-key', 'images', {}, async () => {
      calls++;
      return new Response('upstream-private-diagnostic', { status: 402 });
    }),
    (error) => !error.message.includes('upstream-private-diagnostic'),
  );
  assert.equal(calls, 1);
});
test('normalizes inline JPEG and rejects returned URLs and SVG', async () => {
  const jpeg = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#fff' },
  })
    .jpeg()
    .toBuffer();
  const png = await imageBytes({
    data: [{ media_type: 'image/jpeg', b64_json: jpeg.toString('base64') }],
  });
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  await assert.rejects(
    imageBytes({
      data: [{ media_type: 'image/png', url: 'http://169.254.169.254/' }],
    }),
  );
  await assert.rejects(
    imageBytes({
      data: [
        {
          media_type: 'image/svg+xml',
          b64_json: Buffer.from('<svg/>').toString('base64'),
        },
      ],
    }),
  );
});
