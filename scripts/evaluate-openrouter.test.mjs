import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import process from 'node:process';
import sharp from 'sharp';
import {
  callModel,
  imageBytes,
  csvRow,
  models,
  nicknames,
  styles,
} from './evaluate-openrouter.mjs';

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

test('rejects SVG disguised as any supported raster MIME and mismatched raster bytes', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>',
  );
  for (const media_type of ['image/png', 'image/jpeg', 'image/webp']) {
    await assert.rejects(
      imageBytes({ data: [{ media_type, b64_json: svg.toString('base64') }] }),
    );
  }
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    imageBytes({
      data: [{ media_type: 'image/jpeg', b64_json: png.toString('base64') }],
    }),
  );
});

// Independent CSV reader: quoted commas/newlines and doubled quotes remain in one field.
function parseCsv(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(field);
      field = '';
      if (c === '\n') {
        rows.push(row);
        row = [];
      }
    } else field += c;
  }
  assert.equal(quoted, false);
  assert.equal(field, '');
  assert.deepEqual(row, []);
  return rows;
}

test(
  'actual CLI exports eight CSV columns for every default style without provider traffic',
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'autograph-evaluation-'));
    try {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        ['--import', 'tsx', 'scripts/evaluate-openrouter.mjs'],
        { cwd: new URL('..', import.meta.url), timeout: 5000 },
      );
      const plan = JSON.parse(stdout);
      const png = await sharp({
        create: { width: 16, height: 16, channels: 3, background: '#fff' },
      })
        .png()
        .toBuffer();
      const fixture = join(directory, 'provider-fixture.mjs');
      await writeFile(
        fixture,
        `
      let images = 0, moderation = 0;
      globalThis.fetch = async (url) => {
        if (url === 'https://openrouter.ai/api/v1/images') {
          images++;
          return new Response(JSON.stringify({ data: [{ media_type: 'image/png', b64_json: '${png.toString('base64')}' }], usage: { cost: 0 } }));
        }
        if (url === 'https://openrouter.ai/api/v1/chat/completions') {
          moderation++;
          return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ decision: 'manual', reasonCode: null, confidence: 0.5 }) } }], usage: { cost: 0 } }));
        }
        throw new Error('Unexpected synthetic evaluation request');
      };
      process.on('exit', () => { if (images !== ${plan.generationCalls} || moderation !== ${plan.moderationCalls}) process.exitCode = 1; });
    `,
      );
      await promisify(execFile)(
        process.execPath,
        [
          '--import',
          'tsx',
          '--import',
          pathToFileURL(fixture).href,
          'scripts/evaluate-openrouter.mjs',
          '--run',
          '--output',
          directory,
        ],
        {
          cwd: new URL('..', import.meta.url),
          env: {
            ...process.env,
            OPENROUTER_API_KEY: 'synthetic-evaluation-test-key',
          },
          timeout: 25000,
        },
      );
      const rows = parseCsv(
        await readFile(join(directory, 'ratings.csv'), 'utf8'),
      );
      assert.deepEqual(rows.shift(), [
        'file',
        'model',
        'nickname',
        'style',
        'spelling_1_to_5',
        'readability_1_to_5',
        'style_1_to_5',
        'usable_yes_no',
      ]);
      const expected = models.images.flatMap((model) =>
        nicknames.flatMap((nickname) =>
          styles.map((style) => [model, nickname, style]),
        ),
      );
      assert.equal(rows.length, expected.length);
      rows.forEach((row, i) => {
        assert.equal(row.length, 8);
        assert.deepEqual(row.slice(1, 4), expected[i]);
        assert.deepEqual(row.slice(4), ['', '', '', '']);
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test('CSV quotes commas, quotes and CR/LF while preserving empty rating cells', () => {
  const fields = [
    'image.png',
    'model',
    'a,"b"',
    'line\r\nbreak\nnext',
    '',
    '',
    '',
    '',
  ];
  assert.deepEqual(parseCsv(csvRow(fields) + '\n'), [fields]);
  assert.equal(
    csvRow(['plain', '"quoted"', 'a,b']),
    'plain,"""quoted""","a,b"',
  );
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

test('normalizes all supported raster formats and rejects corrupt, animated and noncanonical inputs', async () => {
  const input = {
    create: { width: 20, height: 10, channels: 3, background: '#fff' },
  };
  for (const format of ['png', 'jpeg', 'webp']) {
    const decoder = sharp(input);
    const bytes = await decoder[format]()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await imageBytes({
      data: [
        { media_type: `image/${format}`, b64_json: bytes.toString('base64') },
      ],
    });
    const metadata = await sharp(result).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.exif, undefined);
    assert.ok(Math.max(metadata.width, metadata.height) <= 1024);
  }
  const animated = await sharp(
    Buffer.concat([Buffer.alloc(16 * 16 * 3), Buffer.alloc(16 * 16 * 3, 255)]),
    {
      raw: { width: 16, height: 32, pageHeight: 16, channels: 3 },
    },
  )
    .webp()
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  for (const data of [
    {
      data: [
        { media_type: 'image/webp', b64_json: animated.toString('base64') },
      ],
    },
    {
      data: [
        {
          media_type: 'image/png',
          b64_json: Buffer.from('89504e470d0a1a0a00000000', 'hex').toString(
            'base64',
          ),
        },
      ],
    },
    { data: [{ media_type: 'image/png', b64_json: 'AAAAA' }] },
    {
      data: [
        {
          media_type: 'image/png',
          b64_json: Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64'),
        },
      ],
    },
    { data: [{}, {}] },
  ])
    await assert.rejects(imageBytes(data));
});
