import { GOLD, INK, SKINS, type SkinId, type TierColors } from './palette';

/**
 * Every visual in the game is an SVG string rasterised once at load time.
 * Sizes are the logical size of the resulting texture (see textures.ts).
 */

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const goldGradient = (id: string, vertical = true) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">
    <stop offset="0" stop-color="${GOLD.light}"/>
    <stop offset="0.45" stop-color="${GOLD.base}"/>
    <stop offset="1" stop-color="${GOLD.dark}"/>
  </linearGradient>`;

// ---- stones -------------------------------------------------------------------------

export const blackStone = () =>
  svg(100, 100, `
  <defs>
    <radialGradient id="b" cx="0.36" cy="0.3" r="0.78">
      <stop offset="0" stop-color="#6b6f7c"/>
      <stop offset="0.35" stop-color="#2a2d36"/>
      <stop offset="1" stop-color="#050608"/>
    </radialGradient>
    <radialGradient id="h" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="46" fill="url(#b)"/>
  <ellipse cx="36" cy="30" rx="18" ry="11" fill="url(#h)" transform="rotate(-28 36 30)"/>
  <circle cx="50" cy="50" r="45" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>`);

export const whiteStone = () =>
  svg(100, 100, `
  <defs>
    <radialGradient id="w" cx="0.36" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#f1efe8"/>
      <stop offset="1" stop-color="#bdb8ac"/>
    </radialGradient>
    <radialGradient id="h" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="46" fill="url(#w)"/>
  <ellipse cx="36" cy="30" rx="16" ry="10" fill="url(#h)" transform="rotate(-28 36 30)"/>
  <circle cx="50" cy="50" r="45" fill="none" stroke="#8a8375" stroke-opacity="0.5" stroke-width="2"/>`);

export const stoneShadow = () =>
  svg(100, 100, `
  <defs><radialGradient id="s" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#000" stop-opacity="0.5"/>
    <stop offset="0.7" stop-color="#000" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient></defs>
  <circle cx="50" cy="50" r="50" fill="url(#s)"/>`);

// ---- board --------------------------------------------------------------------------

/** 1000×1000 board. The play surface is inset by 56px; the grid is drawn in Pixi. */
export const BOARD_INSET = 56;

export const board = () => {
  const grain = Array.from({ length: 22 }, (_, index) => {
    const y = 80 + index * 40 + ((index * 37) % 17);
    const wobble = 10 + ((index * 13) % 9);
    return `<path d="M60 ${y} C 280 ${y - wobble}, 520 ${y + wobble}, 940 ${y - wobble / 2}" stroke="#8a4f17" stroke-opacity="${0.05 + (index % 4) * 0.02}" stroke-width="${2 + (index % 3)}" fill="none"/>`;
  }).join('');
  return svg(1000, 1000, `
  <defs>
    <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b8692a"/>
      <stop offset="1" stop-color="#6b3310"/>
    </linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7d49a"/>
      <stop offset="0.5" stop-color="#eebc71"/>
      <stop offset="1" stop-color="#dc9f55"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.7">
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#5a2a08" stop-opacity="0.28"/>
    </radialGradient>
  </defs>
  <rect x="6" y="22" width="988" height="974" rx="56" fill="${INK}"/>
  <rect x="6" y="6" width="988" height="974" rx="56" fill="#5a2a0c" stroke="${INK}" stroke-width="8"/>
  <rect x="6" y="6" width="988" height="956" rx="56" fill="url(#frame)" stroke="${INK}" stroke-width="8"/>
  <rect x="22" y="18" width="956" height="22" rx="11" fill="#fff" fill-opacity="0.18"/>
  <rect x="${BOARD_INSET - 8}" y="${BOARD_INSET - 8}" width="${1000 - 2 * (BOARD_INSET - 8)}" height="${1000 - 2 * (BOARD_INSET - 8) - 8}" rx="30" fill="#4a2208" fill-opacity="0.55"/>
  <rect x="${BOARD_INSET}" y="${BOARD_INSET}" width="${1000 - 2 * BOARD_INSET}" height="${1000 - 2 * BOARD_INSET - 8}" rx="24" fill="url(#wood)"/>
  <g>${grain}</g>
  <rect x="${BOARD_INSET}" y="${BOARD_INSET}" width="${1000 - 2 * BOARD_INSET}" height="${1000 - 2 * BOARD_INSET - 8}" rx="24" fill="url(#vignette)"/>`);
};

// ---- chest --------------------------------------------------------------------------
//
// A cartoon chest in a 3/4 view, modelled on the reference: plank body with a
// rim band and base rail, a barrel lid wrapped by two straps, chunky corner
// feet and a U-shaped lock plate. Drawn with an oblique projection: the depth
// axis runs back to the upper left, so the left side and lid end cap show.

export const CHEST = { width: 300, height: 300, floor: 284 };

const X0 = 75; // front face, left edge
const X1 = 271; // front face, right edge
const DX = -46; // depth vector (front → back)
const DY = -34;
const FLOOR = CHEST.floor - 4;
const RAIL_H = 18; // base rail
const RIM_H = 14; // band between body and lid
const TOP = FLOOR - 112; // top of the planks (bottom of the rim band)
const RIM_TOP = TOP - RIM_H; // where the lid (or the opening) begins
const LID_R = 50; // barrel height
const STRAPS = [114, 206]; // strap left edges on the front face
const STRAP_W = 26;
const LOCK_X = (X0 + X1) / 2;
const OUT = `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;

const pt = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
const poly = (points: Array<[number, number]>, attrs: string) => `<polygon points="${points.map(([x, y]) => pt(x, y)).join(' ')}" ${attrs}/>`;

/** Left side face between two heights of the front edge. */
const side = (yTop: number, yBottom: number, attrs: string) =>
  poly([[X0, yTop], [X0 + DX, yTop + DY], [X0 + DX, yBottom + DY], [X0, yBottom]], attrs);

