// ─── ui/chart-theme.ts — chart colours from CSS variables ───────────────────
// Variables live in index.css under :root (light) and [data-theme="dark"].
// Re-read on theme change; falls back to built-in palettes when CSS vars are
// unavailable (tests, SSR-less contexts).

import type { ThemeName } from '../core/types';

export interface ChartPalette {
  axis: string;
  grid: string;
  text: string;
  bg: string;
  border: string;
}

const FALLBACK: Record<ThemeName, ChartPalette> = {
  dark: { axis: '#94a3b8', grid: 'rgba(148,163,184,0.14)', text: '#cbd5e1', bg: 'rgba(2,6,23,0.82)', border: 'rgba(148,163,184,0.3)' },
  light: { axis: '#64748b', grid: 'rgba(15,23,42,0.09)', text: '#334155', bg: 'rgba(255,255,255,0.92)', border: 'rgba(15,23,42,0.14)' },
};

export function readChartPalette(theme: ThemeName): ChartPalette {
  const fb = FALLBACK[theme];
  try {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
      axis: get('--chart-axis', fb.axis),
      grid: get('--chart-grid', fb.grid),
      text: get('--chart-text', fb.text),
      bg: get('--chart-bg', fb.bg),
      border: get('--chart-border', fb.border),
    };
  } catch {
    return fb;
  }
}

/** Series colours per theme (fan bands, lines, histogram). */
export function chartColors(theme: ThemeName) {
  return theme === 'dark'
    ? { p50: '#f59e0b', bandOuter: 'rgba(56,189,248,0.18)', bandInner: 'rgba(56,189,248,0.32)', hist: 'rgba(56,189,248,0.75)', line1: '#38bdf8', line2: '#a78bfa', line3: '#34d399' }
    : { p50: '#d97706', bandOuter: 'rgba(2,132,199,0.14)', bandInner: 'rgba(2,132,199,0.26)', hist: 'rgba(2,132,199,0.65)', line1: '#0284c7', line2: '#7c3aed', line3: '#059669' };
}
