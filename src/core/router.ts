// ─── Simulation Hub · core/router.ts ────────────────────────────────────────
// Hash routing: GitHub Pages has no server rewrites, so #/sim/:id?... it is.

export type Route =
  | { name: 'home' }
  | { name: 'sim'; id: string; query: URLSearchParams };

export function parseHash(hash: string): Route {
  const raw = (hash ?? '').replace(/^#/, '') || '/';
  const [path = '/', qs = ''] = raw.split('?');
  const m = path.match(/^\/sim\/([\w-]+)$/);
  if (m && m[1]) return { name: 'sim', id: m[1], query: new URLSearchParams(qs) };
  return { name: 'home' };
}

export function buildHash(id: string, query: URLSearchParams): string {
  const qs = query.toString();
  return `#/sim/${id}${qs ? `?${qs}` : ''}`;
}

export function homeHash(): string {
  return '#/';
}
