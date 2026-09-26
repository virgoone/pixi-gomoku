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
  <rect x="6" y="14" width="988" height="980" rx="56" fill="${INK}"/>
  <rect x="6" y="6" width="988" height="980" rx="56" fill="url(#frame)" stroke="${INK}" stroke-width="8"/>
  <rect x="22" y="18" width="956" height="22" rx="11" fill="#fff" fill-opacity="0.18"/>
  <rect x="${BOARD_INSET - 8}" y="${BOARD_INSET - 8}" width="${1000 - 2 * (BOARD_INSET - 8)}" height="${1000 - 2 * (BOARD_INSET - 8) - 8}" rx="30" fill="#4a2208" fill-opacity="0.55"/>
  <rect x="${BOARD_INSET}" y="${BOARD_INSET}" width="${1000 - 2 * BOARD_INSET}" height="${1000 - 2 * BOARD_INSET - 8}" rx="24" fill="url(#wood)"/>
  <g>${grain}</g>
  <rect x="${BOARD_INSET}" y="${BOARD_INSET}" width="${1000 - 2 * BOARD_INSET}" height="${1000 - 2 * BOARD_INSET - 8}" rx="24" fill="url(#vignette)"/>`);
};

// ---- chest --------------------------------------------------------------------------

export const CHEST = { width: 240, bodyHeight: 160, lidHeight: 120 };

export const chestBody = (tier: TierColors) =>
  svg(CHEST.width, CHEST.bodyHeight, `
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tier.light}"/>
      <stop offset="0.35" stop-color="${tier.base}"/>
      <stop offset="1" stop-color="${tier.dark}"/>
    </linearGradient>
    ${goldGradient('gold')}
    ${goldGradient('goldH', false)}
  </defs>
  <rect x="14" y="16" width="212" height="138" rx="20" fill="${INK}"/>
  <rect x="14" y="10" width="212" height="138" rx="20" fill="url(#body)" stroke="${INK}" stroke-width="6"/>
  <rect x="17" y="13" width="206" height="24" rx="12" fill="${tier.rim}" fill-opacity="0.85"/>
  <rect x="30" y="46" width="180" height="9" rx="4.5" fill="#fff" fill-opacity="0.3"/>
  <rect x="17" y="116" width="206" height="29" rx="14" fill="#000" fill-opacity="0.13"/>
  ${[40, 174]
    .map(
      (x) => `
    <rect x="${x}" y="8" width="26" height="144" rx="7" fill="url(#gold)" stroke="${INK}" stroke-width="4.5"/>
    <rect x="${x + 5}" y="14" width="6" height="128" rx="3" fill="#fff" fill-opacity="0.55"/>
    <circle cx="${x + 13}" cy="${36}" r="4" fill="${GOLD.deep}"/>
    <circle cx="${x + 13}" cy="${126}" r="4" fill="${GOLD.deep}"/>`,
    )
    .join('')}
  <path d="M14 128 L14 138 Q14 148 26 148 L44 148 L44 128 Z" fill="url(#gold)" stroke="${INK}" stroke-width="4"/>
  <path d="M226 128 L226 138 Q226 148 214 148 L196 148 L196 128 Z" fill="url(#gold)" stroke="${INK}" stroke-width="4"/>
  <rect x="94" y="26" width="52" height="60" rx="12" fill="url(#goldH)" stroke="${INK}" stroke-width="5"/>
  <rect x="100" y="32" width="40" height="10" rx="5" fill="#fff" fill-opacity="0.6"/>
  <circle cx="120" cy="54" r="8" fill="${INK}"/>
  <path d="M115 56 L125 56 L122 74 L118 74 Z" fill="${INK}"/>`);

export const chestLidClosed = (tier: TierColors) =>
  svg(CHEST.width, CHEST.lidHeight, `
  <defs>
    <linearGradient id="lid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tier.lidLight}"/>
      <stop offset="0.45" stop-color="${tier.lidBase}"/>
      <stop offset="1" stop-color="${tier.lidDark}"/>
    </linearGradient>
    ${goldGradient('gold')}
    <clipPath id="dome"><path d="M14 112 L14 64 Q14 14 120 14 Q226 14 226 64 L226 112 Z"/></clipPath>
  </defs>
  <path d="M14 114 L14 66 Q14 18 120 18 Q226 18 226 66 L226 114 Z" fill="${INK}"/>
  <path d="M14 110 L14 62 Q14 12 120 12 Q226 12 226 62 L226 110 Z" fill="url(#lid)" stroke="${INK}" stroke-width="6"/>
  <g clip-path="url(#dome)">
    <rect x="0" y="88" width="240" height="30" fill="${tier.rim}" fill-opacity="0.45"/>
    <rect x="40" y="0" width="26" height="120" fill="url(#gold)" stroke="${INK}" stroke-width="4.5"/>
    <rect x="174" y="0" width="26" height="120" fill="url(#gold)" stroke="${INK}" stroke-width="4.5"/>
    <rect x="45" y="10" width="6" height="100" rx="3" fill="#fff" fill-opacity="0.55"/>
    <rect x="179" y="10" width="6" height="100" rx="3" fill="#fff" fill-opacity="0.55"/>
  </g>
  <path d="M14 110 L14 62 Q14 12 120 12 Q226 12 226 62 L226 110 Z" fill="none" stroke="${INK}" stroke-width="6"/>
  <path d="M34 50 Q120 18 206 50" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="9" stroke-linecap="round"/>
  <rect x="98" y="84" width="44" height="32" rx="9" fill="url(#gold)" stroke="${INK}" stroke-width="5"/>
  <rect x="104" y="89" width="30" height="6" rx="3" fill="#fff" fill-opacity="0.6"/>`);

export const chestLidOpen = (tier: TierColors) =>
  svg(CHEST.width, CHEST.lidHeight, `
  <defs>
    <linearGradient id="inner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tier.rim}"/>
      <stop offset="1" stop-color="${tier.dark}"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${GOLD.light}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${GOLD.light}" stop-opacity="0"/>
    </linearGradient>
    ${goldGradient('gold')}
  </defs>
  <path d="M14 112 L22 30 Q26 8 120 8 Q214 8 218 30 L226 112 Z" fill="${INK}"/>
  <path d="M18 108 L26 32 Q30 14 120 14 Q210 14 214 32 L222 108 Z" fill="${tier.lidBase}" stroke="${INK}" stroke-width="6"/>
  <path d="M36 102 L42 40 Q46 28 120 28 Q194 28 198 40 L204 102 Z" fill="url(#inner)"/>
  <path d="M36 102 L42 40 Q46 28 120 28 Q194 28 198 40 L204 102 Z" fill="url(#glow)"/>
  <rect x="42" y="12" width="22" height="96" fill="url(#gold)" stroke="${INK}" stroke-width="4"/>
  <rect x="176" y="12" width="22" height="96" fill="url(#gold)" stroke="${INK}" stroke-width="4"/>
  <rect x="14" y="98" width="212" height="16" rx="8" fill="url(#gold)" stroke="${INK}" stroke-width="5"/>`);

/** Treasure spilling from an open chest; sits on the body rim. */
export const chestTreasure = () => {
  const coins = [
    [62, 70, 0], [88, 62, -10], [116, 56, 8], [146, 60, -6], [172, 68, 12], [100, 76, 4], [134, 74, -12], [78, 82, 6], [158, 82, -4],
  ]
    .map(
      ([x, y, r]) => `
    <g transform="rotate(${r} ${x} ${y})">
      <ellipse cx="${x}" cy="${y + 3}" rx="15" ry="8" fill="${GOLD.deep}"/>
      <ellipse cx="${x}" cy="${y}" rx="15" ry="8" fill="url(#coin)" stroke="${INK}" stroke-width="2.5"/>
      <ellipse cx="${x - 3}" cy="${y - 2}" rx="6" ry="2.5" fill="#fff" fill-opacity="0.7"/>
    </g>`,
    )
    .join('');
  return svg(240, 110, `
  <defs>
    <radialGradient id="light" cx="0.5" cy="0.75" r="0.6">
      <stop offset="0" stop-color="#fffbe0" stop-opacity="1"/>
      <stop offset="0.5" stop-color="${GOLD.base}" stop-opacity="0.65"/>
      <stop offset="1" stop-color="${GOLD.base}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="coin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD.light}"/>
      <stop offset="1" stop-color="${GOLD.dark}"/>
    </linearGradient>
    <linearGradient id="gem" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd1f0"/>
      <stop offset="1" stop-color="#e0339c"/>
    </linearGradient>
  </defs>
  <ellipse cx="120" cy="84" rx="118" ry="50" fill="url(#light)"/>
  ${coins}
  <path d="M120 40 L134 54 L120 76 L106 54 Z" fill="url(#gem)" stroke="${INK}" stroke-width="3"/>
  <path d="M120 40 L126 54 L120 76" fill="#fff" fill-opacity="0.35"/>`);
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
  const count = 20;
  const wedges = Array.from({ length: count }, (_, index) => {
    const a = (index / count) * Math.PI * 2;
    const spread = (Math.PI / count) * 0.55;
    const r = 512;
    const x1 = 512 + Math.cos(a - spread) * r;
    const y1 = 512 + Math.sin(a - spread) * r;
    const x2 = 512 + Math.cos(a + spread) * r;
    const y2 = 512 + Math.sin(a + spread) * r;
    return `<path d="M512 512 L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z"/>`;
  }).join('');
  return svg(1024, 1024, `
  <defs>
    <radialGradient id="fade" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#fff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g fill="url(#fade)">${wedges}</g>`);
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
  const dust = Array.from({ length: 70 }, (_, index) => {
    const x = (index * 173) % 1000;
    const y = (index * 311) % 1000;
    const r = 1 + (index % 3);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity="${0.08 + (index % 5) * 0.04}"/>`;
  }).join('');
  return svg(1000, 1000, `
  <defs><radialGradient id="g" cx="0.5" cy="0.42" r="0.75">
    <stop offset="0" stop-color="${inner}"/>
    <stop offset="1" stop-color="${outer}"/>
  </radialGradient></defs>
  <rect width="1000" height="1000" fill="url(#g)"/>
  ${dust}`);
};

// ---- UI chrome ----------------------------------------------------------------------

/** Chunky 3D pill. 240×96 with 40px corners; used as a nine-slice (slice 44). */
export const buttonSkin = (id: SkinId) => {
  const skin = SKINS[id];
  return svg(240, 96, `
  <defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${skin.top}"/><stop offset="1" stop-color="${skin.bottom}"/>
  </linearGradient></defs>
  <rect x="3" y="12" width="234" height="80" rx="38" fill="${INK}"/>
  <rect x="3" y="8" width="234" height="80" rx="38" fill="${skin.edge}" stroke="${INK}" stroke-width="5"/>
  <rect x="3" y="3" width="234" height="76" rx="37" fill="url(#t)" stroke="${INK}" stroke-width="5"/>
  <rect x="26" y="12" width="188" height="14" rx="7" fill="#fff" fill-opacity="0.45"/>`);
};

/** Round icon button face, 96×96. */
export const roundSkin = (id: SkinId) => {
  const skin = SKINS[id];
  return svg(96, 96, `
  <defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${skin.top}"/><stop offset="1" stop-color="${skin.bottom}"/>
  </linearGradient></defs>
  <circle cx="48" cy="52" r="42" fill="${INK}"/>
  <circle cx="48" cy="49" r="42" fill="${skin.edge}" stroke="${INK}" stroke-width="5"/>
  <circle cx="48" cy="45" r="40" fill="url(#t)" stroke="${INK}" stroke-width="5"/>
  <ellipse cx="48" cy="22" rx="24" ry="8" fill="#fff" fill-opacity="0.4"/>`);
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

/** Small dark pill for currency counters; nine-slice (slice 24). */
export const pill = () =>
  svg(96, 48, `
  <rect x="2" y="2" width="92" height="44" rx="22" fill="#12072a" fill-opacity="0.72" stroke="#fff" stroke-opacity="0.18" stroke-width="3"/>`);

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
  restart: () => icon('<path d="M48 22 A20 20 0 1 0 52 36"/><path d="M50 10 V24 H36"/>'),
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
