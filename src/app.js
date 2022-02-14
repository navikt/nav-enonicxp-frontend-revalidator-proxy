const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const appPort = 3002;

const clientPort = 3000;
const clientStaleTime = 10000;
const clientsAddressHeartbeat = {};

const recentEvents = {
    eventTimeout: 10000,
    eventStatus: {},
    updateEventStatus: function (path, eventId) {
        if (!eventId) {
            return false;
        }

        if (!this.eventStatus[eventId]) {
            this.eventStatus[eventId] = {
                [path]: true,
            };
            setTimeout(() => {
                delete this.eventStatus[eventId];
                console.log(`Removed entry for event ${eventId}`);
            }, this.eventTimeout);

            return false;
        } else if (!this.eventStatus[eventId][path]) {
            this.eventStatus[eventId][path] = true;
            return false;
        }

        return true;
    },
};

const { SERVICE_SECRET } = process.env;

const options = { headers: { secret: SERVICE_SECRET } };

const callClients = (callback) => {
    Object.entries(clientsAddressHeartbeat).forEach(
        ([address, lastHeartbeat]) => {
            if (Date.now() - lastHeartbeat < clientStaleTime) {
                callback(address);
            } else {
                console.log(`Removing stale client: ${address}`);
                delete clientsAddressHeartbeat[address];
            }
        }
    );
};

app.get('/revalidator-proxy', (req, res) => {
    const { secret } = req.headers;
    const { path, eventId } = req.query;
    const encodedPath = encodeURI(path);

    if (secret !== SERVICE_SECRET) {
        console.error(`Proxy request denied for ${encodedPath} (401)`);
        return res.status(401).send('Not authorized');
    }

    if (!path) {
        return res.status(400).send('Path-parameter must be provided');
    }

    const eventWasProcessedForPath = recentEvents.updateEventStatus(
        path,
        eventId
    );

    if (eventWasProcessedForPath) {
        console.log(`This event has already been processsed for ${path}`);
        return res
            .status(200)
            .send(`This event has already been processsed for ${path}`);
    }

    callClients((address) =>
        fetch(
            `http://${address}:${clientPort}${encodedPath}?invalidate=true`,
            options
        ).catch((e) =>
            console.error(
                `Error while requesting revalidation to ${address} of ${encodedPath} - ${e}`
            )
        )
    );

    const msg = `Sent invalidation request for ${encodedPath} with eventId ${eventId} to all clients`;
    console.log(msg);
    res.status(200).send(msg);
});

app.get('/revalidator-proxy/wipe-all', (req, res) => {
    const { secret } = req.headers;

    if (secret !== SERVICE_SECRET) {
        console.error(`Proxy request denied for wipe-all (401)`);
        return res.status(401).send('Not authorized');
    }

    callClients((address) =>
        fetch(`http://${address}:${clientPort}?wipeAll=true`, options).catch(
            (e) =>
                console.error(
                    `Error while requesting revalidation to ${address} of ${encodedPath} - ${e}`
                )
        )
    );

    const msg = 'Sent wipe-all request to all clients';
    console.log(msg);
    res.status(200).send(msg);
});

app.get('/liveness', (req, res) => {
    const { secret } = req.headers;
    const { address } = req.query;

    if (secret !== SERVICE_SECRET) {
        console.log(`Liveness request denied for ${address} (401)`);
        return res.status(401).send('Not authorized');
    }

    if (!address) {
        return res.status(400).send('No address provided');
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
    if (!SERVICE_SECRET) {
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
