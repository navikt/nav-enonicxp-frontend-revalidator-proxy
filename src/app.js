const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const appPort = 3002;

const clientPort = 3000;
const clientStaleTime = 10000;
const clientsAddressHeartbeat = {};

const { SERVICE_SECRET } = process.env;

const options = { headers: { secret: SERVICE_SECRET } };

const jsonBodyParser = bodyParser.json();

// Revalidate requests from Enonic XP are sent independently by every node in the server cluster.
// Each request has an associated eventId, which corresponds to a publishing event. This id is identical across all
// servers per event.
//
// This object keeps track of which requests per event that have already been proxied to the frontend and prevents
// duplicate calls for the same event
const recentEvents = {
    eventTimeout: 10000,
    eventStatus: {},
    updateEventStatus: function (eventId) {
        if (!eventId) {
            return false;
        }

        if (this.eventStatus[eventId]) {
            return true;
        }

        console.log(`Adding entry for event ${eventId}`);
        this.eventStatus[eventId] = true;

        setTimeout(() => {
            console.log(`Event ${eventId} expired`);
            delete this.eventStatus[eventId];
        }, this.eventTimeout);

        return false;
    },
};

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

app.post('/revalidator-proxy', jsonBodyParser, (req, res) => {
    const { secret, eventId } = req.headers;

    if (secret !== SERVICE_SECRET) {
        console.error(`Proxy request denied for event ${eventId} (401)`);
        return res.status(401).send('Not authorized');
    }

    const { paths } = req.body;

    if (!Array.isArray(paths)) {
        return res
            .status(400)
            .send('Body field "paths" is required and must be an array');
    }

    const eventWasProcessed = recentEvents.updateEventStatus(eventId);

    if (eventWasProcessed) {
        const msg = `Event ${eventId} has already been processsed`;
        console.log(msg);
        return res.status(200).send(msg);
    }

    callClients((address) =>
        fetch(`http://${address}:${clientPort}?invalidatePaths=true`, {
            ...options,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paths, eventId }),
        }).catch((e) =>
            console.error(
                `Error while requesting revalidation to ${address} of ${eventId} - ${e}`
            )
        )
    );

    const msg = `Sent invalidation request for eventId ${eventId} to all clients - Paths: ${paths.join(
        ', '
    )}`;
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
    console.log('WHAT');
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
