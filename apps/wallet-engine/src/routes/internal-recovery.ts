// Internal recovery routes — bearer-protected endpoints called by admin-api recovery services.
// POST /internal/recovery/bump  — sign + broadcast a replacement tx with bumped fees
// POST /internal/recovery/cancel — sign + broadcast a 0-value self-send cancel tx (EVM only)
//
// Both routes are registered in wallet-engine server.ts alongside internalDerivePlugin.
import { timingSafeEqual } from 'node:crypto';
import type { Connection } from '@solana/web3.js';
import type { FallbackProvider } from 'ethers';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { bumpEvmTx } from '../services/recovery-bump-evm.js';
import { bumpSolanaTx } from '../services/recovery-bump-solana.js';
import { cancelEvmTx } from '../services/recovery-cancel-evm.js';

// ── Input/output schemas ──────────────────────────────────────────────────────

const BumpBody = z.object({
  entityType: z.enum(['withdrawal', 'sweep']),
  entityId: z.string().uuid(),
  chain: z.enum(['bnb', 'sol']),
  /** EVM-only: original tx hash to re-read params from RPC */
  originalTxHash: z.string(),
  /** EVM-only: nonce of the original tx */
  nonce: z.number().int().optional(),
  /** Fee multiplier, e.g. 1.15 */
  feeMultiplier: z.number().positive(),
  /** HD derivation index for the signing wallet */
  hdIndex: z.number().int().min(0),
  /** Solana-only: current compute unit price in microLamports (0 = unknown) */
  currentCuPriceMicroLamports: z.number().int().min(0).optional().default(0),
  /** Solana-only: original tx bytes as base64 */
  originalTxBase64: z.string().optional(),
});

const CancelBody = z.object({
  entityType: z.enum(['withdrawal', 'sweep']),
  entityId: z.string().uuid(),
  chain: z.enum(['bnb', 'sol']),
  originalTxHash: z.string(),
  nonce: z.number().int(),
  /** Fee multiplier for cancel tx (e.g. 1.2) */
  feeMultiplier: z.number().positive(),
  hdIndex: z.number().int().min(0),
  chainId: z.coerce.bigint(),
  /** Hot-safe address — cancel tx sends 0 value to self */
  hotSafeAddress: z.string(),
});

// ── Plugin options ─────────────────────────────────────────────────────────────

export interface InternalRecoveryPluginOpts {
  bearerToken: string;
  bnbProvider: FallbackProvider;
  solanaConnection: Connection;
}

// ── Plugin ─────────────────────────────────────────────────────────────────────

