// Zod-validated env config — fails fast at startup if required vars are missing
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(32),
  SVC_BEARER_TOKEN: z.string().min(16),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Google Workspace OIDC (D3 — empty string = no domain enforcement)
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:5173/auth/callback'),
  // Empty = any workspace domain allowed; set to enforce hd claim (D3)
  GOOGLE_WORKSPACE_DOMAIN: z.string().default(''),
  // Session cookie name + TTL
  SESSION_COOKIE_NAME: z.string().default('wp_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  // WebAuthn relying party config
  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_RP_NAME: z.string().default('Wallet Portal'),
  WEBAUTHN_ORIGIN: z.string().default('http://localhost:5173'),
  // Dev bypass — skip Google ID token verification (never set in prod)
  AUTH_DEV_MODE: z.string().default('false'),
  // Policy Engine
  POLICY_ENGINE_URL: z.string().url().default('http://localhost:3003'),
  // RPC endpoints for cold balance probes (Slice 7)
  RPC_BNB_PRIMARY: z.string().url().default('https://bsc-dataseed.binance.org'),
  RPC_SOLANA_PRIMARY: z.string().url().default('https://api.mainnet-beta.solana.com'),
  // Token contract addresses (BNB Chain)
  USDT_BNB_ADDRESS: z.string().default('0x55d398326f99059fF775485246999027B3197955'),
  USDC_BNB_ADDRESS: z.string().default('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'),
  // SPL token mints (Solana)
  USDT_SOL_MINT: z.string().default('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  USDC_SOL_MINT: z.string().default('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().default('admin-api'),
  // Sentry (optional — empty string = disabled)
  SENTRY_DSN: z.string().default(''),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(): Config {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const msg = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  return result.data;
}
