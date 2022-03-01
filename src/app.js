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

const jsonBodyParser = bodyParser.json();

// Revalidate requests from Enonic XP are sent independently by every node in the server cluster.
// Each request has an associated eventid, which corresponds to a publishing event. This id is identical across all
// servers per event.
//
// This object keeps track of which requests per event that have already been proxied to the frontend and prevents
// duplicate calls for the same event
const recentEvents = {
    eventTimeout: 10000,
    eventStatus: {},
    updateEventStatus: function (eventid) {
        if (!eventid) {
            return false;
        }

        if (this.eventStatus[eventid]) {
            return true;
        }

        console.log(`Adding entry for event ${eventid}`);
        this.eventStatus[eventid] = true;

        setTimeout(() => {
            console.log(`Event ${eventid} expired`);
            delete this.eventStatus[eventid];
        }, this.eventTimeout);

        return false;
    },
};

const callClients = (path, eventid, options) => {
    Object.entries(clientsAddressHeartbeat).forEach(
        ([address, lastHeartbeat]) => {
            if (Date.now() - lastHeartbeat < clientStaleTime) {
                const url = `http://${address}:${clientPort}${path}`;
                fetch(url, options)
                    .then((res) => {
                        if (!res.ok) {
                            throw new Error(
                                `${res.status} - ${res.statusText}`
                            );
                        }
                    })
                    .catch((e) =>
                        console.error(
                            `Request to ${url} failed for event ${eventid} - ${e}`
                        )
                    );
            } else {
                console.log(`Removing stale client: ${address}`);
                delete clientsAddressHeartbeat[address];
            }
        }
    );
};

app.post('/revalidator-proxy', jsonBodyParser, (req, res) => {
    const { secret, eventid } = req.headers;

    if (secret !== SERVICE_SECRET) {
        console.error(`Proxy request denied for event ${eventid} (401)`);
        return res.status(401).send('Not authorized');
    }

    const { paths } = req.body;

    if (!Array.isArray(paths)) {
        console.error(`Bad request for event ${eventid}`);
        return res
            .status(400)
            .send('Body field "paths" is required and must be an array');
    }

    const eventWasProcessed = recentEvents.updateEventStatus(eventid);

    if (eventWasProcessed) {
        const msg = `Event ${eventid} has already been processsed`;
        console.log(msg);
        return res.status(200).send(msg);
    }

    callClients('/invalidate', eventid, {
        method: 'POST',
        headers: {
            secret: SERVICE_SECRET,
            eventid,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paths }),
    });

    const msg = `Sent invalidation request for event ${eventid} to all clients - Paths: ${paths.join(
        ', '
    )}`;
    console.log(msg);

    res.status(200).send(msg);
});

app.get('/revalidator-proxy/wipe-all', (req, res) => {
    const { secret, eventid } = req.headers;

    if (secret !== SERVICE_SECRET) {
        console.error(
            `Proxy request denied for wipe-all event id ${eventid} (401)`
        );
        return res.status(401).send('Not authorized');
    }

    callClients('/invalidate/wipe-all', eventid, {
        method: 'GET',
        headers: {
            secret: SERVICE_SECRET,
            eventid,
        },
    });

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
