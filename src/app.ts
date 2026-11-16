import express, { type Request, type Response } from 'express';
import { authMiddleware } from './req-handlers/auth';
import {
    getCacheKeyHandler,
    updateCacheKeyMiddleware,
} from './req-handlers/cache-key';
import { heartbeatHandler } from './req-handlers/heartbeat';
import { invalidateAllHandler } from './req-handlers/invalidate-all';
import { invalidatePathsHandler } from './req-handlers/invalidate-paths';
import { redisCache, validateRedisClientOptions } from './redis';
import { logger } from './logger';
import { countHeartbeat, countInvalidation, metricsHandler } from './metrics';

// APP_PORT lets the tests run the app next to one on the default port
const appPort = Number(process.env.APP_PORT) || 3002;
const app = express();

const jsonBodyParser = express.json();

app.post(
    '/revalidator-proxy',
    countInvalidation('paths'),
    authMiddleware,
    jsonBodyParser,
    updateCacheKeyMiddleware,
    invalidatePathsHandler
);

app.get(
    '/revalidator-proxy/wipe-all',
    countInvalidation('wipe_all'),
    authMiddleware,
    updateCacheKeyMiddleware,
    invalidateAllHandler
);

app.get('/liveness', countHeartbeat, authMiddleware, heartbeatHandler);

app.get('/get-cache-key', getCacheKeyHandler);

// For nais liveness/readyness checks
app.get('/internal/isAlive', (_req: Request, res: Response) => {
    return res.status(200).send("I'm alive!");
});
app.get('/internal/isReady', (_req: Request, res: Response) => {
    return res.status(200).send("I'm ready!");
});
app.get('/internal/metrics', metricsHandler);

const server = app.listen(appPort, async () => {
    try {
        if (!process.env.SERVICE_SECRET) {
            const msg = 'Authentication key is not defined - shutting down';
            logger.error({ message: msg });
            throw new Error(msg);
        }

        if (process.env.NO_VALKEY !== 'true') {
            const isValid = validateRedisClientOptions();
            if (!isValid) {
                const msg =
                    'Valkey client options are not valid - shutting down';
                logger.error({ message: msg });
                throw new Error(msg);
            }
        }

        await redisCache.init();

        logger.info({ message: `Server starting on port ${appPort}` });
    } catch (error) {
        logger.error({ error }, 'Failed to start server');
        server.close(() => process.exit(1));
    }
});

const shutdown = (): void => {
    logger.info({ message: 'Server shutting down' });

    server.close(() => {
        logger.info({ message: 'Shutdown complete!' });
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
