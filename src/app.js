const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const appPort = 3002;

const clientPort = 3000;
const clientRevalidateApi = '/api/internal/revalidate-cache';
const clientStaleTime = 10000;
const clientsAddressHeartbeat = {};

const { SERVICE_SECRET } = process.env;

app.get('/revalidator-proxy', (req, res) => {
    const { secret } = req.headers;
    if (secret !== SERVICE_SECRET) {
        console.log("proxy request denied");
        res.status(401).send('Not authorized');
        return;
    }

    const { path } = req.query;
    if (!path) {
        res.status(400).send('No path provided');
        return;
    }

    console.log(`Revalidating ${path}`);

    Object.entries(clientsAddressHeartbeat).forEach(([address, lastHeartbeat]) => {
        if (Date.now() - lastHeartbeat > clientStaleTime) {
            console.log(`Removing stale client: ${address}`);
            delete clientsAddressHeartbeat[address];
        } else {
            fetch(
                `http://${address}:${clientPort}${clientRevalidateApi}?path=${path}`
            ).catch(() => console.error(`Error while requesting revalidation to ${address} of ${path}`))
        }
    });

    res.status(200).send(`Revalidating ${path}`);
});

app.get('/liveness', (req, res) => {
    const { secret } = req.headers;
    if (secret !== SERVICE_SECRET) {
        console.log("liveness request denied");
        res.status(401).send('Not authorized');
        return;
    }

    const { address } = req.query;
    if (!address) {
        res.status(400).send('No address provided');
        return;
    }

    if (!clientsAddressHeartbeat[address]) {
        console.log(`New client: ${address}`);
    }

    clientsAddressHeartbeat[address] = Date.now();

    res.status(200).send(`${address} liveness updated`);
});

app.get('/internal/isAlive', (req, res) => {
    return res.status(200).send('Ok!');
});

app.get('/internal/isReady', (req, res) => {
    return res.status(200).send('Ok!');
});

const server = app.listen(appPort, () => {
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