const internalRecoveryPlugin: FastifyPluginAsync<InternalRecoveryPluginOpts> = async (
  app,
  opts
) => {
  const { bearerToken, bnbProvider, solanaConnection } = opts;

  // Bearer auth hook — constant-time compare
  app.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply
        .code(401)
        .send({ code: 'MISSING_BEARER', message: 'Authorization: Bearer <token> required' });
    }
    const provided = authHeader.slice(7);
    const a = Buffer.from(provided.padEnd(64));
    const b = Buffer.from(bearerToken.padEnd(64));
    const valid =
      provided.length === bearerToken.length &&
      timingSafeEqual(a.subarray(0, 64), b.subarray(0, 64));
    if (!valid) {
      return reply.code(401).send({ code: 'INVALID_BEARER', message: 'Invalid bearer token' });
    }
  });

  // ── POST /internal/recovery/bump ────────────────────────────────────────────
  app.post<{ Body: z.infer<typeof BumpBody> }>(
    '/internal/recovery/bump',
    {
      schema: {
        body: {
          type: 'object',
          required: [
            'entityType',
            'entityId',
            'chain',
            'originalTxHash',
            'feeMultiplier',
            'hdIndex',
          ],
        },
      },
    },
    async (req, reply) => {
      const parseResult = BumpBody.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({ code: 'INVALID_BODY', message: parseResult.error.message });
      }
      const body = parseResult.data;

      try {
        if (body.chain === 'bnb') {
          if (body.nonce == null) {
            return reply
              .code(400)
              .send({ code: 'MISSING_NONCE', message: 'nonce required for EVM bump' });
          }
          const result = await bumpEvmTx(
            {
              originalTxHash: body.originalTxHash,
              nonce: body.nonce,
              feeMultiplier: body.feeMultiplier,
              chainId: BigInt(process.env.BNB_CHAIN_ID ?? '56'),
              hdIndex: body.hdIndex,
            },
            bnbProvider
          );
          return reply.code(200).send({
            txHash: result.txHash,
            newMaxFeePerGasWei: result.newMaxFeePerGas.toString(),
            newMaxPriorityFeePerGasWei: result.newMaxPriorityFeePerGas.toString(),
          });
        }

        // Solana bump
        if (!body.originalTxBase64) {
          return reply
            .code(400)
            .send({
              code: 'MISSING_TX_BASE64',
              message: 'originalTxBase64 required for Solana bump',
            });
        }
        const result = await bumpSolanaTx(
          {
            originalTxBase64: body.originalTxBase64,
            currentCuPriceMicroLamports: body.currentCuPriceMicroLamports,
            feeMultiplier: body.feeMultiplier,
            hdIndex: body.hdIndex,
          },
          solanaConnection
        );
        return reply.code(200).send({
          txHash: result.txSignature,
          newCuPriceMicroLamports: result.newCuPriceMicroLamports,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        app.log.error({ err, body }, 'recovery bump failed');

        // Specific error codes map to HTTP status
        if (msg === 'GAS_ORACLE_UNAVAILABLE' || msg === 'SOLANA_BLOCKHASH_UNAVAILABLE') {
          return reply.code(503).send({ code: 'GAS_ORACLE_UNAVAILABLE', message: msg });
        }
        if (msg.startsWith('BUMP_FEE_CAP_EXCEEDED')) {
          return reply.code(422).send({ code: 'BUMP_FEE_CAP_EXCEEDED', message: msg });
        }
        return reply.code(500).send({ code: 'BUMP_FAILED', message: msg });
      }
    }
  );

  // ── POST /internal/recovery/cancel ──────────────────────────────────────────
  app.post<{ Body: z.infer<typeof CancelBody> }>(
    '/internal/recovery/cancel',
    {
      schema: {
        body: {
          type: 'object',
          required: [
            'entityType',
            'entityId',
            'chain',
            'originalTxHash',
            'nonce',
            'feeMultiplier',
            'hdIndex',
            'chainId',
            'hotSafeAddress',
          ],
        },
      },
    },
    async (req, reply) => {
      const parseResult = CancelBody.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({ code: 'INVALID_BODY', message: parseResult.error.message });
      }
      const body = parseResult.data;

      // Solana cancel not supported (no nonce semantics — tx self-expires)
      if (body.chain === 'sol') {
        return reply.code(410).send({
          code: 'cancel_not_supported_on_solana',
          message:
            'Solana transactions auto-expire after ~2 minutes — no cancel needed. ' +
            'Remedy: wait for blockhash expiry or bump to rebroadcast.',
        });
      }

      try {
        const result = await cancelEvmTx(
          {
            originalTxHash: body.originalTxHash,
            nonce: body.nonce,
            feeMultiplier: body.feeMultiplier,
            chainId: body.chainId,
            hdIndex: body.hdIndex,
            hotSafeAddress: body.hotSafeAddress as `0x${string}`,
          },
          bnbProvider
        );
        return reply.code(200).send({
          txHash: result.txHash,
          newMaxFeePerGasWei: result.newMaxFeePerGas.toString(),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        app.log.error({ err, body }, 'recovery cancel failed');
        if (msg === 'GAS_ORACLE_UNAVAILABLE') {
          return reply.code(503).send({ code: 'GAS_ORACLE_UNAVAILABLE', message: msg });
        }
        if (msg.startsWith('CANCEL_FEE_CAP_EXCEEDED')) {
          return reply.code(422).send({ code: 'CANCEL_FEE_CAP_EXCEEDED', message: msg });
        }
        return reply.code(500).send({ code: 'CANCEL_FAILED', message: msg });
      }
    }
  );
};

export default internalRecoveryPlugin;
