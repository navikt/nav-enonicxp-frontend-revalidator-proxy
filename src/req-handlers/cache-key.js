const { v4: uuid } = require('uuid');
const { logger } = require('../logger');

const currentCacheKey = {
    timestamp: 0,
    key: uuid(),
};

const updateCacheKeyMiddleware = (req, res, next) => {
    const { eventid } = req.headers;

    currentCacheKey.timestamp = Date.now();
    currentCacheKey.key = uuid();
    logger.info(
        { cacheKey: currentCacheKey.key, timestamp: currentCacheKey.timestamp, eventid },
        'Cache key updated'
    );

    return next();
};

const getCacheKeyHandler = (req, res) => {
    res.status(200).send(currentCacheKey);
};

module.exports = {
    getCacheKeyHandler,
    updateCacheKeyMiddleware,
    currentCacheKey,
};
