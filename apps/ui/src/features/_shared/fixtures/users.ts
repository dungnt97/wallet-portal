// End-user fixtures. `FIX_USERS` is the raw directory; `ENRICHED_USERS` adds
// createdAt + normalised KYC tier and is used by the Users page.
import { minutesAgo } from '../helpers';
import { evmAddr, mul32, pickWith, solAddr } from './random';

const rand = mul32(424242);

const NAMES = [
  'Aiko Tanaka',
  'Marcus Chen',
  'Priya Iyer',
  'Lena Vogel',
  'Ravi Krishnan',
  'Mei Wong',
  'David Park',
  'Sara Kowalski',
  'Hugo Muller',
  'Elif Demir',
  'Jakub Novak',
  'Yumi Sato',
  'Omar Haddad',
  'Nora Lindqvist',
  'Arman Ali',
  'Tessa Bakker',
  'Simo Heikkinen',
  'Iris Berg',
  'Kenji Mori',
  'Carla Ferreira',
  'Pavel Sidorov',
  'Lina Park',
  'Felipe Costa',
  'Aoife Byrne',
  'Zara Khan',
  'Diego Romero',
  'Ana Petrovic',
  'Yusuf Yilmaz',
];

export interface FixUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  kycTier: string;
  addresses: { bnb: string; sol: string };
  balances: { USDT: number; USDC: number };
  risk: 'low' | 'med' | 'high';
}

export const FIX_USERS: FixUser[] = Array.from({ length: 28 }, (_, i) => {
  const name = NAMES[i % NAMES.length] as string;
  return {
    id: `usr_${(1000 + i).toString(36)}`,
    name,
    email: `${name.toLowerCase().replace(/\s/g, '.')}@example.io`,
    initials: name
      .split(' ')
      .map((s) => s[0])
      .join(''),
    kycTier: pickWith(rand, ['Tier 1', 'Tier 2', 'Tier 2', 'Tier 3']),
    addresses: { bnb: evmAddr(rand), sol: solAddr(rand) },
    balances: {
      USDT: Math.round(rand() * 50000 * 100) / 100,
      USDC: Math.round(rand() * 30000 * 100) / 100,
    },
    risk: pickWith(rand, ['low', 'low', 'low', 'med', 'low', 'high'] as const),
  };
});

export interface EnrichedUser extends FixUser {
  createdAt: string;
  kycTierShort: 'T1' | 'T2' | 'T3';
}

function normaliseKyc(t: string): 'T1' | 'T2' | 'T3' {
  if (t.includes('1')) return 'T1';
  if (t.includes('3')) return 'T3';
  return 'T2';
}

export const ENRICHED_USERS: EnrichedUser[] = FIX_USERS.map((u, i) => ({
  ...u,
  createdAt: minutesAgo(60 * 24 * (200 - i * 3)),
  kycTierShort: normaliseKyc(u.kycTier),
}));
