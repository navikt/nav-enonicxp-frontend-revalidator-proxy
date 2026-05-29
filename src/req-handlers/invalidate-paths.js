const { callClients, clientData } = require('../clients');
const { redisCache } = require('../redis');
const { logger } = require('../logger');

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

    logger.debug({ eventid }, 'Event registered');
    eventStatus[eventid] = true;

    setTimeout(() => {
        logger.debug({ eventid }, 'Event expired');
        delete eventStatus[eventid];
    }, eventTimeout);

    return false;
};

const invalidatePathsHandler = async (req, res) => {
    const { eventid } = req.headers;
    const { paths } = req.body;

    if (!Array.isArray(paths)) {
        logger.warn({ eventid }, 'Bad request: paths not an array');
        return res
            .status(400)
            .send('Body field "paths" is required and must be an array');
    }

    const eventWasProcessed = updateEventStatus(eventid);

    if (eventWasProcessed) {
        logger.debug({ eventid }, 'Event already processed');
        return res.status(200).send('Event already processed');
    }

    await redisCache.delete(paths);

    callClients('/invalidate', eventid, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paths }),
    });

    logger.info(
        { eventid, paths, clientCount: Object.keys(clientData).length },
        'Invalidation sent'
    );
    res.status(200).send('Invalidation request sent to all clients');
};

module.exports = { invalidatePathsHandler };