const lidHeightAt = (t: number) => LID_R * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
const lidY = (t: number) => RIM_TOP + DY * t - lidHeightAt(t);

/** Depth fraction of the barrel's crest as seen on screen (its highest point). */
const CREST = (() => {
  let best = 0;
  for (let t = 0; t <= 1; t += 0.001) if (lidY(t) < lidY(best)) best = t;
  return best;
})();

/** Barrel profile at horizontal position x, from depth `from` to `to` (0 = front). */
function arc(x: number, from = 0, to = 1) {
  const points: Array<[number, number]> = [];
  const steps = 20;
  for (let i = 0; i <= steps; i += 1) {
    const t = from + ((to - from) * i) / steps;
    points.push([x + DX * t, lidY(t)]);
  }
  return points;
}

/**
 * The visible curved surface of the barrel between x = a and x = b: the
 * front of the barrel up to its crest. (Beyond the crest it is hidden behind
 * the crest line or by the end cap.)
 */
const barrelBand = (a: number, b: number) => [...arc(b, 0, CREST), ...arc(a, CREST, 0)];

const rivet = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="${x - 1.4}" cy="${y - 1.4}" r="1.6" fill="#fff"/>`;

/** One cuboid foot whose front-bottom corner centre sits at (x, y). */
function foot(x: number, y: number, tier: TierColors) {
  const w = 30;
  const h = 24;
  const dx = DX * 0.42;
  const dy = DY * 0.42;
  const l = x - w / 2;
  const r = x + w / 2;
  return `
    ${poly([[l, y - h], [l + dx, y - h + dy], [l + dx, y + dy], [l, y]], `fill="${tier.trim.dark}" ${OUT}`)}
    ${poly([[l, y - h], [r, y - h], [r + dx, y - h + dy], [l + dx, y - h + dy]], `fill="${tier.trim.light}" ${OUT}`)}
    <rect x="${l}" y="${y - h}" width="${w}" height="${h}" rx="4" fill="${tier.trim.base}" ${OUT}/>
    <rect x="${l + 4}" y="${y - h + 4}" width="${w - 8}" height="5" rx="2.5" fill="#fff" fill-opacity="0.55"/>`;
}

function chestDefs(tier: TierColors) {
  return `
  <linearGradient id="lidTop" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${tier.body.light}"/>
    <stop offset="0.55" stop-color="${tier.body.base}"/>
    <stop offset="1" stop-color="${tier.body.dark}"/>
  </linearGradient>
  <linearGradient id="trimV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${tier.trim.light}"/>
    <stop offset="0.4" stop-color="${tier.trim.base}"/>
    <stop offset="1" stop-color="${tier.trim.dark}"/>
  </linearGradient>
  <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#000" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient>`;
}

/** Planks, rails, straps, front feet and lock: everything below the lid line. */
function chestBase(tier: TierColors) {
  const { body, trim } = tier;
  const plankH = (FLOOR - RAIL_H - TOP) / 3;
  const planks = [0, 1, 2]
    .map((i) => {
      const y = TOP + i * plankH;
      return `
    ${side(y, y + plankH, `fill="${body.side}" ${OUT}`)}
    <path d="M${X0 + DX} ${y + DY + 5} L${X0} ${y + 5}" stroke="#fff" stroke-opacity="0.18" stroke-width="3"/>
    <rect x="${X0}" y="${y}" width="${X1 - X0}" height="${plankH}" rx="7" fill="${body.base}" ${OUT}/>
    <rect x="${X0 + 5}" y="${y + 4}" width="${X1 - X0 - 10}" height="6" rx="3" fill="${body.light}"/>
    <rect x="${X0 + 5}" y="${y + plankH - 8}" width="${X1 - X0 - 10}" height="5" rx="2.5" fill="${body.dark}"/>`;
    })
    .join('');
  const straps = STRAPS.map(
    (x) => `
    <rect x="${x}" y="${RIM_TOP + 4}" width="${STRAP_W}" height="${FLOOR - RAIL_H - RIM_TOP}" rx="4" fill="url(#trimV)" ${OUT}/>
    <rect x="${x + 4}" y="${RIM_TOP + 8}" width="5" height="${FLOOR - RAIL_H - RIM_TOP - 10}" rx="2.5" fill="#fff" fill-opacity="0.45"/>
    ${rivet(x + STRAP_W / 2, TOP + 26)}${rivet(x + STRAP_W / 2, TOP + 74)}`,
  ).join('');
  return `
  <ellipse cx="${(X0 + X1 + DX) / 2}" cy="${FLOOR + 2}" rx="${(X1 - X0) / 2 + 40}" ry="22" fill="url(#shadow)"/>
  ${foot(X0 + DX + 18, FLOOR + DY, tier)}
  ${planks}
  ${side(FLOOR - RAIL_H, FLOOR, `fill="${trim.dark}" ${OUT}`)}
  <rect x="${X0 - 2}" y="${FLOOR - RAIL_H}" width="${X1 - X0 + 4}" height="${RAIL_H}" rx="5" fill="url(#trimV)" ${OUT}/>
  <rect x="${X0 + 4}" y="${FLOOR - RAIL_H + 4}" width="${X1 - X0 - 8}" height="4" rx="2" fill="#fff" fill-opacity="0.5"/>
  ${side(RIM_TOP, TOP, `fill="${trim.dark}" ${OUT}`)}
  <rect x="${X0 - 3}" y="${RIM_TOP}" width="${X1 - X0 + 6}" height="${RIM_H}" rx="4" fill="url(#trimV)" ${OUT}/>
  <rect x="${X0 + 3}" y="${RIM_TOP + 3}" width="${X1 - X0 - 6}" height="3.5" rx="1.75" fill="#fff" fill-opacity="0.6"/>
  <path d="M${X0 + 2} ${TOP + 3} H${X1 - 2}" stroke="${body.line}" stroke-width="4"/>
  ${straps}
  ${foot(X0 + 4, FLOOR, tier)}
  ${foot(X1 - 4, FLOOR, tier)}`;
}

