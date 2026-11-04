import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'tax-wrappers',
  title: 'Tax Wrappers (IKE / IKZE)',
  kind: 'batch',
  category: 'finance',
  description:
    'Poland’s IKE and IKZE retirement wrappers vs a taxable account, projected year by year. Every legal value lives in a rules data file with a source and “as of” date — the model contains no hard-coded tax numbers. Educational, not tax advice.',
  tags: ['tax', 'ike', 'ikze', 'poland', 'retirement', 'rules-as-data'],
  difficulty: 'medium',
  thumbnail: 'bars',
  accent: '#a78bfa',
};
