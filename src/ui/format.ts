export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export const units = (n: number) => n.toFixed(2);

export function clock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const pct = (mult: number) => `${mult >= 1 ? '+' : ''}${Math.round((mult - 1) * 100)}%`;

/** Convert a 0xRRGGBB content colour into a CSS colour string. */
export const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
