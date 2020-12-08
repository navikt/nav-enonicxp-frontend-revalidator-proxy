const express = require('express');
const fetch = require('node-fetch');

const app = express();
const port = 3002;
const clientPort = 3000;
const clientLivenessApi = '/api/internal/isAlive';
const clientRevalidateApi = '/api/revalidate';

const livenessCheckPeriod = 5000;
const livenessTimeout = 1000;

const clientList = {};

const secret = process.env.SERVICE_SECRET;

const fetchWithTimeout = (url) =>
    Promise.race([
        fetch(url),
        new Promise((res) =>
            setTimeout(
                () =>
                    res({
                        ok: false,
                        status: 408,
                        statusText: 'Request Timeout',
                    }),
                livenessTimeout
            )
        ),
    ]);

const checkLiveness = async () => {
    const deadClients = await Object.keys(clientList).reduce(
        async (deadList, clientAddress) => {
            const liveness = await fetchWithTimeout(
                `http://${clientAddress}:${clientPort}${clientLivenessApi}`
            ).then((res) => res.ok).catch((e) => {
                console.log(`Error during liveness check for ${clientAddress}: ${e}`);
                return false;
            });

            console.log(`${clientAddress} is alive? `, liveness);

            if (!liveness) {
                return [...(await deadList), clientAddress];
            }

            return deadList;
        },
        []
    );

    if (deadClients.length > 0) {
        console.log(
            `Updating client list at ${Date.now()}. Dead clients to be removed: `,
            deadClients
        );

        deadClients.forEach((client) => delete clientList[client]);
    }
};

app.get('/revalidator-proxy', (req, res) => {
    const { path } = req.query;
    if (!path) {
        res.status(400).send('No path provided');
        return;
    }

    Object.keys(clientList).forEach((clientAddress) =>
        fetch(
            `http://${clientAddress}:${clientPort}${clientRevalidateApi}?path=${path}`,
            { headers: { secret } }
        ).catch(() => console.log(`Error while requesting revalidation to ${clientAddress} of ${path}`))
    );

    console.log(`Revalidating ${path}`);

    res.status(200).send(`Revalidating ${path}`);
});

app.get('/heartbeat', (req, res) => {
    const { address } = req.query;
    if (!address) {
        res.status(400).send('No address provided');
        return;
    }

    console.log(`heartbeat from ${address}`);

    if (!clientList[address]) {
        clientList[address] = true;
    }

    res.status(200).send(`${address} subscribed`);
});

app.get('/shutdown', (req, res) => {
    const { address } = req.query;
    if (!address) {
        res.status(400).send('No address provided');
        return;
    }

    if (clientList[address]) {
        delete clientList[address];
        res.status(200).send(`${address} unsubscribed`);
    } else {
        res.status(200).send(`${address} not found in subscribers list`);
    }
});

app.get('/internal/isAlive', (req, res) => {
   return res.status(200).send('Ok!');
});

app.get('/internal/isReady', (req, res) => {
    return res.status(200).send('Ok!');
});


const server = app.listen(port, () => {
    console.log(`started revalidator proxy server at http://localhost:${port}`);
});

const livenessIntervalTimer = setInterval(checkLiveness, livenessCheckPeriod);

const shutdown = () => {
    console.log('Shutting down');
    clearInterval(livenessIntervalTimer);

    server.close(() => {
        console.log('Shutdown complete!');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
