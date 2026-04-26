import { beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for withdrawal-csv.service.ts and deposit-csv.service.ts
// Covers: escapeCsvField, formatCsvRow, header generators,
//         countXForExport, queryXForExport, streamXCsv

// ── Withdrawal CSV ────────────────────────────────────────────────────────────

describe('withdrawalCsvHeader', () => {
  it('returns comma-separated header row', async () => {
    const { withdrawalCsvHeader } = await import('../services/withdrawal-csv.service.js');
    const header = withdrawalCsvHeader();
    expect(header).toContain('id');
    expect(header).toContain('created_at');
    expect(header).toContain('chain');
    expect(header).toContain('amount_minor');
    expect(header).toContain('initiated_by_email');
    expect(header.split(',').length).toBe(13);
  });
});

describe('countWithdrawalsForExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns count from db query (no filters)', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 42 }]),
        }),
      }),
    } as never;
    const { countWithdrawalsForExport } = await import('../services/withdrawal-csv.service.js');
    const result = await countWithdrawalsForExport(db, {});
    expect(result).toBe(42);
  });

  it('returns 0 when no rows returned', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never;
    const { countWithdrawalsForExport } = await import('../services/withdrawal-csv.service.js');
    const result = await countWithdrawalsForExport(db, {});
    expect(result).toBe(0);
  });

  it('applies chain/tier/status/from/to filters', async () => {
    const whereSpy = vi.fn().mockResolvedValue([{ value: 5 }]);
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: whereSpy }),
      }),
    } as never;
    const { countWithdrawalsForExport } = await import('../services/withdrawal-csv.service.js');
    const result = await countWithdrawalsForExport(db, {
      chain: 'bnb',
      tier: 'hot',
      status: 'completed',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });
    expect(result).toBe(5);
    expect(whereSpy).toHaveBeenCalledWith(expect.anything());
  });
});

describe('queryWithdrawalsForExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped rows with approvedCount from multisig ops', async () => {
    const withdrawalRows = [
      {
        id: 'wd-001',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        chain: 'bnb',
        sourceTier: 'hot',
        destinationAddr: '0xDest',
        token: 'USDT',
        amount: '1000000000000000000',
        status: 'completed',
        txHash: '0xabc',
        initiatedByEmail: 'staff@example.com',
        broadcastAt: new Date('2026-01-15T10:05:00Z'),
        multisigOpId: 'op-001',
      },
    ];
    const opRows = [{ id: 'op-001', collectedSigs: 2 }];

    let selectCallN = 0;
    const db = {
      select: vi.fn(() => {
        selectCallN++;
        if (selectCallN === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(withdrawalRows),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(opRows),
          }),
        };
      }),
    } as never;

    const { queryWithdrawalsForExport } = await import('../services/withdrawal-csv.service.js');
    const rows = await queryWithdrawalsForExport(db, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('wd-001');
    expect(rows[0]!.approvedCount).toBe(2);
    expect(rows[0]!.broadcastAt).toBe('2026-01-15T10:05:00.000Z');
    expect(rows[0]!.confirmedAt).toBeNull();
  });

  it('returns 0 approvedCount when no multisigOpId', async () => {
    const withdrawalRows = [
      {
        id: 'wd-002',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        chain: 'sol',
        sourceTier: 'cold',
        destinationAddr: 'SolAddr',
        token: 'USDC',
        amount: '1000000',
        status: 'pending',
        txHash: null,
        initiatedByEmail: null,
        broadcastAt: null,
        multisigOpId: null,
      },
    ];

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(withdrawalRows),
            }),
          }),
        }),
      }),
    } as never;

    const { queryWithdrawalsForExport } = await import('../services/withdrawal-csv.service.js');
    const rows = await queryWithdrawalsForExport(db, {});
    expect(rows[0]!.approvedCount).toBe(0);
    expect(rows[0]!.txHash).toBeNull();
    expect(rows[0]!.initiatedByEmail).toBeNull();
  });

  it('returns empty array when no withdrawals match', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    } as never;

    const { queryWithdrawalsForExport } = await import('../services/withdrawal-csv.service.js');
    const rows = await queryWithdrawalsForExport(db, {});
    expect(rows).toHaveLength(0);
  });
});

describe('streamWithdrawalCsv', () => {
  it('writes header then data rows', async () => {
    const { streamWithdrawalCsv } = await import('../services/withdrawal-csv.service.js');
    const chunks: string[] = [];
    const rows = [
      {
        id: 'wd-001',
        createdAt: '2026-01-15T10:00:00.000Z',
        chain: 'bnb',
        tier: 'hot',
        destination: '0xDest',
        token: 'USDT',
        amountMinor: '1000000000000000000',
        status: 'completed',
        txHash: '0xabc',
        initiatedByEmail: 'staff@example.com',
        approvedCount: 2,
        broadcastAt: '2026-01-15T10:05:00.000Z',
        confirmedAt: null,
      },
    ];
    streamWithdrawalCsv(rows, (chunk) => chunks.push(chunk));
    const output = chunks.join('');
    expect(output).toContain('id,created_at,chain');
    expect(output).toContain('wd-001');
    expect(output).toContain('staff@example.com');
  });

  it('escapes CSV fields containing commas', async () => {
    const { streamWithdrawalCsv } = await import('../services/withdrawal-csv.service.js');
    const chunks: string[] = [];
    const rows = [
      {
        id: 'wd-002',
        createdAt: '2026-01-15T10:00:00.000Z',
        chain: 'bnb',
        tier: 'hot',
        destination: 'addr,with,commas',
        token: 'USDT',
        amountMinor: '100',
        status: 'pending',
        txHash: null,
        initiatedByEmail: null,
        approvedCount: 0,
        broadcastAt: null,
        confirmedAt: null,
      },
    ];
    streamWithdrawalCsv(rows, (chunk) => chunks.push(chunk));
    expect(chunks.join('')).toContain('"addr,with,commas"');
  });

  it('handles empty rows array — only header written', async () => {
    const { streamWithdrawalCsv } = await import('../services/withdrawal-csv.service.js');
    const chunks: string[] = [];
    streamWithdrawalCsv([], (chunk) => chunks.push(chunk));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('id,');
  });
});

