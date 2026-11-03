import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { callModel, imageBytes } from './evaluate-openrouter.mjs';

const { Response } = globalThis;

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

test('production moderation parser rejects truncated approvals and invalid evidence', async () => {
  const { autographModerationRequest, parseModerationResponse } =
    await import('../packages/integrations/src/autograph-moderation.ts');
  const request = autographModerationRequest(
    'synthetic/vision',
    Buffer.from('cleaned'),
  );
  assert.equal(request.max_tokens, 300);
  assert.equal(request.provider.data_collection, 'deny');
  const response = (value, finish_reason = 'stop') => ({
    choices: [{ finish_reason, message: { content: JSON.stringify(value) } }],
  });
  const approved = { decision: 'approved', reasonCode: null, confidence: 0.99 };
  assert.deepEqual(parseModerationResponse(response(approved)), approved);
  for (const finish of ['length', 'content_filter', null])
    assert.throws(() => parseModerationResponse(response(approved, finish)));
  for (const value of [
    { ...approved, confidence: '0.99' },
    { ...approved, reasonCode: 'NOT_AN_AUTOGRAPH' },
    { ...approved, unexpected: true },
    { decision: 'rejected', reasonCode: 'invented', confidence: 1 },
  ])
    assert.throws(() => parseModerationResponse(response(value)));
});

test('moderation summary separates false rejections, false approvals and unusable responses', async () => {
  const { summarizeModeration, models } =
    await import('./evaluate-openrouter.mjs');
  const model = models.moderation[0];
  const report = summarizeModeration([
    {
      kind: 'moderation',
      model,
      expected: 'approved',
      decision: 'rejected',
      confidence: 0.99,
      matches: false,
    },
    {
      kind: 'moderation',
      model,
      expected: 'rejected',
      decision: 'approved',
      matches: false,
    },
    { kind: 'moderation', model, expected: 'approved', invalidResponse: true },
    {
      kind: 'moderation',
      model,
      expected: 'manual',
      decision: 'manual',
      matches: true,
    },
  ])[model];
  assert.deepEqual(report, {
    total: 4,
    valid: 3,
    invalid: 1,
    expectedApproved: 2,
    falseRejections: 1,
    falseApprovals: 1,
    manual: 1,
    matched: 1,
    autoDecisions: 1,
    autoFalseApprovals: 0,
    autoFalseRejections: 1,
    autoOnAmbiguous: 0,
  });
});
