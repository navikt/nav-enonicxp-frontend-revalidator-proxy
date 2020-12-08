const express = require('express');
const fetch = require('node-fetch');

const app = express();
const appPort = 3002;

const clientPort = 3000;
const clientRevalidateApi = '/api/internal/revalidate';
const clientStaleTime = 10000;
const clientsAddressToHeartbeatMap = {};

app.get('/revalidator-proxy', (req, res) => {
    const { path } = req.query;
    if (!path) {
        res.status(400).send('No path provided');
        return;
    }

    console.log(`Revalidating ${path}`);

    const staleClients = [];
    const now = Date.now();

    Object.entries(clientsAddressToHeartbeatMap).forEach(([address, lastHeartbeat]) => {
        if (now - lastHeartbeat > clientStaleTime) {
            console.log(`stale client: ${address}`);
            staleClients.push(address);
        } else {
            fetch(
                `http://${address}:${clientPort}${clientRevalidateApi}?path=${path}`
            ).catch(() => console.log(`Error while requesting revalidation to ${address} of ${path}`))
        }
    });

    staleClients.forEach(item => void delete clientsAddressToHeartbeatMap[item]);

    res.status(200).send(`Revalidating ${path}`);
});

app.get('/heartbeat', (req, res) => {
    const { address } = req.query;
    if (!address) {
        res.status(400).send('No address provided');
        return;
    }

    console.log(`Heartbeat from ${address}`);

    clientsAddressToHeartbeatMap[address] = Date.now();

    res.status(200).send(`${address} liveness updated`);
});

app.get('/shutdown', (req, res) => {
    const { address } = req.query;
    if (!address) {
        res.status(400).send('No address provided');
        return;
    }

    if (clientsAddressToHeartbeatMap[address]) {
        delete clientsAddressToHeartbeatMap[address];
        res.status(200).send(`${address} removed from client list`);
    } else {
        res.status(200).send(`${address} not found in client list`);
    }
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
