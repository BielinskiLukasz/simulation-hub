import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Category } from '../core/types';

/* ------------------------------------------------------------------ *
 * Theme — respects prefers-color-scheme, allows override, persists.
 * ------------------------------------------------------------------ */
export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'simhub:theme';

export function readInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* private browsing / blocked storage — fall through */
  }
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch {
    /* no matchMedia */
  }
  return 'dark';
}

interface ThemeCtxValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({ theme: 'dark', toggle: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeCtxValue {
  return useContext(ThemeCtx);
}

/* ------------------------------------------------------------------ *
 * Scroll reveal
 * ------------------------------------------------------------------ */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      el?.classList.add('is-visible');
      return;
    }
    const io = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          if (r.isIntersecting) {
            r.target.classList.add('is-visible');
            io.unobserve(r.target);
          }
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Component = Tag as 'div';
  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      className={`reveal ${className}`}
      style={{ ['--reveal-delay' as string]: `${delay}ms` }}
    >
      {children}
    </Component>
  );
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */
export const CATEGORY: Record<Category, { label: string; color: string; glyph: string }> = {
  physics: { label: 'Physics', color: 'var(--blue)', glyph: '◍' },
  emergent: { label: 'Emergent', color: 'var(--mint)', glyph: '⁙' },
  algorithms: { label: 'Algorithms', color: 'var(--amber)', glyph: '⌗' },
  systems: { label: 'Systems', color: 'var(--rose)', glyph: '∞' },
  finance: { label: 'Finance', color: 'var(--accent)', glyph: '¤' },
};

export const DIFFICULTY: Record<string, string> = {
  easy: '◇ easy',
  medium: '◆ medium',
  hard: '◈ hard',
};

/* ------------------------------------------------------------------ *
 * Icons — inline, currentColor, no icon dependency
 * ------------------------------------------------------------------ */
type IconProps = { className?: string };
const svg = (path: ReactNode, viewBox = '0 0 24 24') =>
  function Icon({ className = 'h-4 w-4' }: IconProps) {
    return (
      <svg
        viewBox={viewBox}
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

export const IconPlay = svg(
  <path d="M7 4.5v15l13-7.5-13-7.5z" fill="currentColor" stroke="none" />,
);
export const IconPause = svg(
  <>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
  </>,
);
export const IconStep = svg(
  <>
    <path d="M6 4.5v15l11-7.5-11-7.5z" fill="currentColor" stroke="none" />
    <path d="M19 4.5v15" />
  </>,
);
export const IconReset = svg(
  <>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5V10H9" />
  </>,
);
export const IconDice = svg(
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.6" cy="8.6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="15.4" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </>,
);
export const IconLink = svg(
  <>
    <path d="M10 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.3 1.3" />
    <path d="M14 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.3-1.3" />
  </>,
);
export const IconCheck = svg(<path d="M4.5 12.5 9.5 17.5 19.5 6.5" />);
export const IconSearch = svg(
  <>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.6 15.6 4 4" />
  </>,
);
export const IconSun = svg(
  <>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
  </>,
);
export const IconMoon = svg(<path d="M20 14.4A8.6 8.6 0 0 1 9.6 4a8.6 8.6 0 1 0 10.4 10.4z" />);
export const IconArrow = svg(
  <>
    <path d="M4.5 12h15" />
    <path d="m13.5 6 6 6-6 6" />
  </>,
);
export const IconBack = svg(
  <>
    <path d="M19.5 12h-15" />
    <path d="m10.5 6-6 6 6 6" />
  </>,
);
export const IconSliders = svg(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2.1" />
    <circle cx="10" cy="17" r="2.1" />
  </>,
);
export const IconBook = svg(
  <>
    <path d="M4 5.2A2 2 0 0 1 6 3.2h13v14.4H6a2 2 0 0 0-2 2z" />
    <path d="M4 17.6a2 2 0 0 0 2 2h13" />
  </>,
);

/* ------------------------------------------------------------------ *
 * Tiny atoms
 * ------------------------------------------------------------------ */
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3 ${className}`}>{children}</p>
  );
}

export function Chip({
  active,
  onClick,
  children,
  color,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.12em] transition-all duration-200"
      style={{
        borderColor: active ? (color ?? 'var(--accent)') : 'var(--line)',
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
        color: active ? (color ?? 'var(--accent)') : 'var(--ink-2)',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full transition-transform duration-200 group-hover:scale-125"
        style={{ background: active ? (color ?? 'var(--accent)') : 'var(--ink-3)' }}
      />
      {children}
      {count !== undefined && <span className="text-ink-3 tnum">{count}</span>}
    </button>
  );
}

/** Renders the small subset of markdown used in `meta.howItWorks`. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className="rounded border border-line bg-surface-2 px-1 py-0.5 font-mono text-[0.84em] text-accent"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
