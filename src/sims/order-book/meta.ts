import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'order-book',
  title: 'Order Book & Market Microstructure',
  kind: 'event',
  category: 'finance',
  description:
    'A price-time-priority matching engine driven by noise traders, market makers, trend followers and stop-losses. Withdraw liquidity and watch a flash-crash cascade; the batch runner reports crash probability with Wilson intervals as the market-maker count changes.',
  tags: ['order-book', 'market-microstructure', 'flash-crash', 'liquidity', 'batch'],
  difficulty: 'hard',
  thumbnail: 'market',
  accent: '#f43f5e',
};
