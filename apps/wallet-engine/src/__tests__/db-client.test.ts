// Tests for db/client.ts — 0% coverage. Trivial drizzle wrapper.
// Mocks postgres + drizzle-orm to avoid real DB connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDrizzleInstance = { query: {}, execute: vi.fn() };
const mockDrizzle = vi.fn().mockReturnValue(mockDrizzleInstance);
const mockPostgres = vi.fn().mockReturnValue({ end: vi.fn() });

vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: mockDrizzle }));
vi.mock('postgres', () => ({ default: mockPostgres }));
vi.mock('@wp/admin-api/db-schema', () => ({ users: {}, deposits: {} }));

describe('db-client — makeDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('creates a postgres client with the given URL', async () => {
    const { makeDb } = await import('../db/client.js');
    makeDb('postgres://user:pass@localhost:5432/mydb');
    expect(mockPostgres).toHaveBeenCalledWith('postgres://user:pass@localhost:5432/mydb');
  });

  it('passes the postgres client to drizzle with schema', async () => {
    const { makeDb } = await import('../db/client.js');
    makeDb('postgres://localhost/test');
    expect(mockDrizzle).toHaveBeenCalledWith(
      expect.anything(), // postgres client
      expect.objectContaining({ schema: expect.anything() })
    );
  });

  it('returns the drizzle instance', async () => {
    const { makeDb } = await import('../db/client.js');
    const db = makeDb('postgres://localhost/test');
    expect(db).toBe(mockDrizzleInstance);
  });
});
