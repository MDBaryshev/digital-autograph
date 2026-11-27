import {
  isPublicWall,
  wallSlotCount,
  type WallStatus,
} from '@digital-autograph/domain';

// Telegram keeps this template immutable. Wall data travels only in public_data.
const widgetHtml = `
<style>
body{margin:.8em 1em;font-family:system-ui,sans-serif}
h3,p{margin:0 0 .65em}
h3{overflow-wrap:anywhere}
#places{display:grid;grid-template-columns:repeat(5,1fr);gap:.3em;margin:0 0 .8em}
#places span{border:1px solid var(--tg-theme-hint-color,#777);border-radius:.4em;text-align:center;padding:.3em 0}
#places .occupied{background:var(--tg-theme-button-color,#30547d);color:var(--tg-theme-button-text-color,#fff);border-color:transparent}
</style>
<h3 id="title">Supcube</h3>
<p id="status"></p>
<div id="wall" hidden>
  <div id="places"></div>
  <button id="open" type="button"></button>
</div>
<script>
(() => {
  const tg = window.TelegramWidget;
  const language = typeof navigator === 'object' ? navigator.language : '';
  const ru = typeof language === 'string' && language.toLowerCase().startsWith('ru');
  const unavailable = ru ? 'Стена недоступна' : 'Wall unavailable';
  const title = document.getElementById('title');
  const status = document.getElementById('status');
  const wall = document.getElementById('wall');
  const places = document.getElementById('places');
  const open = document.getElementById('open');
  const tiles = Array.from({length:${wallSlotCount}}, (_, index) => {
    const tile = document.createElement('span');
    tile.textContent = String(index + 1).padStart(2, '0');
    places.appendChild(tile);
    return tile;
  });
  let revision = -1;
  let href = '';
  open.textContent = ru ? 'Открыть стену' : 'Open wall';
  open.addEventListener('click', () => {
    if (tg && href) tg.openLink(href);
  });
  status.textContent = unavailable;
  function draw() {
    let state;
    try { state = JSON.parse(tg.publicData); } catch { return; }
    if (!state || !Number.isSafeInteger(state.r) || state.r <= revision) return;
    const next = state.wall;
    if (next !== null && (!next || typeof next.title !== 'string' ||
        typeof next.href !== 'string' || typeof next.slots !== 'string' ||
        !/^[01]{${wallSlotCount}}$/.test(next.slots))) return;
    revision = state.r;
    href = next ? next.href : '';
    title.textContent = next ? next.title : 'Supcube';
    wall.hidden = !next;
    if (!next) {
      status.textContent = unavailable;
      return;
    }
    let occupied = 0;
    tiles.forEach((tile, index) => {
      const filled = next.slots[index] === '1';
      tile.className = filled ? 'occupied' : '';
      if (filled) occupied++;
    });
    status.textContent = (ru ? 'Занято мест: ' : 'Occupied places: ') + occupied + '/${wallSlotCount}';
  }
  if (!tg) return;
  tg.onEvent('publicDataChanged', draw);
  draw();
  tg.watchPublicData();
  tg.ready();
})();
</script>`.trim();

// Only the public wall projection belongs here. No autograph assets, account
// identifiers or chat-specific data are sent to Telegram in public_data.
type PublicWallSource = {
  id: string;
  status: WallStatus;
  slotCount: number;
  appearance?: { title: string };
  creator: { displayName: string };
  slots: ReadonlyArray<{ position: number; occupied: boolean }>;
};

type WidgetSnapshot = {
  wall: PublicWallSource | null;
  // Use the application's canonical HTTPS origin from server configuration.
  webOrigin: string;
  // The publisher persists and increments this revision per widget.
  revision: number;
};

function encodePublicData({ wall, webOrigin, revision }: WidgetSnapshot) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError('Invalid Telegram wall widget revision');
  }
  if (!wall || !isPublicWall(wall.status)) {
    return JSON.stringify({ r: revision, wall: null });
  }
  if (
    wall.slotCount !== wallSlotCount ||
    wall.slots.length !== wallSlotCount ||
    wall.slots.some(
      (slot, position) =>
        slot.position !== position || typeof slot.occupied !== 'boolean',
    )
  ) {
    throw new Error('Invalid Telegram wall widget slot layout');
  }
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(wall.id)
  ) {
    throw new Error('Invalid Telegram wall widget Wall ID');
  }

  const origin = new URL(webOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== webOrigin) {
    throw new Error('Telegram wall widgets require a canonical HTTPS origin');
  }
  const href = new URL(`/walls/${wall.id}`, origin).href;
  if (href.length > 256) {
    throw new RangeError('Telegram wall widget URL exceeds 256 characters');
  }

  const name = wall.appearance?.title.trim() || wall.creator.displayName.trim();
  const title =
    Array.from(name.replace(/\p{Cc}/gu, ' ').trim())
      .slice(0, 80)
      .join('') || 'Supcube';
  const publicData = JSON.stringify({
    r: revision,
    wall: {
      href,
      title,
      slots: wall.slots.map((slot) => (slot.occupied ? '1' : '0')).join(''),
    },
  });
  if (Buffer.byteLength(publicData, 'utf8') > 1024) {
    throw new RangeError('Telegram wall widget data exceeds 1024 bytes');
  }
  return publicData;
}

/** Builds a Bot API 10.4 sendWidget body for a verified private bot chat. */
export function buildTelegramWallWidgetSend({
  chatId,
  locale,
  ...snapshot
}: WidgetSnapshot & {
  wall: PublicWallSource;
  chatId: number;
  locale: 'ru' | 'en';
}) {
  if (!Number.isSafeInteger(chatId) || chatId <= 0) {
    throw new RangeError('Invalid Telegram private chat ID');
  }
  if (!isPublicWall(snapshot.wall.status)) {
    throw new Error('Telegram wall widgets require a public wall');
  }
  return {
    chat_id: chatId,
    html: widgetHtml,
    public_data: encodePublicData(snapshot),
    caption:
      locale === 'ru' ? 'Стена автографов Supcube' : 'Supcube autograph wall',
    is_shared: true,
    allow_queries: false,
  };
}

/** Builds an editSharedWidgetData body, including withdrawal on null/private walls. */
export function buildTelegramWallWidgetUpdate({
  widgetId,
  ...snapshot
}: WidgetSnapshot & { widgetId: string }) {
  if (!widgetId.trim()) {
    throw new Error('Missing Telegram shared widget ID');
  }
  return {
    widget_id: widgetId,
    public_data: encodePublicData(snapshot),
    cache_time: 30,
  };
}
