// Routes index — registers all route plugins with their prefixes
import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../config/env.js';
import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';
import chainRoutes from './chain.routes.js';
import coldRoutes from './cold.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import depositsRoutes from './deposits.routes.js';
import healthRoutes from './health.routes.js';
import internalRoutes from './internal.routes.js';
import multisigRoutes from './multisig.routes.js';
import notificationAdminRoutes from './notification-admin.routes.js';
import notifChannelsRoutes from './notification-channels.routes.js';
import notificationsRoutes from './notifications.routes.js';
import opsBackupRoutes from './ops-backup.routes.js';
import opsHealthRoutes from './ops-health.routes.js';
import opsKillSwitchRoutes from './ops-kill-switch.routes.js';
import opsSlaComplianceRoutes from './ops-sla-compliance.routes.js';
import rebalanceRoutes from './rebalance.routes.js';
import reconciliationRoutes from './reconciliation.routes.js';
import recoveryRoutes from './recovery.routes.js';
import searchRoutes from './search.routes.js';
import signersRoutes from './signers.routes.js';
import staffRoutes from './staff.routes.js';
import sweepsRoutes from './sweeps.routes.js';
import transactionsRoutes from './transactions.routes.js';
import usersRoutes from './users.routes.js';
import walletsRoutes from './wallets.routes.js';
import withdrawalsRoutes from './withdrawals.routes.js';

const routes: FastifyPluginAsync<{ cfg: Config }> = async (app, opts) => {
  // Public / liveness
  await app.register(healthRoutes);

  // Chain data — gas history + realtime probe
  await app.register(chainRoutes, { cfg: opts.cfg });

  // Auth — Google Workspace OIDC + WebAuthn step-up (P06)
  await app.register(authRoutes, { cfg: opts.cfg });

  // Admin routes (session-protected via per-route preHandler)
  await app.register(coldRoutes);
  await app.register(rebalanceRoutes);
  await app.register(dashboardRoutes);
  await app.register(depositsRoutes);
  await app.register(withdrawalsRoutes);
  await app.register(transactionsRoutes);
  await app.register(multisigRoutes);
  await app.register(sweepsRoutes, { sweepQueue: app.sweepQueue });
  await app.register(usersRoutes);
  await app.register(signersRoutes);
  await app.register(staffRoutes);
  await app.register(walletsRoutes);
  await app.register(auditRoutes);

  // Notifications — bell panel list, unread count, mark-read, prefs
  await app.register(notificationsRoutes);
  // Notification channels read (UI routing matrix) — DB-backed
  await app.register(notifChannelsRoutes);
  // Notification admin CRUD — channels + routing rules (admin-only)
  await app.register(notificationAdminRoutes);

  // Reconciliation — snapshot list, detail, manual trigger, cancel (Slice 10)
  await app.register(reconciliationRoutes);

  // Recovery — stuck-tx list, gas bump, cancel-replace (Slice 11)
  await app.register(recoveryRoutes);

  // Global search — users + tx lookup (command palette backend)
  await app.register(searchRoutes);

  // Ops routes — kill-switch toggle + health aggregator + pg_dump backup
  await app.register(opsKillSwitchRoutes);
  await app.register(opsHealthRoutes);
  await app.register(opsBackupRoutes);
  await app.register(opsSlaComplianceRoutes);

  // Internal service-to-service routes (bearer token, D4) — paths include /internal prefix
  await app.register(internalRoutes, {
    bearerToken: opts.cfg.SVC_BEARER_TOKEN,
  });
};

export default routes;
