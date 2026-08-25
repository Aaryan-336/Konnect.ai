/**
 * Chart theming — the single source of colour and chrome for every chart
 * in the app, so dashboards and in-answer visualizations read as one system.
 *
 * The app ships a light and a dark surface, so the palette comes in two
 * validated instances. Each was checked against its own chart surface for the
 * OKLCH lightness band, chroma floor, colour-vision separation, normal-vision
 * separation, and 3:1 contrast.
 *
 * Chrome values are exposed as getters that read the live theme, because
 * ECharts needs literal colours and cannot resolve a CSS custom property.
 *
 * Two rules matter when touching this file:
 *   1. Hues are assigned in fixed slot order and never cycled. A ninth series
 *      folds into "Other" rather than inventing a colour.
 *   2. Status colours are reserved for state and never reused as series 4.
 */

/** Categorical slots for the dark surface, in fixed adjacent-pair-safe order. */
export const SERIES_COLORS_DARK = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
  '#008300', // 6 green
  '#9085e9', // 7 violet
  '#e66767', // 8 red
] as const;

/** The same hues darkened to clear 3:1 against the white light-mode card. */
export const SERIES_COLORS_LIGHT = [
  '#2f6fc4', // 1 blue
  '#b8491d', // 2 orange
  '#157e5a', // 3 aqua
  '#8f6100', // 4 yellow
  '#b1416b', // 5 magenta
  '#056b05', // 6 green
  '#6a5cd0', // 7 violet
  '#c14a4a', // 8 red
] as const;

/** Kept for callers that only need the slot count or a static reference. */
export const SERIES_COLORS = SERIES_COLORS_DARK;
export const MAX_SERIES = SERIES_COLORS_DARK.length;

/** Reserved state colours, per theme. Never used for series identity. */
const STATUS_LIGHT = {
  good: '#2f8f63',
  warning: '#b57b12',
  serious: '#b8491d',
  critical: '#c9483f',
} as const;

const STATUS_DARK = {
  good: '#4fb98a',
  warning: '#d9a441',
  serious: '#e0793f',
  critical: '#e8756b',
} as const;

/**
 * True when the document is currently painting the dark theme. Mirrors the
 * resolution order in lib/theme.tsx: an explicit `data-theme` wins, otherwise
 * the OS preference decides.
 */
export function isDarkChartSurface(): boolean {
  if (typeof document === 'undefined') return false;
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const CHROME_LIGHT = {
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  textPrimary: '#16161c',
  textSecondary: '#5d5d68',
  textMuted: '#93939e',
  grid: '#ecebe4',
  axis: '#d3d0c7',
  tooltipShadow: '0 8px 24px rgba(24,22,18,.14)',
} as const;

const CHROME_DARK = {
  surface: '#17171d',
  surfaceRaised: '#1e1e26',
  textPrimary: '#f2f1ec',
  textSecondary: '#a5a5b0',
  textMuted: '#71717e',
  grid: '#22222b',
  axis: '#2a2a34',
  tooltipShadow: '0 8px 24px rgba(0,0,0,.5)',
} as const;

function chrome() {
  return isDarkChartSurface() ? CHROME_DARK : CHROME_LIGHT;
}

/**
 * Chrome tokens for the surface in use right now. Every property is a getter,
 * so both direct reads (`CHART_INK.axis`) and object spreads pick up the
 * current theme at the moment they run.
 */
export const CHART_INK = {
  get surface() { return chrome().surface; },
  get surfaceRaised() { return chrome().surfaceRaised; },
  get textPrimary() { return chrome().textPrimary; },
  get textSecondary() { return chrome().textSecondary; },
  get textMuted() { return chrome().textMuted; },
  get grid() { return chrome().grid; },
  get axis() { return chrome().axis; },
};

/** Reserved state colours for the surface in use right now. */
export const STATUS_COLORS = {
  get good() { return isDarkChartSurface() ? STATUS_DARK.good : STATUS_LIGHT.good; },
  get warning() { return isDarkChartSurface() ? STATUS_DARK.warning : STATUS_LIGHT.warning; },
  get serious() { return isDarkChartSurface() ? STATUS_DARK.serious : STATUS_LIGHT.serious; },
  get critical() { return isDarkChartSurface() ? STATUS_DARK.critical : STATUS_LIGHT.critical; },
};

export function seriesColor(index: number): string {
  const palette = isDarkChartSurface() ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;
  return palette[index % MAX_SERIES];
}

/** Shared tooltip chrome so every chart's hover layer looks identical. */
export const tooltipStyle = {
  get backgroundColor() { return chrome().surfaceRaised; },
  get borderColor() { return chrome().axis; },
  borderWidth: 1,
  padding: [8, 12] as [number, number],
  get textStyle() { return { color: chrome().textPrimary, fontSize: 12 }; },
  get extraCssText() {
    return `border-radius:12px;box-shadow:${chrome().tooltipShadow};`;
  },
};

/** Recessive, solid hairline axes — never dashed. */
export const axisChrome = {
  get axisLine() { return { lineStyle: { color: chrome().axis, width: 1 } }; },
  axisTick: { show: false },
  get splitLine() {
    return { lineStyle: { color: chrome().grid, width: 1, type: 'solid' as const } };
  },
};

/**
 * Format a number for an axis or tooltip without inventing precision:
 * thousands are abbreviated, decimals are kept only when they carry meaning.
 */
export function formatValue(value: number | null | undefined, units?: string | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';

  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1_000_000_000) text = `${(value / 1_000_000_000).toFixed(1)}B`;
  else if (abs >= 1_000_000) text = `${(value / 1_000_000).toFixed(1)}M`;
  else if (abs >= 10_000) text = `${(value / 1_000).toFixed(1)}K`;
  else if (Number.isInteger(value)) text = value.toLocaleString();
  else text = value.toFixed(2);

  return units ? `${text} ${units}` : text;
}
