const { callClients } = require('../clients');
const { redisCache } = require('../redis');

const invalidateAllHandler = async (req, res) => {
    const { eventid } = req.headers;

    await redisCache.clear();

    callClients('/invalidate/wipe-all', eventid);

    const msg = `Sent wipe-all request to all clients for event ${eventid}`;
    console.log(msg);

    res.status(200).send(msg);
};

module.exports = { invalidateAllHandler };
