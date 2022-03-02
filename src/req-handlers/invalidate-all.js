const { legacyWipeAll } = require('../legacy');
const { callClients } = require('../clients');

const invalidateAllHandler = (req, res) => {
    const { eventid } = req.headers;

    if (!eventid) {
        return legacyWipeAll(req, res);
    }

    callClients('/invalidate/wipe-all', eventid, {
        headers: {
            eventid,
        },
    });

    const msg = 'Sent wipe-all request to all clients';
    console.log(msg);

    res.status(200).send(msg);
};

module.exports = { invalidateAllHandler };
