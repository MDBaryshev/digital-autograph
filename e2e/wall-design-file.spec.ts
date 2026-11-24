import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { emptyWallDesign } from '../packages/domain/src/index';

test('a wall design can round-trip as a file with embedded images', async ({
  baseURL,
  page,
}) => {
  const image = await sharp({
    create: { width: 24, height: 8, channels: 3, background: '#272d61' },
  })
    .png()
    .toBuffer();
  const embeddedImage = 'data:image/png;base64,' + image.toString('base64');
  const file = {
    format: 'supcube-wall-design',
    version: 1,
    design: {
      ...emptyWallDesign,
      title: 'Blue Hour Test Wall',
      avatarDataUrl: embeddedImage,
      coverDataUrl: embeddedImage,
      style: {
        ...emptyWallDesign.style,
        coverPosition: 'top',
        colors: { cube: '#353286', sides: '#41427a', frame: '#a8afff' },
        podium: 'jewels',
        finish: 'satin-glass',
        placeFinishes: { '4': 'glass' },
      },
    },
  };

  await page.context().addCookies([
    {
      name: 'destka-locale',
      value: 'en',
      url: baseURL ?? 'http://127.0.0.1:3000',
    },
  ]);
  await page.goto('/walls/demo');
  const input = page.getByLabel('Import design file', { exact: true });
  const select = (value: unknown) =>
    input.setInputFiles({
      name: 'design.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await select(file);

  const wall = page.locator('[data-wall-theme]');
  await expect(
    wall.getByRole('heading', { name: file.design.title }),
  ).toBeVisible();
  await expect(wall).toHaveAttribute('data-wall-crop', 'top');
  const images = wall.locator('header img');
  await expect(images).toHaveCount(2);
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements.map((element) => (element as HTMLImageElement).naturalWidth),
      ),
    )
    .toEqual([24, 24]);
  await expect(
    wall.locator('ol li:nth-child(4) [data-cube-object]'),
  ).toHaveAttribute('data-cube-finish', 'glass');

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download design file' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('supcube-wall-design.json');
  expect(JSON.parse(readFileSync(await download.path(), 'utf8'))).toEqual(file);

  await select({
    ...file,
    design: {
      ...file.design,
      coverDataUrl: 'https://example.invalid/cover.png',
    },
  });
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Choose a valid Supcube wall design file.' }),
  ).toBeVisible();
  await expect(
    wall.getByRole('heading', { name: file.design.title }),
  ).toBeVisible();
  await expect(images.first()).toHaveAttribute('src', embeddedImage);
});