function starPath(cx: number, cy: number, outer: number, inner: number) {
  let d = '';
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)} `;
  }
  return `${d}Z`;
}

/** Closed chest, whole. */
export const chestClosed = (tier: TierColors) => {
  const { body, trim } = tier;
  const shell = barrelBand(X0, X1);
  const cap = arc(X0);
  const strapBands = STRAPS.map((x) => poly(barrelBand(x, x + STRAP_W), `fill="url(#trimV)" ${OUT}`)).join('');
  // Highlight and shade lines running along the barrel.
  const glint = (t: number) => `M${X0 + DX * t + 10} ${lidY(t) + 2} H${X1 + DX * t - 10}`;
  return svg(CHEST.width, CHEST.height, `
  <defs>${chestDefs(tier)}</defs>
  ${chestBase(tier)}
  ${poly(shell, `fill="url(#lidTop)" ${OUT}`)}
  <path d="${glint(CREST * 0.72)}" stroke="#fff" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round"/>
  <path d="${glint(CREST * 0.25)}" stroke="${body.dark}" stroke-opacity="0.45" stroke-width="4" stroke-linecap="round"/>
  ${strapBands}
  ${poly(cap, `fill="${body.side}" ${OUT}`)}
  <rect x="${LOCK_X + DX * CREST - 12}" y="${lidY(CREST) - 7}" width="24" height="12" rx="4" fill="${trim.light}" ${OUT}/>
  ${chestLock(tier, false)}`);
};

/** The lock plate on its own, drawn last so it overlaps the lid edge. */
function chestLock(tier: TierColors, open: boolean) {
  const lockTop = open ? RIM_TOP + 2 : RIM_TOP - 12;
  const lockBottom = TOP + 52;
  return `
    <path d="M${LOCK_X - 20} ${lockTop} H${LOCK_X + 20} V${lockBottom - 20} Q${LOCK_X + 20} ${lockBottom} ${LOCK_X} ${lockBottom} Q${LOCK_X - 20} ${lockBottom} ${LOCK_X - 20} ${lockBottom - 20} Z" fill="url(#trimV)" ${OUT}/>
    <rect x="${LOCK_X - 14}" y="${lockTop + 5}" width="28" height="5" rx="2.5" fill="#fff" fill-opacity="0.55"/>
    ${
      tier.star
        ? `<path d="${starPath(LOCK_X, lockTop + 22, 10, 4.4)}" fill="#fff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
        : rivet(LOCK_X, lockTop + 20)
    }
    <circle cx="${LOCK_X}" cy="${lockBottom - 20}" r="5" fill="${INK}"/>
    <path d="M${LOCK_X - 3} ${lockBottom - 18} H${LOCK_X + 3} L${LOCK_X + 2} ${lockBottom - 9} H${LOCK_X - 2} Z" fill="${INK}"/>`;
}

/** Open chest: lid stood up behind, glowing inside, a heap of coins. */
export const chestOpen = (tier: TierColors) => {
  const { body, trim } = tier;
  // Hinge along the back top edge; the lid stands up and leans back a little.
  const hy = RIM_TOP + DY;
  const hl = X0 + DX;
  const hr = X1 + DX;
  const lean = -14;
  const lidH = 112;
  const outer: Array<[number, number]> = [[hl, hy], [hr, hy], [hr + lean, hy - lidH], [hl + lean, hy - lidH]];
  const inset = 11;
  const inner: Array<[number, number]> = [
    [hl + inset, hy - 4],
    [hr - inset, hy - 4],
    [hr + lean - inset + 2, hy - lidH + inset],
    [hl + lean + inset + 2, hy - lidH + inset],
  ];
  // Opening in the top of the body.
  const opening: Array<[number, number]> = [[X0, RIM_TOP], [X1, RIM_TOP], [X1 + DX, RIM_TOP + DY], [X0 + DX, RIM_TOP + DY]];
  let seed = 11;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const coins: string[] = [];
  for (let row = 0; row < 5; row += 1) {
    const t = 0.85 - row * 0.17;
    const count = 9 - Math.abs(row - 2);
    for (let i = 0; i < count; i += 1) {
      const fx = (i + 0.5 + (rand() - 0.5) * 0.5) / count;
      const x = X0 + 16 + fx * (X1 - X0 - 32) + DX * t;
      const bulge = Math.sin(fx * Math.PI) * 26 + 8;
      const y = RIM_TOP + DY * t - bulge * (0.6 + 0.4 * (1 - Math.abs(t - 0.5) * 2)) + 6;
      const r = (rand() - 0.5) * 30;
      coins.push(`
    <g transform="rotate(${r.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">
      <ellipse cx="${x.toFixed(1)}" cy="${(y + 3).toFixed(1)}" rx="13" ry="6.5" fill="${GOLD.dark}" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="13" ry="6.5" fill="#fff4b8" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="3" fill="none" stroke="${GOLD.base}" stroke-width="1.6"/>
    </g>`);
    }
  }
  const glint = (x: number, y: number, r: number) =>
    `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z" fill="#fff"/>`;
  return svg(CHEST.width, CHEST.height, `
  <defs>
    ${chestDefs(tier)}
    <linearGradient id="lidInside" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#fff8cf"/>
      <stop offset="0.45" stop-color="#ffd84a"/>
      <stop offset="1" stop-color="#f7a21b"/>
    </linearGradient>
    <linearGradient id="hole" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe98a"/>
      <stop offset="1" stop-color="#ffb52e"/>
    </linearGradient>
  </defs>
  ${poly(outer, `fill="url(#trimV)" ${OUT}`)}
  ${poly(inner, `fill="url(#lidInside)"`)}
  <path d="M${hl + lean + inset + 14} ${hy - lidH + inset + 12} L${hl + inset + 10} ${hy - 20}" stroke="#fff" stroke-opacity="0.6" stroke-width="6" stroke-linecap="round"/>
  <path d="M${hl} ${hy} Q${hl - 18 + lean} ${hy - lidH / 2} ${hl + lean} ${hy - lidH} Z" fill="${body.side}" ${OUT}/>
  ${chestBase(tier)}
  ${poly(opening, `fill="url(#hole)" ${OUT}`)}
  ${coins.join('')}
  ${glint(X0 + 40, RIM_TOP - 30, 7)}${glint(X1 - 60, RIM_TOP - 44, 9)}${glint(LOCK_X - 10, RIM_TOP - 52, 6)}
  ${side(RIM_TOP, TOP, `fill="${trim.dark}" ${OUT}`)}
  <rect x="${X0 - 3}" y="${RIM_TOP}" width="${X1 - X0 + 6}" height="${RIM_H}" rx="4" fill="url(#trimV)" ${OUT}/>
  <rect x="${X0 + 3}" y="${RIM_TOP + 3}" width="${X1 - X0 - 6}" height="3.5" rx="1.75" fill="#fff" fill-opacity="0.6"/>
  ${STRAPS.map((x) => `<rect x="${x}" y="${RIM_TOP + 4}" width="${STRAP_W}" height="${TOP - RIM_TOP + 30}" rx="4" fill="url(#trimV)" ${OUT}/>${rivet(x + STRAP_W / 2, TOP + 26)}`).join('')}
  ${chestLock(tier, true)}`);
};

