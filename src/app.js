const express = require('express');
const pinoHttp = require('pino-http');
const { heartbeatHandler } = require('./req-handlers/heartbeat');
const { invalidatePathsHandler } = require('./req-handlers/invalidate-paths');
const { invalidateAllHandler } = require('./req-handlers/invalidate-all');
const { authMiddleware } = require('./req-handlers/auth');
const {
    updateCacheKeyMiddleware,
    getCacheKeyHandler,
} = require('./req-handlers/cache-key');
const { redisCache, validateRedisClientOptions } = require('./redis');
const { logger } = require('./logger');

const appPort = 3002;
const app = express();

app.use(
    pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url.startsWith('/internal/') },
    })
);

const jsonBodyParser = express.json();

app.post(
    '/revalidator-proxy',
    authMiddleware,
    jsonBodyParser,
    updateCacheKeyMiddleware,
    invalidatePathsHandler
);

app.get(
    '/revalidator-proxy/wipe-all',
    authMiddleware,
    updateCacheKeyMiddleware,
    invalidateAllHandler
);

app.get('/liveness', authMiddleware, heartbeatHandler);

app.get('/get-cache-key', getCacheKeyHandler);

// For nais liveness/readyness checks
app.get('/internal/isAlive', (req, res) => {
    return res.status(200).send("I'm alive!");
});
app.get('/internal/isReady', (req, res) => {
    return res.status(200).send("I'm ready!");
});

const server = app.listen(appPort, async (error) => {
    if (error) {
        logger.fatal({ err: error }, 'Failed to start server');
        throw error;
    }

    if (!process.env.SERVICE_SECRET) {
        const msg = 'Authentication key is not defined - shutting down';
        logger.fatal(msg);
        throw new Error(msg);
    }

    if (process.env.NO_VALKEY !== 'true') {
        const isValid = validateRedisClientOptions();
        if (!isValid) {
            const msg = 'Valkey client options are not valid - shutting down';
            logger.error(msg);
            throw new Error(msg);
        }
    }

    await redisCache.init();

    logger.info({ port: appPort }, 'Server starting');
});

const shutdown = () => {
    logger.info('Server shutting down');

    server.close(() => {
        logger.info('Shutdown complete');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
