// Shared number formatting for axes, KPI cards and tables.
export function formatCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${trim(v / 1e9)}B`;
  if (abs >= 1e6) return `${trim(v / 1e6)}M`;
  if (abs >= 1e3) return `${trim(v / 1e3)}k`;
  if (abs >= 100) return String(Math.round(v));
  if (abs >= 1) return trim(v);
  return v.toFixed(2);
}

export function formatMoney(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

export function formatPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

function trim(v: number): string {
  return String(Math.round(v * 10) / 10);
}
