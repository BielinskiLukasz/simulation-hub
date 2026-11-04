import { describe, expect, it } from 'vitest';
import { filterEntries, findEntry } from './registry';
import type { SimEntry } from './types';

const mk = (id: string, tags: string[]): SimEntry => ({
  meta: { id, title: id, kind: 'realtime', category: 'physics', description: `about ${id}`, tags, difficulty: 'easy', thumbnail: '', accent: '#000' },
  load: async () => { throw new Error('not loaded in registry tests'); },
});
const list = [mk('bouncing-balls', ['gravity']), mk('boids', ['flocking'])];

describe('registry', () => {
  it('lookup by id; unknown id → undefined', () => {
    expect(findEntry(list, 'boids')?.meta.id).toBe('boids');
    expect(findEntry(list, 'nope')).toBeUndefined();
  });
  it('filters by category and searches tags case-insensitively', () => {
    expect(filterEntries(list, { category: 'physics' })).toHaveLength(2);
    expect(filterEntries(list, { category: 'finance' })).toHaveLength(0);
    expect(filterEntries(list, { query: 'FLOCK' })).toHaveLength(1);
    expect(filterEntries(list, { query: '' })).toHaveLength(2);
  });
});
