import { drawingBounds, type Stroke } from './drawing';

export const names = [
  'mira',
  'leo',
  'nika',
  'sasha',
  'artem',
  'anya',
  'max',
  'sonya',
  'dima',
  'alice',
  'mark',
  'kate',
];
export const inks = [
  '#723e2c',
  '#435649',
  '#64504c',
  '#484459',
  '#86612d',
  '#343e50',
];
export const papers = [
  '#f6efdf',
  '#efe4d3',
  '#e6dfd0',
  '#f2e8dd',
  '#e9e1d5',
  '#f5ecdb',
];
export const format = (value: number) =>
  new Intl.NumberFormat('ru-RU').format(value);
export type PersonalMark = {
  id: number;
  slot?: number;
  strokes: readonly Stroke[];
};
export const personalCubeSlot = (personal: PersonalMark | null) =>
  personal ? (personal.slot ?? personal.id) : undefined;

/** Seeded illustrative ink, deliberately unrelated to accounts or private uploads. */
function demoInk(context: CanvasRenderingContext2D, id: number) {
  const seed = ((id * 2654435761) >>> 0) / 4294967296;
  context.lineWidth = 1.4 + seed * 0.7;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(17, 57);
  context.bezierCurveTo(34, 39, 44 + seed * 20, 4, 50 + seed * 12, 12);
  context.bezierCurveTo(65, 24, 22, 79, 35, 61);
  for (let i = 0; i < 4 + (id % 4); i++) {
    const x = 43 + i * 10;
    const wave = ((id * 13 + i * 7) % 17) - 8;
    context.bezierCurveTo(
      x + 7,
      39 + wave,
      x - 4,
      67 + wave,
      x + 11,
      50 + wave,
    );
  }
  context.moveTo(20, 71);
  context.bezierCurveTo(43, 65, 98, 64 - seed * 18, 133, 61 - seed * 12);
  context.stroke();
}

export function paintMark(
  context: CanvasRenderingContext2D,
  id: number,
  personal: PersonalMark | null,
) {
  if (!personal || personalCubeSlot(personal) !== id) {
    demoInk(context, id);
    return;
  }
  const bounds = drawingBounds(personal.strokes);
  if (!bounds) return;
  const scale = Math.min(132 / bounds.width, 65 / bounds.height);
  context.save();
  context.translate(
    (150 - bounds.width * scale) / 2,
    (90 - bounds.height * scale) / 2,
  );
  context.scale(scale, scale);
  context.translate(-bounds.left, -bounds.top);
  context.lineWidth = 2.8 / Math.max(0.35, scale);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const stroke of personal.strokes) {
    context.beginPath();
    stroke.points.forEach((point, index) =>
      index
        ? context.lineTo(point.x, point.y)
        : context.moveTo(point.x, point.y),
    );
    context.stroke();
  }
  context.restore();
}