// ── Deposit CSV ───────────────────────────────────────────────────────────────

describe('depositCsvHeader', () => {
  it('returns comma-separated deposit header row', async () => {
    const { depositCsvHeader } = await import('../services/deposit-csv.service.js');
    const header = depositCsvHeader();
    expect(header).toContain('id');
    expect(header).toContain('user_email');
    expect(header).toContain('amount_minor');
    expect(header).toContain('confirmations');
    expect(header.split(',').length).toBe(10);
  });
});

describe('countDepositsForExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns count with no filters', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 100 }]),
        }),
      }),
    } as never;
    const { countDepositsForExport } = await import('../services/deposit-csv.service.js');
    const result = await countDepositsForExport(db, {});
    expect(result).toBe(100);
  });

  it('applies chain/userId/status/from/to filters', async () => {
    const whereSpy = vi.fn().mockResolvedValue([{ value: 7 }]);
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: whereSpy }),
      }),
    } as never;
    const { countDepositsForExport } = await import('../services/deposit-csv.service.js');
    const result = await countDepositsForExport(db, {
      chain: 'sol',
      userId: 'user-001',
      status: 'credited',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });
    expect(result).toBe(7);
  });
});

describe('queryDepositsForExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped deposit rows with user email', async () => {
    const depositRows = [
      {
        id: 'dep-001',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        chain: 'bnb',
        userEmail: 'user@example.com',
        token: 'USDT',
        amount: '1000000000000000000',
        txHash: '0xdef',
        status: 'credited',
        confirmedBlocks: 12,
      },
    ];

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(depositRows),
            }),
          }),
        }),
      }),
    } as never;

    const { queryDepositsForExport } = await import('../services/deposit-csv.service.js');
    const rows = await queryDepositsForExport(db, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('dep-001');
    expect(rows[0]!.userEmail).toBe('user@example.com');
    expect(rows[0]!.confirmations).toBe(12);
    expect(rows[0]!.blockNumber).toBe(0); // not stored in table
    expect(rows[0]!.createdAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('returns null userEmail when no join match', async () => {
    const depositRows = [
      {
        id: 'dep-002',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        chain: 'sol',
        userEmail: null,
        token: 'USDC',
        amount: '1000000',
        txHash: null,
        status: 'pending',
        confirmedBlocks: 0,
      },
    ];

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(depositRows),
            }),
          }),
        }),
      }),
    } as never;

    const { queryDepositsForExport } = await import('../services/deposit-csv.service.js');
    const rows = await queryDepositsForExport(db, {});
    expect(rows[0]!.userEmail).toBeNull();
    expect(rows[0]!.txHash).toBeNull();
  });

  it('returns empty array when no deposits match', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    } as never;

    const { queryDepositsForExport } = await import('../services/deposit-csv.service.js');
    const rows = await queryDepositsForExport(db, {});
    expect(rows).toHaveLength(0);
  });
});

describe('streamDepositCsv', () => {
  it('writes header then deposit rows', async () => {
    const { streamDepositCsv } = await import('../services/deposit-csv.service.js');
    const chunks: string[] = [];
    const rows = [
      {
        id: 'dep-001',
        createdAt: '2026-01-15T10:00:00.000Z',
        chain: 'bnb',
        userEmail: 'user@example.com',
        token: 'USDT',
        amountMinor: '1000000000000000000',
        txHash: '0xdef',
        status: 'credited',
        blockNumber: 0,
        confirmations: 12,
      },
    ];
    streamDepositCsv(rows, (chunk) => chunks.push(chunk));
    const output = chunks.join('');
    expect(output).toContain('id,created_at,chain');
    expect(output).toContain('dep-001');
    expect(output).toContain('user@example.com');
  });

  it('escapes fields with double-quotes', async () => {
    const { streamDepositCsv } = await import('../services/deposit-csv.service.js');
    const chunks: string[] = [];
    const rows = [
      {
        id: 'dep-003',
        createdAt: '2026-01-15T10:00:00.000Z',
        chain: 'bnb',
        userEmail: 'user "quoted"@example.com',
        token: 'USDT',
        amountMinor: '100',
        txHash: null,
        status: 'pending',
        blockNumber: 0,
        confirmations: 0,
      },
    ];
    streamDepositCsv(rows, (chunk) => chunks.push(chunk));
    expect(chunks.join('')).toContain('"user ""quoted""@example.com"');
  });

  it('handles empty rows — only header written', async () => {
    const { streamDepositCsv } = await import('../services/deposit-csv.service.js');
    const chunks: string[] = [];
    streamDepositCsv([], (chunk) => chunks.push(chunk));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('id,');
  });
});