// ---- badge (loss / draw) ------------------------------------------------------------

export const badge = (metal: 'silver' | 'bronze') => {
  const colors =
    metal === 'silver'
      ? { light: '#ffffff', base: '#cfd6e6', dark: '#8b95ad', ribbon: '#5b6cff', ribbonDark: '#3440b8' }
      : { light: '#ffe0c2', base: '#e9a46a', dark: '#a8612d', ribbon: '#2fb98c', ribbonDark: '#1a7a5b' };
  return svg(220, 250, `
  <defs>
    <linearGradient id="m" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${colors.light}"/>
      <stop offset="0.5" stop-color="${colors.base}"/>
      <stop offset="1" stop-color="${colors.dark}"/>
    </linearGradient>
    <linearGradient id="in" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${colors.ribbon}"/>
      <stop offset="1" stop-color="${colors.ribbonDark}"/>
    </linearGradient>
  </defs>
  <path d="M60 170 L40 244 L76 224 L96 250 L110 176 Z" fill="${colors.ribbonDark}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M160 170 L180 244 L144 224 L124 250 L110 176 Z" fill="${colors.ribbon}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M110 12 L196 44 L190 128 Q180 176 110 206 Q40 176 30 128 L24 44 Z" fill="${INK}" transform="translate(0 6)"/>
  <path d="M110 12 L196 44 L190 128 Q180 176 110 206 Q40 176 30 128 L24 44 Z" fill="url(#m)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M110 36 L174 60 L170 124 Q162 160 110 184 Q58 160 50 124 L46 60 Z" fill="url(#in)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M110 64 L122 92 L152 94 L129 113 L137 143 L110 126 L83 143 L91 113 L68 94 L98 92 Z" fill="url(#m)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M40 50 L110 24 L180 50" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="7" stroke-linecap="round"/>`);
};

// ---- reward icons -------------------------------------------------------------------

export const coinIcon = () =>
  svg(100, 100, `
  <defs>${goldGradient('g')}</defs>
  <circle cx="50" cy="54" r="42" fill="${INK}"/>
  <circle cx="50" cy="50" r="42" fill="url(#g)" stroke="${INK}" stroke-width="5"/>
  <circle cx="50" cy="50" r="30" fill="none" stroke="${GOLD.deep}" stroke-width="4"/>
  <path d="M50 30 L56 44 L71 45 L59 55 L63 70 L50 62 L37 70 L41 55 L29 45 L44 44 Z" fill="${GOLD.dark}"/>
  <path d="M24 38 Q34 18 56 16" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="5" stroke-linecap="round"/>`);

export const gemIcon = () =>
  svg(100, 100, `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd6f2"/><stop offset="0.5" stop-color="#ff5fb8"/><stop offset="1" stop-color="#b3137a"/>
    </linearGradient>
  </defs>
  <path d="M28 18 L72 18 L92 42 L50 92 L8 42 Z" fill="${INK}" transform="translate(0 4)"/>
  <path d="M28 18 L72 18 L92 42 L50 92 L8 42 Z" fill="url(#g)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M8 42 L92 42 M28 18 L38 42 L50 92 M72 18 L62 42 L50 92 M38 42 L50 18 L62 42" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="3"/>
  <path d="M30 24 L44 24 L36 38 Z" fill="#fff" fill-opacity="0.75"/>`);

export const crownIcon = () =>
  svg(100, 100, `
  <defs>${goldGradient('g')}</defs>
  <path d="M14 34 L32 54 L50 20 L68 54 L86 34 L80 80 L20 80 Z" fill="${INK}" transform="translate(0 4)"/>
  <path d="M14 34 L32 54 L50 20 L68 54 L86 34 L80 80 L20 80 Z" fill="url(#g)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <rect x="18" y="72" width="64" height="14" rx="5" fill="url(#g)" stroke="${INK}" stroke-width="5"/>
  <circle cx="50" cy="20" r="7" fill="#ff5fb8" stroke="${INK}" stroke-width="3"/>
  <circle cx="14" cy="34" r="6" fill="#3b9cff" stroke="${INK}" stroke-width="3"/>
  <circle cx="86" cy="34" r="6" fill="#39d98f" stroke="${INK}" stroke-width="3"/>
  <circle cx="50" cy="60" r="7" fill="#ff5fb8" stroke="${INK}" stroke-width="3"/>
  <path d="M26 64 L40 64" stroke="#fff" stroke-opacity="0.7" stroke-width="4" stroke-linecap="round"/>`);

export const starIcon = () =>
  svg(100, 100, `
  <defs>${goldGradient('g')}</defs>
  <path d="M50 8 L62 36 L92 38 L69 58 L77 88 L50 72 L23 88 L31 58 L8 38 L38 36 Z" fill="url(#g)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M40 30 L50 14" stroke="#fff" stroke-opacity="0.8" stroke-width="5" stroke-linecap="round"/>`);

