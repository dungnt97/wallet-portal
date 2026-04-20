// Socket.io emitter — broadcasts deposit.credited event to /stream namespace
// All authenticated UI clients receive this to invalidate their TanStack Query cache
import type { Server as SocketIOServer } from 'socket.io';
import type { CreditDepositResult } from '../services/deposit-credit.service.js';

/**
 * Emit 'deposit.credited' on the /stream namespace.
 * Payload contains only non-sensitive fields (id, userId, chain, token, amount, txHash).
 */
export function emitDepositCredited(io: SocketIOServer, result: CreditDepositResult): void {
  io.of('/stream').emit('deposit.credited', {
    id: result.id,
    userId: result.userId,
    chain: result.chain,
    token: result.token,
    amount: result.amount,
    txHash: result.txHash,
    status: result.status,
  });
}
