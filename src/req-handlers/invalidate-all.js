const { callClients } = require('../clients');

const invalidateAllHandler = (req, res) => {
    const { eventid, cachekey } = req.headers;

    callClients('/invalidate/wipe-all', eventid, {
        headers: {
            eventid,
            cachekey,
        },
    });

    const msg = 'Sent wipe-all request to all clients';
    console.log(msg);

    res.status(200).send(msg);
};

module.exports = { invalidateAllHandler };
