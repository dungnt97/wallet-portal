import type { FastifyPluginAsync } from 'fastify';
// Socket.io plugin — mounts Socket.io server on the same HTTP server as Fastify
// Namespace /stream is used for real-time deposit/event pushes (wired in P09)
import fp from 'fastify-plugin';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from '../config/env.js';

const socketPlugin: FastifyPluginAsync<Pick<Config, 'CORS_ORIGIN'>> = async (app, opts) => {
  const io = new SocketIOServer(app.server, {
    path: '/stream',
    cors: {
      origin: opts.CORS_ORIGIN,
      credentials: true,
    },
    // Transports: websocket preferred, polling fallback
    transports: ['websocket', 'polling'],
  });

  // /stream namespace — events emitted for deposits, withdrawals, notifications
  const stream = io.of('/stream');
  stream.on('connection', (socket) => {
    app.log.debug({ socketId: socket.id }, 'Socket.io client connected');

    // Per-staff room: client passes staffId via handshake query on connect.
    // UI sends: io('/stream', { query: { staffId: session.staff.id } })
    // This scopes notif.created events to the intended recipient only.
    const staffId = socket.handshake.query.staffId;
    if (typeof staffId === 'string' && staffId.length > 0) {
      void socket.join(`staff:${staffId}`);
      app.log.debug({ socketId: socket.id, staffId }, 'Socket.io client joined staff room');
    }

    socket.on('disconnect', (reason) => {
      app.log.debug({ socketId: socket.id, reason }, 'Socket.io client disconnected');
    });
  });

  app.decorate('io', io);

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
};

export default fp(socketPlugin, { name: 'socket' });
