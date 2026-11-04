import { describe, expect, it } from 'vitest';
import { filterLog } from './log-filter';
import type { LogEntry } from '../types';

const log: LogEntry[] = [
  { i: 1, t: 10, cat: 'election', actor: 1, text: 'N1 starts election' },
  { i: 2, t: 20, cat: 'network', actor: 2, text: 'vote granted' },
  { i: 3, t: 30, cat: 'election', actor: 2, text: 'N2 becomes leader' },
  { i: 4, t: 40, cat: 'fault', actor: null, text: 'Node 1 crashed' },
];

describe('filterLog', () => {
  it('filters by category, actor, and case-insensitive text', () => {
    expect(filterLog(log, { cats: new Set(['election']) })).toEqual([0, 2]);
    expect(filterLog(log, { actors: new Set([2]) })).toEqual([1, 2]);
    expect(filterLog(log, { text: 'LEADER' })).toEqual([2]);
    expect(filterLog(log, { cats: new Set(['election']), text: 'n1' })).toEqual([0]);
  });
  it('upTo limits to a position; empty filter returns everything; no-match returns []', () => {
    expect(filterLog(log, { upTo: 2 })).toEqual([0, 1]);
    expect(filterLog(log, {})).toEqual([0, 1, 2, 3]);
    expect(filterLog(log, { text: 'zzz' })).toEqual([]);
  });
});
