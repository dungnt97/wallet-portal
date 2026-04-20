// Global error handler plugin — structured JSON errors with trace_id
// Zod validation errors → 400; unknown errors → 500 (no stack leak in prod)
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyError } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const traceId = request.headers['x-request-id'] as string | undefined;
    const isProd = process.env['NODE_ENV'] === 'production';

    // Zod request validation errors → 400
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
        trace_id: traceId,
      });
    }

    // Zod response serialization errors → 500 (log but don't leak schema)
    if (isResponseSerializationError(error)) {
      app.log.error({ err: error, traceId }, 'Response serialization error');
      return reply.code(500).send({
        code: 'SERIALIZATION_ERROR',
        message: 'Internal server error',
        trace_id: traceId,
      });
    }

    // HTTP errors (e.g. reply.code(401).send()) pass through with their status
    const statusCode = error.statusCode ?? 500;
    app.log.error({ err: error, traceId, statusCode }, 'Unhandled error');

    return reply.code(statusCode).send({
      code: error.code ?? 'INTERNAL_ERROR',
      message: isProd && statusCode >= 500 ? 'Internal server error' : (error.message ?? 'Internal error'),
      trace_id: traceId,
      ...(isProd ? {} : { stack: error.stack }),
    });
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });
