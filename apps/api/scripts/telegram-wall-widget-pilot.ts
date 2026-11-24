import {
  buildTelegramWallWidgetSend,
  createTelegramTestWallWidgetClient,
} from '@digital-autograph/integrations';

const webOrigin = 'https://example.com';

function sampleWall(occupied: number) {
  return {
    id: 'f18ba27b-4ac1-4c14-8ea3-ce3f5d78b22c',
    status: 'live' as const,
    slotCount: 10,
    creator: { displayName: 'Supcube · test wall' },
    slots: Array.from({ length: 10 }, (_, position) => ({
      position,
      occupied: position < occupied,
    })),
  };
}

async function main() {
  const [action, revisionArg, occupiedArg] = process.argv.slice(2);
  const wall = sampleWall(2);
  if (action === 'preview') {
    const payload = buildTelegramWallWidgetSend({
      wall,
      webOrigin,
      revision: 0,
      chatId: 1,
      locale: 'en',
    });
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (!['send', 'update', 'withdraw'].includes(action ?? '')) {
    throw new Error(
      'Use preview, send, update REVISION OCCUPIED, or withdraw REVISION',
    );
  }

  const client = createTelegramTestWallWidgetClient(
    process.env.TELEGRAM_WIDGET_TEST_BOT_TOKEN ?? '',
  );
  if (action === 'send') {
    const result = await client.send({
      wall,
      webOrigin,
      revision: 0,
      chatId: Number(process.env.TELEGRAM_WIDGET_TEST_CHAT_ID),
      locale: 'en',
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.state !== 'sent') process.exitCode = 1;
    return;
  }

  const revision = Number(revisionArg);
  const occupied = Number(occupiedArg);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error(
      'Update and withdrawal require a positive, increasing revision',
    );
  }
  if (
    action === 'update' &&
    (!Number.isInteger(occupied) || occupied < 0 || occupied > 10)
  ) {
    throw new Error('The occupied count must be an integer from 0 to 10');
  }
  const result = await client.update({
    wall: action === 'withdraw' ? null : sampleWall(occupied),
    webOrigin,
    revision,
    widgetId: process.env.TELEGRAM_WIDGET_TEST_WIDGET_ID ?? '',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.state !== 'updated') process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Telegram widget pilot failed',
  );
  process.exitCode = 1;
});
