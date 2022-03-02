require('dotenv').config();

const express = require('express');
const { invalidatePathLegacyHandler } = require('./legacy');
const { heartbeatHandler } = require('./req-handlers/heartbeat');
const { invalidatePathsHandler } = require('./req-handlers/invalidate-paths');
const { invalidateAllHandler } = require('./req-handlers/invalidate-all');
const { authHandler } = require('./req-handlers/auth');

const appPort = 3002;
const app = express();

const jsonBodyParser = express.json();

app.get('/revalidator-proxy', authHandler, invalidatePathLegacyHandler);

app.post(
    '/revalidator-proxy',
    authHandler,
    jsonBodyParser,
    invalidatePathsHandler
);

app.get('/revalidator-proxy/wipe-all', authHandler, invalidateAllHandler);

app.get('/liveness', authHandler, heartbeatHandler);

// For nais liveness/readyness checks
app.get('/internal/isAlive', (req, res) => {
    return res.status(200).send("I'm alive!");
});
app.get('/internal/isReady', (req, res) => {
    return res.status(200).send("I'm ready!");
});

const server = app.listen(appPort, () => {
    if (!process.env.SERVICE_SECRET) {
        const msg = 'Authentication key is not defined - shutting down';
        console.error(msg);
        throw new Error(msg);
    }
    console.log(`Server starting on port ${appPort}`);
});

const shutdown = () => {
    console.log('Server shutting down');

    server.close(() => {
        console.log('Shutdown complete!');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
