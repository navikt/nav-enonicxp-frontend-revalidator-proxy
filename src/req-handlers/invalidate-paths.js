const { callClients } = require('../clients');

// Revalidate requests from Enonic XP are sent independently by every node in the server cluster.
// Each request has an associated eventid, which corresponds to a publishing event. This id is identical across all
// servers per event.
//
// This object keeps track of which requests per event that have already been proxied to the frontend and prevents
// duplicate calls for the same event
const eventStatus = {};

const eventTimeout = 10000;

const updateEventStatus = (eventid) => {
    if (!eventid) {
        return false;
    }

    if (eventStatus[eventid]) {
        return true;
    }

    console.log(`Adding entry for event ${eventid}`);
    eventStatus[eventid] = true;

    setTimeout(() => {
        console.log(`Event ${eventid} expired`);
        delete eventStatus[eventid];
    }, eventTimeout);

    return false;
};

const invalidatePathsHandler = (req, res) => {
    const { eventid } = req.headers;
    const { paths } = req.body;

    if (!Array.isArray(paths)) {
        console.error(`Bad request for event ${eventid}`);
        return res
            .status(400)
            .send('Body field "paths" is required and must be an array');
    }

    const eventWasProcessed = updateEventStatus(eventid);

    if (eventWasProcessed) {
        const msg = `Event ${eventid} has already been processsed`;
        console.log(msg);
        return res.status(200).send(msg);
    }

    callClients('/invalidate', eventid, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paths }),
    });

    const msg = `Sent invalidation request for event ${eventid} to all clients - Paths: ${paths.join(
        ', '
    )}`;
    console.log(msg);

    res.status(200).send(msg);
};

module.exports = { invalidatePathsHandler };
