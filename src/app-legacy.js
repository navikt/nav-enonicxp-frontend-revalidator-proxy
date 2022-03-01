const { callClients } = require('./proxy-request');

const { SERVICE_SECRET } = process.env;

const recentEvents = {
    eventTimeout: 10000,
    eventStatus: {},
    updateEventStatus: function (path, eventId) {
        if (!eventId) {
            return false;
        }

        if (!this.eventStatus[eventId]) {
            console.log(`Adding entry for event ${eventId}`);
            this.eventStatus[eventId] = {
                [path]: true,
            };
            setTimeout(() => {
                console.log(
                    `Removing entry for event ${eventId} - ${
                        Object.keys(this.eventStatus[eventId]).length
                    } paths were invalidated`
                );
                delete this.eventStatus[eventId];
            }, this.eventTimeout);

            return false;
        } else if (!this.eventStatus[eventId][path]) {
            this.eventStatus[eventId][path] = true;
            return false;
        }

        return true;
    },
};

const legacyHandler = (req, res, clients) => {
    const { secret } = req.headers;
    const { path, eventId } = req.query;

    if (secret !== SERVICE_SECRET) {
        console.error(`Proxy request denied for ${path} (401)`);
        return res.status(401).send('Not authorized');
    }

    if (!path) {
        return res.status(400).send('Path-parameter must be provided');
    }

    const encodedPath = encodeURI(path);

    const eventWasProcessedForPath = recentEvents.updateEventStatus(
        path,
        eventId
    );

    if (eventWasProcessedForPath) {
        const msg = `${path} has already been processsed for event ${eventId}`;
        console.log(msg);
        return res.status(200).send(msg);
    }

    callClients(clients, `${encodedPath}?invalidate=true`, eventId, {
        headers: {
            secret: SERVICE_SECRET,
        },
    });

    const msg = `Sent invalidation request for ${encodedPath} with eventId ${eventId} to all clients`;
    console.log(msg);
    res.status(200).send(msg);
};

module.exports = { legacyHandler };
