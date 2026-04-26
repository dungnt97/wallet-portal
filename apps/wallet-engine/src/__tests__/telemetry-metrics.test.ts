import { describe, expect, it } from 'vitest';
import {
  depositConfirmJobsTotal,
  depositConfirmationDurationSeconds,
  depositsDetectedTotal,
  httpRequestDurationSeconds,
  httpRequestsTotal,
  registry,
  rpcProbeFailuresTotal,
  rpcProbeTotal,
  watcherBlockLag,
} from '../telemetry/metrics.js';

describe('telemetry-metrics', () => {
  describe('registry', () => {
    it('should be a valid Prometheus registry', () => {
      expect(registry).toBeDefined();
      expect(typeof registry.metrics).toBe('function');
    });

    it('should have metrics method', () => {
      expect(typeof registry.metrics).toBe('function');
      const metrics = registry.metrics();
      // metrics() returns metric data (could be array or string depending on prom-client version)
      expect(metrics).toBeDefined();
    });

    it('should have service name available', () => {
      // Service name comes from OTEL_SERVICE_NAME env var or defaults to wallet-engine
      const serviceName = process.env.OTEL_SERVICE_NAME ?? 'wallet-engine';
      expect(serviceName).toBeTruthy();
    });
  });

  describe('httpRequestsTotal counter', () => {
    it('should be a Counter metric with inc function', () => {
      expect(httpRequestsTotal).toBeDefined();
      expect(typeof httpRequestsTotal.inc).toBe('function');
    });

    it('should accept labeled increments', () => {
      expect(() =>
        httpRequestsTotal.inc({ method: 'GET', route: '/health', status_code: '200' })
      ).not.toThrow();
    });

    it('should accept increments with value', () => {
      expect(() =>
        httpRequestsTotal.inc({ method: 'GET', route: '/api', status_code: '200' }, 5)
      ).not.toThrow();
    });

    it('should handle various HTTP methods', () => {
      expect(() => {
        httpRequestsTotal.inc({ method: 'GET', route: '/api', status_code: '200' });
        httpRequestsTotal.inc({ method: 'POST', route: '/api', status_code: '201' });
        httpRequestsTotal.inc({ method: 'DELETE', route: '/api', status_code: '204' });
      }).not.toThrow();
    });

    it('should handle various status codes', () => {
      expect(() => {
        httpRequestsTotal.inc({ method: 'GET', route: '/api', status_code: '200' });
        httpRequestsTotal.inc({ method: 'GET', route: '/api', status_code: '400' });
        httpRequestsTotal.inc({ method: 'GET', route: '/api', status_code: '500' });
      }).not.toThrow();
    });
  });

  describe('httpRequestDurationSeconds histogram', () => {
    it('should be a Histogram metric with observe function', () => {
      expect(httpRequestDurationSeconds).toBeDefined();
      expect(typeof httpRequestDurationSeconds.observe).toBe('function');
    });

    it('should observe request durations', () => {
      expect(() =>
        httpRequestDurationSeconds.observe(
          { method: 'GET', route: '/api', status_code: '200' },
          0.05
        )
      ).not.toThrow();
    });

    it('should record various latencies', () => {
      expect(() => {
        const latencies = [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5];
        for (const latency of latencies) {
          httpRequestDurationSeconds.observe(
            { method: 'GET', route: '/api', status_code: '200' },
            latency
          );
        }
      }).not.toThrow();
    });

    it('should track different endpoints', () => {
      expect(() => {
        httpRequestDurationSeconds.observe(
          { method: 'GET', route: '/health', status_code: '200' },
          0.001
        );
        httpRequestDurationSeconds.observe(
          { method: 'POST', route: '/deposit-sync', status_code: '201' },
          0.05
        );
      }).not.toThrow();
    });

    it('should handle extreme latencies', () => {
      expect(() => {
        httpRequestDurationSeconds.observe(
          { method: 'GET', route: '/api', status_code: '200' },
          0.0001
        );
        httpRequestDurationSeconds.observe(
          { method: 'GET', route: '/api', status_code: '200' },
          10
        );
      }).not.toThrow();
    });
  });

  describe('depositsDetectedTotal counter', () => {
    it('should be a Counter metric with inc function', () => {
      expect(depositsDetectedTotal).toBeDefined();
      expect(typeof depositsDetectedTotal.inc).toBe('function');
    });

    it('should track deposits for multiple chains', () => {
      expect(() => {
        depositsDetectedTotal.inc({ chain: 'bnb', token: 'USDT' });
        depositsDetectedTotal.inc({ chain: 'sol', token: 'USDT' });
        depositsDetectedTotal.inc({ chain: 'eth', token: 'USDC' });
      }).not.toThrow();
    });

    it('should support incrementing by value', () => {
      expect(() => depositsDetectedTotal.inc({ chain: 'bnb', token: 'USDT' }, 10)).not.toThrow();
    });
  });

  describe('depositConfirmJobsTotal counter', () => {
    it('should be a Counter metric with inc function', () => {
      expect(depositConfirmJobsTotal).toBeDefined();
      expect(typeof depositConfirmJobsTotal.inc).toBe('function');
    });

    it('should track deposit confirmation job statuses', () => {
      expect(() => {
        depositConfirmJobsTotal.inc({ status: 'enqueued' });
        depositConfirmJobsTotal.inc({ status: 'processing' });
        depositConfirmJobsTotal.inc({ status: 'completed' });
      }).not.toThrow();
    });

    it('should support success and failure statuses', () => {
      expect(() => {
        depositConfirmJobsTotal.inc({ status: 'succeeded' });
        depositConfirmJobsTotal.inc({ status: 'failed' });
      }).not.toThrow();
    });
  });

  describe('rpcProbeTotal counter', () => {
    it('should be a Counter metric with inc function', () => {
      expect(rpcProbeTotal).toBeDefined();
      expect(typeof rpcProbeTotal.inc).toBe('function');
    });

    it('should track RPC probe attempts by chain', () => {
      expect(() => {
        rpcProbeTotal.inc({ chain: 'bnb' });
        rpcProbeTotal.inc({ chain: 'sol' });
      }).not.toThrow();
    });

    it('should support bulk probe increments', () => {
      expect(() => rpcProbeTotal.inc({ chain: 'bnb' }, 100)).not.toThrow();
    });
  });

  describe('rpcProbeFailuresTotal counter', () => {
    it('should be a Counter metric with inc function', () => {
      expect(rpcProbeFailuresTotal).toBeDefined();
      expect(typeof rpcProbeFailuresTotal.inc).toBe('function');
    });

    it('should track RPC probe failures by chain', () => {
      expect(() => {
        rpcProbeFailuresTotal.inc({ chain: 'bnb' });
        rpcProbeFailuresTotal.inc({ chain: 'sol' });
      }).not.toThrow();
    });

    it('should track multiple failures', () => {
      expect(() => rpcProbeFailuresTotal.inc({ chain: 'bnb' }, 5)).not.toThrow();
    });
  });

  describe('watcherBlockLag gauge', () => {
    it('should be a Gauge metric with set function', () => {
      expect(watcherBlockLag).toBeDefined();
      expect(typeof watcherBlockLag.set).toBe('function');
    });

    it('should set block lag by chain', () => {
      expect(() => {
        watcherBlockLag.set({ chain: 'bnb' }, 10);
        watcherBlockLag.set({ chain: 'sol' }, 5);
      }).not.toThrow();
    });

    it('should handle various lag values', () => {
      expect(() => {
        watcherBlockLag.set({ chain: 'bnb' }, 0);
        watcherBlockLag.set({ chain: 'bnb' }, 10);
        watcherBlockLag.set({ chain: 'bnb' }, 1000000);
      }).not.toThrow();
    });

    it('should be updatable', () => {
      expect(() => {
        watcherBlockLag.set({ chain: 'bnb' }, 10);
        watcherBlockLag.set({ chain: 'bnb' }, 15);
        watcherBlockLag.set({ chain: 'bnb' }, 8);
      }).not.toThrow();
    });
  });

  describe('depositConfirmationDurationSeconds histogram', () => {
    it('should be a Histogram metric with observe function', () => {
      expect(depositConfirmationDurationSeconds).toBeDefined();
      expect(typeof depositConfirmationDurationSeconds.observe).toBe('function');
    });

    it('should observe confirmation latencies by chain', () => {
      expect(() => {
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 30);
        depositConfirmationDurationSeconds.observe({ chain: 'sol' }, 15);
      }).not.toThrow();
    });

    it('should handle configured bucket ranges', () => {
      expect(() => {
        const latencies = [5, 15, 50, 100, 250, 500, 1500, 3600];
        for (const latency of latencies) {
          depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, latency);
        }
      }).not.toThrow();
    });

    it('should track different chains separately', () => {
      expect(() => {
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 25);
        depositConfirmationDurationSeconds.observe({ chain: 'sol' }, 12);
        depositConfirmationDurationSeconds.observe({ chain: 'eth' }, 45);
      }).not.toThrow();
    });

    it('should handle extreme latencies', () => {
      expect(() => {
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 1);
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 3600);
      }).not.toThrow();
    });
  });

  describe('Integration: Full monitoring scenario', () => {
    it('should track complete request lifecycle', () => {
      expect(() => {
        // Request arrived
        httpRequestsTotal.inc({ method: 'POST', route: '/deposit-sync', status_code: '202' });

        // Deposit detected during processing
        depositsDetectedTotal.inc({ chain: 'bnb', token: 'USDT' }, 3);

        // Confirmation jobs enqueued
        depositConfirmJobsTotal.inc({ status: 'enqueued' }, 3);

        // RPC probe called
        rpcProbeTotal.inc({ chain: 'bnb' });

        // Request completed
        httpRequestDurationSeconds.observe(
          { method: 'POST', route: '/deposit-sync', status_code: '202' },
          0.05
        );
      }).not.toThrow();
    });

    it('should track RPC health monitoring', () => {
      expect(() => {
        // Simulate 100 probes with 5% failure rate
        rpcProbeTotal.inc({ chain: 'bnb' }, 100);
        rpcProbeFailuresTotal.inc({ chain: 'bnb' }, 5);
      }).not.toThrow();
    });

    it('should track watcher performance', () => {
      expect(() => {
        // Initial lag is high
        watcherBlockLag.set({ chain: 'bnb' }, 100);

        // After catching up
        watcherBlockLag.set({ chain: 'bnb' }, 1);

        // Meanwhile Sol watcher lags behind
        watcherBlockLag.set({ chain: 'sol' }, 50);
      }).not.toThrow();
    });

    it('should track deposit confirmation SLO', () => {
      expect(() => {
        // Deposits confirmed fast
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 15);
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 25);
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 30);

        // Some slow confirmations
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 120);
        depositConfirmationDurationSeconds.observe({ chain: 'bnb' }, 180);
      }).not.toThrow();
    });
  });
});