/** Four-point sparkle, white; tinted in Pixi. */
export const sparkle = () =>
  svg(64, 64, `
  <defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient></defs>
  <circle cx="32" cy="32" r="16" fill="url(#g)" fill-opacity="0.7"/>
  <path d="M32 2 Q35 29 62 32 Q35 35 32 62 Q29 35 2 32 Q29 29 32 2 Z" fill="#fff"/>`);

// ---- result backdrop ----------------------------------------------------------------

/** Soft radial light, white; tinted per tier. */
export const glowDisc = () =>
  svg(256, 256, `
  <defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff" stop-opacity="1"/>
    <stop offset="0.35" stop-color="#fff" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient></defs>
  <circle cx="128" cy="128" r="128" fill="url(#g)"/>`);

/** 20 god-rays fading outward. */
export const rays = () => {
  const count = 14;
  const wedges = Array.from({ length: count }, (_, index) => {
    const a = (index / count) * Math.PI * 2 + (index % 2) * 0.08;
    const spread = (Math.PI / count) * (index % 2 ? 0.35 : 0.6);
    const r = 512;
    const x1 = 512 + Math.cos(a - spread) * r;
    const y1 = 512 + Math.sin(a - spread) * r;
    const x2 = 512 + Math.cos(a + spread) * r;
    const y2 = 512 + Math.sin(a + spread) * r;
    return `<path d="M512 512 L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z"/>`;
  }).join('');
  // Soft beams: blurred wedges fading out from a bright core.
  return svg(1024, 1024, `
  <defs>
    <radialGradient id="fade" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="core" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <g fill="url(#fade)" filter="url(#soft)">${wedges}</g>
  <circle cx="512" cy="512" r="300" fill="url(#core)"/>`);
};

/** Glowing platform ring under the chest; white, tinted per tier. */
export const ring = () =>
  svg(320, 120, `
  <defs>
    <radialGradient id="g" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="0.7" stop-color="#fff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="160" cy="60" rx="156" ry="56" fill="url(#g)"/>
  <ellipse cx="160" cy="60" rx="118" ry="36" fill="none" stroke="#fff" stroke-width="7" stroke-opacity="0.95"/>
  <ellipse cx="160" cy="60" rx="136" ry="44" fill="none" stroke="#fff" stroke-width="2.5" stroke-opacity="0.5"/>`);

