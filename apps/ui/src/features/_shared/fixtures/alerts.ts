// Dashboard alerts strip fixtures.
import { minutesAgo } from '../helpers';

export const ALERTS = [
  {
    id: 'al1',
    severity: 'warn' as const,
    title: 'BNB sweep threshold reached',
    text: '12 deposit addresses now exceed the 500 USDT sweep threshold.',
    when: minutesAgo(8),
  },
  {
    id: 'al2',
    severity: 'info' as const,
    title: 'Multisig op_40003 awaiting 2 signatures',
    text: 'Withdrawal of 12,400 USDT to 0x71C2…fA09 expires in 5h 42m.',
    when: minutesAgo(22),
  },
  {
    id: 'al3',
    severity: 'err' as const,
    title: 'Sweep batch b_8104 partially failed',
    text: '1 of 6 transactions reverted (insufficient gas). Retry available.',
    when: minutesAgo(96),
  },
];
