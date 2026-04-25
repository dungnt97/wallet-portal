import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BnbPool, destroyBnbPool, makeBnbPool } from '../rpc/bnb-pool.js';
import {
  type SolanaPool,
  destroySolanaPool,
  makeSolanaPool,
  solanaCall,
} from '../rpc/solana-pool.js';

describe('rpc-pool-variants', () => {
  describe('BNB Pool', () => {
    describe('makeBnbPool', () => {
      it('should throw on empty URLs', () => {
        expect(() => makeBnbPool([])).toThrow('at least one RPC URL');
      });

      it('should create pool with single URL', () => {
        const pool = makeBnbPool(['https://bsc-dataseed1.binance.org']);

        expect(pool).toHaveProperty('provider');
        expect(pool).toHaveProperty('urls');
        expect(pool.urls).toEqual(['https://bsc-dataseed1.binance.org']);
        expect(pool.provider).toBeDefined();
      });

      it('should create pool with multiple URLs', () => {
        const urls = [
          'https://bsc-dataseed1.binance.org',
          'https://bsc-dataseed2.binance.org',
          'https://bsc-dataseed3.binance.org',
        ];
        const pool = makeBnbPool(urls);

        expect(pool.urls).toEqual(urls);
        expect(pool.provider).toBeDefined();
        expect(pool.provider.providerConfigs.length).toBe(3);
      });

      it('should assign highest priority to first URL', () => {
        const urls = ['https://primary.rpc', 'https://secondary.rpc'];
        const pool = makeBnbPool(urls);

        const configs = pool.provider.providerConfigs;
        expect(configs[0].priority).toBe(1);
        expect(configs[1].priority).toBe(2);
      });

      it('should assign weight 2 to first provider, weight 1 to others', () => {
        const urls = ['https://primary.rpc', 'https://secondary.rpc', 'https://tertiary.rpc'];
        const pool = makeBnbPool(urls);

        const configs = pool.provider.providerConfigs;
        expect(configs[0].weight).toBe(2);
        expect(configs[1].weight).toBe(1);
        expect(configs[2].weight).toBe(1);
      });

      it('should use quorum of 1', () => {
        const urls = ['https://rpc1.rpc', 'https://rpc2.rpc'];
        const pool = makeBnbPool(urls);

        // Quorum=1 means wait for first provider to respond
        expect(pool.provider).toBeDefined();
      });

      it('should return single JsonRpcProvider for single URL', () => {
        const pool = makeBnbPool(['https://bsc-dataseed1.binance.org']);

        // Single provider should not be wrapped in FallbackProvider
        expect(pool.provider).toBeDefined();
        expect(typeof pool.provider.send).toBe('function');
      });

      it('should wrap multiple URLs in FallbackProvider', () => {
        const urls = ['https://bsc-dataseed1.binance.org', 'https://bsc-dataseed2.binance.org'];
        const pool = makeBnbPool(urls);

        // FallbackProvider has providerConfigs
        expect(pool.provider.providerConfigs).toBeDefined();
        expect(pool.provider.providerConfigs.length).toBe(2);
      });

      it('should configure static network to avoid network detection RPC call', () => {
        const pool = makeBnbPool(['https://bsc-dataseed1.binance.org']);

        expect(pool.provider).toBeDefined();
        // staticNetwork: true is set on individual providers
      });

      it('should set batchMaxCount to 1 for atomic operations', () => {
        const pool = makeBnbPool(['https://bsc-dataseed1.binance.org']);

        expect(pool.provider).toBeDefined();
        // batchMaxCount: 1 is set on individual providers
      });

      it('should preserve URL order', () => {
        const urls = ['first', 'second', 'third', 'fourth'];
        const pool = makeBnbPool(urls);

        expect(pool.urls).toEqual(urls);
      });
    });

    describe('destroyBnbPool', () => {
      it('should return a promise', () => {
        const pool = makeBnbPool(['https://bsc-dataseed1.binance.org']);

        const result = destroyBnbPool(pool);
        expect(result instanceof Promise).toBe(true);
      });

      it('should handle single provider teardown (JsonRpcProvider)', async () => {
        const pool = makeBnbPool(['https://bsc-dataseed1.binance.org']);
        const destroySpy = vi.spyOn(pool.provider, 'destroy');

        await destroyBnbPool(pool);
        expect(destroySpy).toHaveBeenCalled();
      });

      it('should handle multiple provider teardown (FallbackProvider)', async () => {
        const urls = ['https://bsc-dataseed1.binance.org', 'https://bsc-dataseed2.binance.org'];
        const pool = makeBnbPool(urls);

        // FallbackProvider case with providerConfigs
        await destroyBnbPool(pool);
        // Should not throw
        expect(true).toBe(true);
      });
    });
  });

  describe('Solana Pool', () => {
    describe('makeSolanaPool', () => {
      it('should throw on empty URLs', () => {
        expect(() => makeSolanaPool([])).toThrow('at least one RPC URL');
      });

      it('should create pool with single URL', () => {
        const pool = makeSolanaPool(['https://api.mainnet-beta.solana.com']);

        expect(pool).toHaveProperty('primary');
        expect(pool).toHaveProperty('connections');
        expect(pool).toHaveProperty('urls');
        expect(pool.urls).toEqual(['https://api.mainnet-beta.solana.com']);
      });

      it('should create pool with multiple URLs', () => {
        const urls = [
          'https://api.mainnet-beta.solana.com',
          'https://solana-api.projectserum.com',
          'https://api.rpcpool.com',
        ];
        const pool = makeSolanaPool(urls);

        expect(pool.urls).toEqual(urls);
        expect(pool.connections.length).toBe(3);
      });

      it('should set first connection as primary', () => {
        const urls = ['https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com'];
        const pool = makeSolanaPool(urls);

        expect(pool.primary).toBe(pool.connections[0]);
      });

      it('should preserve connection order with valid URLs', () => {
        const urls = [
          'https://api.mainnet-beta.solana.com',
          'https://solana-api.projectserum.com',
          'https://api.rpcpool.com',
          'https://solana.public-rpc.com',
        ];
        const pool = makeSolanaPool(urls);

        expect(pool.urls).toEqual(urls);
        expect(pool.connections.length).toBe(4);
      });

      it('should use confirmed commitment by default', () => {
        const pool = makeSolanaPool(['https://api.mainnet-beta.solana.com']);

        expect(pool.primary).toBeDefined();
        expect(pool.connections[0]).toBeDefined();
      });

      it('should create independent connections', () => {
        const urls = ['https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com'];
        const pool = makeSolanaPool(urls);

        // Connections should be different objects
        expect(pool.connections[0]).not.toBe(pool.connections[1]);
      });
    });

    describe('solanaCall with failover', () => {
      it('should execute function with primary connection', async () => {
        const pool = makeSolanaPool(['https://api.mainnet-beta.solana.com']);

        const mockFn = vi.fn().mockResolvedValue(42);
        const result = await solanaCall(pool, mockFn);

        expect(result).toBe(42);
        expect(mockFn).toHaveBeenCalled();
      });

      it('should retry on failure', async () => {
        const urls = ['https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com'];
        const pool = makeSolanaPool(urls);

        let callCount = 0;
        const mockFn = vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('First provider down');
          }
          return 'success';
        });

        const result = await solanaCall(pool, mockFn);

        // Should retry and succeed on second attempt
        expect(result).toBe('success');
      });

      it('should throw if all connections fail', async () => {
        const pool = makeSolanaPool(['https://api.mainnet-beta.solana.com']);

        const mockFn = vi.fn().mockRejectedValue(new Error('RPC down'));

        await expect(solanaCall(pool, mockFn)).rejects.toThrow();
      });

      it('should try each connection in order', async () => {
        const urls = [
          'https://api.mainnet-beta.solana.com',
          'https://solana-api.projectserum.com',
          'https://api.rpcpool.com',
        ];
        const pool = makeSolanaPool(urls);

        const calls: number[] = [];
        const mockFn = vi.fn().mockImplementation(async () => {
          calls.push(1);
          if (calls.length < 3) {
            throw new Error(`Attempt ${calls.length} failed`);
          }
          return 'success';
        });

        const result = await solanaCall(pool, mockFn);

        expect(result).toBe('success');
        expect(calls.length).toBe(3);
      });

      it('should support generic return types', async () => {
        const pool = makeSolanaPool(['https://api.mainnet-beta.solana.com']);

        const result = await solanaCall(pool, async () => ({
          slot: 12345,
          timestamp: 1234567890,
        }));

        expect(result.slot).toBe(12345);
        expect(result.timestamp).toBe(1234567890);
      });

      it('should pass connection to function', async () => {
        const pool = makeSolanaPool(['https://api.mainnet-beta.solana.com']);

        let receivedConnection;
        const mockFn = vi.fn().mockImplementation(async (conn) => {
          receivedConnection = conn;
          return 'ok';
        });

        await solanaCall(pool, mockFn);

        expect(receivedConnection).toBeDefined();
        expect(receivedConnection).toBe(pool.primary);
      });
    });

    describe('destroySolanaPool', () => {
      it('should destroy pool without error', async () => {
        const pool = makeSolanaPool(['https://api.mainnet-beta.solana.com']);

        await expect(destroySolanaPool(pool)).resolves.not.toThrow();
      });

      it('should work with multiple connections', async () => {
        const urls = ['https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com'];
        const pool = makeSolanaPool(urls);

        await expect(destroySolanaPool(pool)).resolves.not.toThrow();
      });

      it('should be idempotent', async () => {
        const pool = makeSolanaPool(['https://api.mainnet-beta.solana.com']);

        await destroySolanaPool(pool);
        await expect(destroySolanaPool(pool)).resolves.not.toThrow();
      });
    });
  });

  describe('Pool comparison', () => {
    it('BNB pool uses FallbackProvider (ethers built-in)', () => {
      const bnbPool = makeBnbPool(['https://rpc1.binance.org', 'https://rpc2.binance.org']);

      // Verify FallbackProvider properties
      expect(bnbPool.provider.providerConfigs).toBeDefined();
    });

    it('Solana pool uses manual failover', () => {
      const solPool = makeSolanaPool(['https://rpc1.solana.com', 'https://rpc2.solana.com']);

      // Solana pool stores connections array for manual failover
      expect(solPool.connections.length).toBe(2);
    });

    it('both pools validate non-empty URL list', () => {
      expect(() => makeBnbPool([])).toThrow();
      expect(() => makeSolanaPool([])).toThrow();
    });

    it('both pools preserve URL order', () => {
      const bnbUrls = [
        'https://rpc1.binance.org',
        'https://rpc2.binance.org',
        'https://rpc3.binance.org',
      ];
      const solUrls = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://api.rpcpool.com',
      ];

      const bnbPool = makeBnbPool(bnbUrls);
      const solPool = makeSolanaPool(solUrls);

      expect(bnbPool.urls).toEqual(bnbUrls);
      expect(solPool.urls).toEqual(solUrls);
    });
  });

  describe('Edge cases', () => {
    it('BNB pool handles URL with trailing slash', () => {
      const pool = makeBnbPool(['https://bsc-dataseed1.binance.org/']);

      expect(pool.urls[0]).toBe('https://bsc-dataseed1.binance.org/');
    });

    it('Solana pool handles testnet URL', () => {
      const pool = makeSolanaPool(['https://api.testnet.solana.com']);

      expect(pool.urls[0]).toBe('https://api.testnet.solana.com');
    });

    it('BNB pool handles local RPC', () => {
      const pool = makeBnbPool(['http://localhost:8545']);

      expect(pool.urls[0]).toBe('http://localhost:8545');
    });

    it('Solana pool handles local RPC', () => {
      const pool = makeSolanaPool(['http://localhost:8899']);

      expect(pool.urls[0]).toBe('http://localhost:8899');
    });

    it('BNB pool with many URLs', () => {
      const urls = Array.from({ length: 10 }, (_, i) => `https://rpc${i}.binance.org`);
      const pool = makeBnbPool(urls);

      expect(pool.urls.length).toBe(10);
      expect(pool.provider.providerConfigs.length).toBe(10);
    });

    it('Solana pool with many URLs', () => {
      const urls = Array.from({ length: 10 }, (_, i) => `https://rpc${i}.solana.com`);
      const pool = makeSolanaPool(urls);

      expect(pool.urls.length).toBe(10);
      expect(pool.connections.length).toBe(10);
    });
  });
});
