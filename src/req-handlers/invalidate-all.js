const { callClients } = require('../clients');
const { redisCache } = require('../redis');
const { logger } = require('../logger');

const invalidateAllHandler = async (req, res) => {
    const { eventid } = req.headers;

    await redisCache.clear();

    callClients('/invalidate/wipe-all', eventid);

    logger.info({ eventid }, 'Wipe-all sent to all clients');
    res.status(200).send('Wipe-all request sent to all clients');
};

module.exports = { invalidateAllHandler };