/** Full-screen background: a vertical radial wash with scattered star dust. */
export const backdrop = (inner: string, outer: string) => {
  const dust = Array.from({ length: 60 }, (_, index) => {
    const x = (index * 173) % 1000;
    const y = (index * 311) % 1000;
    const r = 1 + (index % 3) * 0.8;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity="${0.06 + (index % 5) * 0.03}"/>`;
  }).join('');
  // The reference's faint tiled four-point stars.
  const star = (x: number, y: number, r: number) =>
    `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z"/>`;
  return svg(1000, 1000, `
  <defs>
    <radialGradient id="g" cx="0.5" cy="0.4" r="0.72">
      <stop offset="0" stop-color="${inner}"/>
      <stop offset="1" stop-color="${outer}"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.72">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
    <pattern id="stars" width="80" height="80" patternUnits="userSpaceOnUse">
      <g fill="#fff" fill-opacity="0.07">${star(20, 20, 7)}${star(60, 60, 7)}</g>
    </pattern>
  </defs>
  <rect width="1000" height="1000" fill="url(#g)"/>
  <rect width="1000" height="1000" fill="url(#stars)"/>
  ${dust}
  <rect width="1000" height="1000" fill="url(#vignette)"/>`);
};

// ---- UI chrome ----------------------------------------------------------------------

/** Chunky 3D pill. 240×96 with 40px corners; used as a nine-slice (slice 44). */
export const buttonSkin = (id: SkinId) => {
  const skin = SKINS[id];
  // Reference look: bright gradient face, thin ink outline, a dark base under it
  // and a darker lip along the bottom of the face.
  return svg(240, 96, `
  <defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${skin.top}"/><stop offset="1" stop-color="${skin.bottom}"/>
    </linearGradient>
    <clipPath id="face"><rect x="4" y="4" width="232" height="78" rx="30"/></clipPath>
  </defs>
  <rect x="4" y="12" width="232" height="80" rx="30" fill="${INK}"/>
  <rect x="4" y="4" width="232" height="78" rx="30" fill="url(#t)"/>
  <g clip-path="url(#face)">
    <rect x="0" y="68" width="240" height="20" fill="${skin.edge}"/>
    <rect x="20" y="10" width="200" height="12" rx="6" fill="#fff" fill-opacity="0.55"/>
  </g>
  <rect x="4" y="4" width="232" height="78" rx="30" fill="none" stroke="${INK}" stroke-width="4"/>`);
};

/** Round icon button face, 96×96. */
export const roundSkin = (id: SkinId) => {
  const skin = SKINS[id];
  return svg(96, 96, `
  <defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${skin.top}"/><stop offset="1" stop-color="${skin.bottom}"/>
    </linearGradient>
    <clipPath id="face"><circle cx="48" cy="44" r="40"/></clipPath>
  </defs>
  <circle cx="48" cy="51" r="40" fill="${INK}"/>
  <circle cx="48" cy="44" r="40" fill="url(#t)"/>
  <g clip-path="url(#face)">
    <rect x="0" y="72" width="96" height="20" fill="${skin.edge}"/>
    <ellipse cx="48" cy="20" rx="24" ry="8" fill="#fff" fill-opacity="0.4"/>
  </g>
  <circle cx="48" cy="44" r="40" fill="none" stroke="${INK}" stroke-width="4"/>`);
};

/** Glassy dark panel for popups and cards; nine-slice (slice 48). */
export const panel = () =>
  svg(160, 160, `
  <defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3d2a6b"/><stop offset="1" stop-color="#241646"/>
  </linearGradient></defs>
  <rect x="4" y="10" width="152" height="146" rx="36" fill="#0d0620" fill-opacity="0.6"/>
  <rect x="4" y="4" width="152" height="146" rx="36" fill="url(#p)" stroke="${INK}" stroke-width="5"/>
  <rect x="10" y="10" width="140" height="134" rx="30" fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="3"/>
  <rect x="24" y="14" width="112" height="10" rx="5" fill="#fff" fill-opacity="0.1"/>`);

/** Light card used for choices inside panels; nine-slice (slice 40). */
export const card = (selected: boolean) =>
  svg(140, 140, `
  <rect x="4" y="9" width="132" height="127" rx="28" fill="#0d0620" fill-opacity="0.45"/>
  <rect x="4" y="4" width="132" height="127" rx="28" fill="${selected ? '#fff7d6' : '#f4efff'}" stroke="${selected ? GOLD.dark : INK}" stroke-width="${selected ? 7 : 5}"/>
  <rect x="18" y="12" width="104" height="10" rx="5" fill="#fff" fill-opacity="0.9"/>`);

/** Orange-gold reward tile from the reference result screen; nine-slice (slice 40). */
export const rewardCard = (rainbow = false) =>
  svg(140, 140, `
  <defs>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd35a"/>
      <stop offset="0.55" stop-color="#ffac2e"/>
      <stop offset="1" stop-color="#f08214"/>
    </linearGradient>
    <linearGradient id="rainbow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff7ab6"/>
      <stop offset="0.35" stop-color="#ffd84a"/>
      <stop offset="0.65" stop-color="#6fe3ff"/>
      <stop offset="1" stop-color="#b98cff"/>
    </linearGradient>
  </defs>
  <rect x="4" y="10" width="132" height="126" rx="22" fill="${INK}"/>
  <rect x="4" y="4" width="132" height="126" rx="22" fill="url(#face)" stroke="${INK}" stroke-width="5"/>
  <rect x="11" y="11" width="118" height="112" rx="16" fill="none" stroke="${rainbow ? 'url(#rainbow)' : '#fff1b8'}" stroke-width="${rainbow ? 6 : 3}" stroke-opacity="${rainbow ? 1 : 0.8}"/>
  <rect x="20" y="16" width="100" height="8" rx="4" fill="#fff" fill-opacity="0.6"/>`);

/** Compact dark pill for currency counters, as in the reference; nine-slice (slice 20). */
export const pill = () =>
  svg(96, 48, `
  <rect x="2" y="2" width="92" height="44" rx="22" fill="#0e0620" fill-opacity="0.72" stroke="#000" stroke-opacity="0.35" stroke-width="3"/>
  <rect x="12" y="6" width="72" height="4" rx="2" fill="#fff" fill-opacity="0.06"/>`);

/** Dark rounded tray holding the tab chips; nine-slice (slice 22). */
export const tabTray = () =>
  svg(96, 56, `
  <rect x="2" y="2" width="92" height="52" rx="18" fill="#0e0620" fill-opacity="0.7" stroke="#000" stroke-opacity="0.35" stroke-width="3"/>`);

/** Active tab chip: bright yellow with an ink outline; nine-slice (slice 18). */
export const tabChip = () =>
  svg(96, 44, `
  <defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe96e"/><stop offset="1" stop-color="#ffb320"/>
  </linearGradient></defs>
  <rect x="2" y="2" width="92" height="40" rx="14" fill="url(#t)" stroke="${INK}" stroke-width="3"/>
  <rect x="10" y="6" width="76" height="6" rx="3" fill="#fff" fill-opacity="0.5"/>`);

/** Chunky tile in the reward-card style, in any colour; nine-slice (slice 40). */
export const tile = (top: string, bottom: string, frame: string) =>
  svg(140, 140, `
  <defs>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect x="4" y="10" width="132" height="126" rx="22" fill="${INK}"/>
  <rect x="4" y="4" width="132" height="126" rx="22" fill="url(#face)" stroke="${INK}" stroke-width="5"/>
  <rect x="11" y="11" width="118" height="112" rx="16" fill="none" stroke="${frame}" stroke-width="3" stroke-opacity="0.8"/>
  <rect x="20" y="16" width="100" height="8" rx="4" fill="#fff" fill-opacity="0.45"/>`);

/** Gold frame drawn around the player tile whose turn it is; nine-slice (slice 40). */
export const tileFrame = () =>
  svg(140, 140, `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff3a6"/><stop offset="0.5" stop-color="#ffc83a"/><stop offset="1" stop-color="#ff9a1f"/>
  </linearGradient></defs>
  <rect x="3" y="3" width="134" height="134" rx="26" fill="none" stroke="url(#g)" stroke-width="6"/>`);

// ---- line icons (white, tinted by the button) -----------------------------------------

const icon = (body: string) =>
  svg(64, 64, `<g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${body}</g>`);

export const ICONS = {
  undo: () => icon('<path d="M22 20 L10 32 L22 44"/><path d="M10 32 H40 A14 14 0 0 1 40 60 H30"/>'),
  flag: () => icon('<path d="M16 58 V8"/><path d="M16 10 H48 L40 22 L48 34 H16" fill="#fff" fill-opacity="0.2"/>'),
  menu: () => icon('<path d="M12 18 H52 M12 32 H52 M12 46 H52"/>'),
  home: () => icon('<path d="M10 30 L32 12 L54 30"/><path d="M16 26 V52 H48 V26"/><path d="M28 52 V38 H36 V52"/>'),
  soundOn: () => icon('<path d="M10 24 H20 L32 12 V52 L20 40 H10 Z" fill="#fff" fill-opacity="0.2"/><path d="M42 22 Q50 32 42 42"/><path d="M48 14 Q62 32 48 50"/>'),
  soundOff: () => icon('<path d="M10 24 H20 L32 12 V52 L20 40 H10 Z" fill="#fff" fill-opacity="0.2"/><path d="M42 24 L58 40 M58 24 L42 40"/>'),
  close: () => icon('<path d="M16 16 L48 48 M48 16 L16 48"/>'),
  back: () => icon('<path d="M38 12 L18 32 L38 52"/>'),
  copy: () => icon('<rect x="20" y="20" width="32" height="34" rx="6"/><path d="M12 42 V14 A4 4 0 0 1 16 10 H40"/>'),
  robot: () => icon('<rect x="12" y="20" width="40" height="32" rx="10"/><path d="M32 20 V10"/><circle cx="32" cy="8" r="3" fill="#fff"/><circle cx="24" cy="36" r="4" fill="#fff"/><circle cx="40" cy="36" r="4" fill="#fff"/><path d="M26 45 H38"/>'),
  users: () => icon('<circle cx="24" cy="22" r="9"/><path d="M8 52 Q10 36 24 36 Q38 36 40 52"/><circle cx="44" cy="24" r="7"/><path d="M42 36 Q54 36 56 50"/>'),
  globe: () => icon('<circle cx="32" cy="32" r="22"/><path d="M10 32 H54"/><path d="M32 10 Q20 32 32 54 Q44 32 32 10"/>'),
  play: () => icon('<path d="M22 14 L50 32 L22 50 Z" fill="#fff"/>'),
  swords: () => icon('<path d="M12 12 L40 40 M52 12 L24 40"/><path d="M34 46 L46 34 M18 34 L30 46"/><path d="M40 40 L52 52 M24 40 L12 52"/>'),
  podium: () => icon('<path d="M24 30 H40 V54 H24 Z" fill="#fff" fill-opacity="0.25"/><path d="M8 38 H24 V54 H8 Z M40 44 H56 V54 H40 Z"/><path d="M32 10 L35 17 L42 17 L36 21 L38 28 L32 24 L26 28 L28 21 L22 17 L29 17 Z" fill="#fff"/>'),
  trophy: () => icon('<path d="M20 10 H44 V26 A12 12 0 0 1 20 26 Z" fill="#fff" fill-opacity="0.25"/><path d="M20 16 H10 Q10 30 22 30 M44 16 H54 Q54 30 42 30"/><path d="M32 38 V48 M22 54 H42"/>'),
  restart: () => icon('<path d="M48 22 A20 20 0 1 0 52 36"/><path d="M50 10 V24 H36"/>'),
  book: () => icon('<path d="M32 16 Q22 10 10 12 V50 Q22 48 32 54 Q42 48 54 50 V12 Q42 10 32 16 Z" fill="#fff" fill-opacity="0.2"/><path d="M32 16 V54"/>'),
};

export type IconId = keyof typeof ICONS;

// ---- avatars ------------------------------------------------------------------------

const avatarFrame = (bgTop: string, bgBottom: string, body: string) =>
  svg(120, 120, `
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${bgTop}"/><stop offset="1" stop-color="${bgBottom}"/>
  </linearGradient>
  <clipPath id="c"><circle cx="60" cy="60" r="54"/></clipPath></defs>
  <circle cx="60" cy="63" r="56" fill="${INK}"/>
  <circle cx="60" cy="60" r="56" fill="url(#bg)" stroke="${INK}" stroke-width="5"/>
  <g clip-path="url(#c)">${body}</g>
  <circle cx="60" cy="60" r="56" fill="none" stroke="${INK}" stroke-width="5"/>`);

export const AVATARS = {
  /** Bean sprout: a round seed with two leaves. */
  sprout: () =>
    avatarFrame('#c9f7a3', '#6cc24a', `
    <path d="M60 44 Q58 26 44 18 Q62 16 64 36" fill="#39b54a" stroke="${INK}" stroke-width="4"/>
    <path d="M62 42 Q70 22 90 22 Q84 42 64 44" fill="#5ad65f" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="60" cy="80" rx="36" ry="32" fill="#fff4cf" stroke="${INK}" stroke-width="5"/>
    <circle cx="48" cy="78" r="5" fill="${INK}"/><circle cx="72" cy="78" r="5" fill="${INK}"/>
    <circle cx="50" cy="76" r="1.6" fill="#fff"/><circle cx="74" cy="76" r="1.6" fill="#fff"/>
    <ellipse cx="40" cy="90" rx="7" ry="4" fill="#ff9fb0" fill-opacity="0.8"/><ellipse cx="80" cy="90" rx="7" ry="4" fill="#ff9fb0" fill-opacity="0.8"/>
    <path d="M54 90 Q60 96 66 90" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`),
  /** Fox with a cheeky grin. */
  fox: () =>
    avatarFrame('#ffd9a8', '#ff9a3c', `
    <path d="M22 30 L44 52 L30 64 Z" fill="#ff7a1a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M98 30 L76 52 L90 64 Z" fill="#ff7a1a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M28 38 L38 50 L32 56 Z" fill="#fff1e0"/><path d="M92 38 L82 50 L88 56 Z" fill="#fff1e0"/>
    <path d="M60 104 L22 64 Q24 44 60 42 Q96 44 98 64 Z" fill="#ff8a2a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M60 104 L30 72 Q44 76 60 70 Q76 76 90 72 Z" fill="#fff4e6" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M42 64 Q48 58 54 64" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="74" cy="63" r="5" fill="${INK}"/><circle cx="76" cy="61" r="1.6" fill="#fff"/>
    <circle cx="60" cy="84" r="5" fill="${INK}"/>
    <path d="M52 92 Q60 98 70 90" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`),
  /** Owl grandmaster with round glasses. */
  owl: () =>
    avatarFrame('#b9a6ff', '#6b4bd6', `
    <path d="M30 36 L40 20 L50 38 Z" fill="#8a5a3c" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M90 36 L80 20 L70 38 Z" fill="#8a5a3c" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="60" cy="76" rx="42" ry="44" fill="#a8744f" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="60" cy="96" rx="26" ry="22" fill="#f3dcc0"/>
    <path d="M48 92 Q52 96 56 92 M64 92 Q68 96 72 92 M54 104 Q58 108 62 104 M62 104 Q66 108 70 104" fill="none" stroke="#c49a73" stroke-width="3" stroke-linecap="round"/>
    <circle cx="43" cy="62" r="17" fill="#fff" stroke="${INK}" stroke-width="5"/><circle cx="77" cy="62" r="17" fill="#fff" stroke="${INK}" stroke-width="5"/>
    <path d="M60 60 L60 60" stroke="${INK}" stroke-width="5"/><path d="M58 58 Q60 54 62 58" fill="none" stroke="${INK}" stroke-width="4"/>
    <circle cx="45" cy="63" r="7" fill="${INK}"/><circle cx="75" cy="63" r="7" fill="${INK}"/>
    <circle cx="47" cy="60" r="2.2" fill="#fff"/><circle cx="77" cy="60" r="2.2" fill="#fff"/>
    <path d="M54 72 L60 84 L66 72 Z" fill="#ffb43a" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`),
  /** Dragon sage, the master opponent: jade head, golden horns and whiskers, flame mane. */
  master: () =>
    avatarFrame('#ffb199', '#d83b3b', `
    <path d="M28 60 L8 46 L20 66 L4 72 L22 80 L10 94 L32 88 Z" fill="#ff8a2a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M92 60 L112 46 L100 66 L116 72 L98 80 L110 94 L88 88 Z" fill="#ff8a2a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M44 40 Q36 24 24 14 M36 28 Q28 28 22 32" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
    <path d="M76 40 Q84 24 96 14 M84 28 Q92 28 98 32" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
    <path d="M44 40 Q36 24 24 14 M36 28 Q28 28 22 32" fill="none" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>
    <path d="M76 40 Q84 24 96 14 M84 28 Q92 28 98 32" fill="none" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>
    <path d="M24 72 Q24 36 60 36 Q96 36 96 72 Q96 104 60 106 Q24 104 24 72 Z" fill="#43c07a" stroke="${INK}" stroke-width="5"/>
    <circle cx="60" cy="46" r="5" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>
    <path d="M32 52 L52 58 M88 52 L68 58" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="44" cy="66" r="9" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="76" cy="66" r="9" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <circle cx="46" cy="67" r="4.5" fill="${INK}"/><circle cx="74" cy="67" r="4.5" fill="${INK}"/>
    <circle cx="47" cy="65" r="1.5" fill="#fff"/><circle cx="75" cy="65" r="1.5" fill="#fff"/>
    <ellipse cx="60" cy="90" rx="24" ry="14" fill="#b8f0c8" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="52" cy="86" rx="3" ry="2.4" fill="${INK}"/><ellipse cx="68" cy="86" rx="3" ry="2.4" fill="${INK}"/>
    <path d="M51 96 Q60 101 69 96" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M36 90 Q20 88 14 100 Q10 110 22 112 M84 90 Q100 88 106 100 Q110 110 98 112" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M36 90 Q20 88 14 100 Q10 110 22 112 M84 90 Q100 88 106 100 Q110 110 98 112" fill="none" stroke="#ffd23f" stroke-width="3.5" stroke-linecap="round"/>`),
  /** The local player. */
  you: () =>
    avatarFrame('#9ef0ff', '#29a9d6', `
    <circle cx="60" cy="52" r="22" fill="#ffe0c4" stroke="${INK}" stroke-width="5"/>
    <path d="M38 48 Q40 26 62 28 Q84 28 84 50 Q72 40 60 44 Q48 38 38 48 Z" fill="#3a2555" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="52" cy="56" r="3.5" fill="${INK}"/><circle cx="68" cy="56" r="3.5" fill="${INK}"/>
    <path d="M54 64 Q60 69 66 64" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M20 120 Q24 82 60 82 Q96 82 100 120 Z" fill="#ffd23f" stroke="${INK}" stroke-width="5"/>`),
  /** The other human (local or online). */
  friend: () =>
    avatarFrame('#ffc4d8', '#ff5f8f', `
    <circle cx="60" cy="52" r="22" fill="#ffe0c4" stroke="${INK}" stroke-width="5"/>
    <path d="M36 56 Q34 26 60 26 Q86 26 84 56 L84 70 Q76 60 78 46 Q66 44 60 34 Q52 46 42 46 Q44 60 36 70 Z" fill="#7a3b1e" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="52" cy="56" r="3.5" fill="${INK}"/><circle cx="68" cy="56" r="3.5" fill="${INK}"/>
    <path d="M54 64 Q60 69 66 64" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M20 120 Q24 82 60 82 Q96 82 100 120 Z" fill="#3b9cff" stroke="${INK}" stroke-width="5"/>`),
};

export type AvatarId = keyof typeof AVATARS;

// ---- logo ---------------------------------------------------------------------------

/** Two stones leaning on each other, used above the title. */
export const logoStones = () =>
  svg(220, 140, `
  <defs>
    <radialGradient id="b" cx="0.36" cy="0.3" r="0.78">
      <stop offset="0" stop-color="#6b6f7c"/><stop offset="0.35" stop-color="#2a2d36"/><stop offset="1" stop-color="#050608"/>
    </radialGradient>
    <radialGradient id="w" cx="0.36" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#f1efe8"/><stop offset="1" stop-color="#bdb8ac"/>
    </radialGradient>
  </defs>
  <ellipse cx="110" cy="124" rx="96" ry="12" fill="#000" fill-opacity="0.3"/>
  <circle cx="78" cy="72" r="52" fill="url(#b)" stroke="${INK}" stroke-width="6"/>
  <ellipse cx="60" cy="50" rx="18" ry="10" fill="#fff" fill-opacity="0.4" transform="rotate(-28 60 50)"/>
  <circle cx="146" cy="78" r="48" fill="url(#w)" stroke="${INK}" stroke-width="6"/>
  <ellipse cx="130" cy="58" rx="16" ry="9" fill="#fff" transform="rotate(-28 130 58)"/>`);

export const favicon = () => logoStones();
