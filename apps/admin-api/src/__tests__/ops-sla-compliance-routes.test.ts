import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for ops-sla-compliance.routes.ts
// Tests: GET /ops/sla-summary, GET /ops/compliance-summary
// Uses Fastify inject + mocked DB (select chains with .then())
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';

async function buildApp(
  opts: {
    // Values for sla-summary (8 parallel queries, all ending with .then(cb))
    depositMedian?: number | null;
    sweepMedian?: number | null;
    depositsCount?: number;
    sweepsCount?: number;
    withdrawalsCount?: number;
    pendingDeposits?: number;
    pendingSweeps?: number;
    pendingWithdrawals?: number;
    // Values for compliance-summary (3 parallel queries returning arrays)
    kycRows?: Array<{ tier: string; cnt: number }>;
    riskRows?: Array<{ tier: string; cnt: number }>;
    statusRows?: Array<{ status: string; cnt: number }>;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // sla-summary defaults
  const depositMedian = opts.depositMedian !== undefined ? opts.depositMedian : 45;
  const sweepMedian = opts.sweepMedian !== undefined ? opts.sweepMedian : 120;
  const depositsCount = opts.depositsCount ?? 10;
  const sweepsCount = opts.sweepsCount ?? 5;
  const withdrawalsCount = opts.withdrawalsCount ?? 3;
  const pendingDeposits = opts.pendingDeposits ?? 2;
  const pendingSweeps = opts.pendingSweeps ?? 1;
  const pendingWithdrawals = opts.pendingWithdrawals ?? 0;

  // compliance-summary defaults
  const kycRows = opts.kycRows ?? [
    { tier: 'none', cnt: 5 },
    { tier: 'basic', cnt: 10 },
    { tier: 'enhanced', cnt: 3 },
  ];
  const riskRows = opts.riskRows ?? [
    { tier: 'low', cnt: 12 },
    { tier: 'medium', cnt: 4 },
    { tier: 'high', cnt: 2 },
  ];
  const statusRows = opts.statusRows ?? [
    { status: 'active', cnt: 15 },
    { status: 'suspended', cnt: 3 },
  ];

  // Dispatch by field shape:
  //   { median }          → sla median queries  (where → resolved)
  //   { cnt }             → sla count queries   (where → resolved)
  //   { tier, cnt }       → compliance kyc/risk (groupBy → resolved) — alternating
  //   { status, cnt }     → compliance status   (groupBy → resolved)
  // sla-summary makes 8 calls all ending with .where(); compliance makes 3 groupBy calls.
  // Within the tier queries we alternate kyc then risk.
  let tierCallN = 0;

  // Counts for sla calls alternate across 8 values via a queue
  const slaCountValues = [
    depositsCount,
    sweepsCount,
    withdrawalsCount,
    pendingDeposits,
    pendingSweeps,
    pendingWithdrawals,
  ];
  let slaCountIdx = 0;

  const mockSelect = vi.fn((fields?: Record<string, unknown>) => {
    const f = fields as Record<string, unknown> | undefined;

    if (f && 'median' in f) {
      // sla median query (depositCredit or sweepConfirm)
      const val = tierCallN === 0 ? depositMedian : sweepMedian;
      tierCallN++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ median: val }]),
        }),
      };
    }

    if (f && 'status' in f && 'cnt' in f) {
      // compliance status query
      return {
        from: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue(statusRows),
        }),
      };
    }

    if (f && 'tier' in f && 'cnt' in f) {
      // compliance kyc (first call) or risk (second call) — alternate
      const isKyc = tierCallN % 2 === 0;
      tierCallN++;
      return {
        from: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue(isKyc ? kycRows : riskRows),
        }),
      };
    }

    if (f && 'cnt' in f) {
      // sla count query — consume from queue
      const val = slaCountValues[slaCountIdx++] ?? 0;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ cnt: val }]),
        }),
      };
    }

    // fallback (should not be reached)
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
      }),
    };
  });

  app.decorate('db', { select: mockSelect } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: opsSlaComplianceRoutes } = await import(
    '../routes/ops-sla-compliance.routes.js'
  );
  await app.register(opsSlaComplianceRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /ops/sla-summary ───────────────────────────────────────────────

describe('GET /ops/sla-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SLA metrics with median latencies', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/sla-summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.depositCreditP50Sec).toBe(45);
    expect(body.sweepConfirmP50Sec).toBe(120);
    expect(body.depositsLast24h).toBe(10);
    expect(body.sweepsLast24h).toBe(5);
    expect(body.withdrawalsLast24h).toBe(3);
    expect(body.pendingDeposits).toBe(2);
    expect(body.pendingSweeps).toBe(1);
    expect(body.pendingWithdrawals).toBe(0);
    await app.close();
  });

  it('returns null for latencies when no data', async () => {
    const app = await buildApp({ depositMedian: null, sweepMedian: null });
    const res = await app.inject({ method: 'GET', url: '/ops/sla-summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.depositCreditP50Sec).toBeNull();
    expect(body.sweepConfirmP50Sec).toBeNull();
    await app.close();
  });

  it('rounds latencies to integer seconds', async () => {
    const app = await buildApp({ depositMedian: 45.7, sweepMedian: 120.3 });
    const res = await app.inject({ method: 'GET', url: '/ops/sla-summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Number.isInteger(body.depositCreditP50Sec)).toBe(true);
    expect(Number.isInteger(body.sweepConfirmP50Sec)).toBe(true);
    await app.close();
  });
});

// ── Tests: GET /ops/compliance-summary ───────────────────────────────────────

describe('GET /ops/compliance-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns KYC and risk tier distributions', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/compliance-summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.kycNone).toBe(5);
    expect(body.kycBasic).toBe(10);
    expect(body.kycEnhanced).toBe(3);
    expect(body.riskLow).toBe(12);
    expect(body.riskMedium).toBe(4);
    expect(body.riskHigh).toBe(2);
    await app.close();
  });

  it('returns user status counts and total', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/compliance-summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.activeUsers).toBe(15);
    expect(body.suspendedUsers).toBe(3);
    expect(body.totalUsers).toBe(18);
    await app.close();
  });

  it('defaults missing tiers to 0', async () => {
    const app = await buildApp({
      kycRows: [],
      riskRows: [],
      statusRows: [],
    });
    const res = await app.inject({ method: 'GET', url: '/ops/compliance-summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.kycNone).toBe(0);
    expect(body.riskFrozen).toBe(0);
    expect(body.totalUsers).toBe(0);
    await app.close();
  });
});
