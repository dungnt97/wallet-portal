// Zod-validated environment configuration — fails fast on missing/invalid vars
import { z } from 'zod';

/** Comma-separated URL list → string array */
const urlList = z
  .string()
  .transform((s) => s.split(',').map((u) => u.trim()).filter(Boolean));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis / BullMQ
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // RPC endpoints (comma-separated for pool)
  RPC_BNB_PRIMARY: z.string().url(),
  RPC_BNB_FALLBACK: z.string().url().optional(),
  RPC_SOLANA_PRIMARY: z.string().url(),
  RPC_SOLANA_FALLBACK: z.string().url().optional(),

  // Admin API service-to-service
  ADMIN_API_BASE_URL: z.string().url().default('http://localhost:3001'),
  SVC_BEARER_TOKEN: z.string().min(16),

  // HD derivation — DEV FIXTURE ONLY. Prod uses HSM/KMS (future phase).
  HD_MASTER_XPUB_BNB: z.string().min(1),
  HD_MASTER_SEED_SOLANA: z.string().min(1),

  // Token contract addresses
  USDT_BNB_ADDRESS: z.string().default('0x55d398326f99059fF775485246999027B3197955'),
  USDC_BNB_ADDRESS: z.string().default('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'),
  USDT_SOL_MINT: z.string().default('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  USDC_SOL_MINT: z.string().default('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().default('wallet-engine'),
  // Sentry (optional — empty string = disabled)
  SENTRY_DSN: z.string().default(''),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(): AppConfig {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const msg = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  return result.data;
}

/** Build BNB RPC URL array from primary + optional fallback */
export function bnbRpcUrls(cfg: AppConfig): string[] {
  return [cfg.RPC_BNB_PRIMARY, cfg.RPC_BNB_FALLBACK].filter(Boolean) as string[];
}

/** Build Solana RPC URL array from primary + optional fallback */
export function solanaRpcUrls(cfg: AppConfig): string[] {
  return [cfg.RPC_SOLANA_PRIMARY, cfg.RPC_SOLANA_FALLBACK].filter(Boolean) as string[];
}
