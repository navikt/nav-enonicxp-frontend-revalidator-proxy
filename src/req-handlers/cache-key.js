const { v4: uuid } = require('uuid');

const currentCacheKey = {
    timestamp: 0,
    key: uuid(),
};

const updateCacheKeyMiddleware = (req, res, next) => {
    const { eventid } = req.headers;

    currentCacheKey.timestamp = Date.now();
    currentCacheKey.key = uuid();
    console.log(
        `Updated cache timestamp/key ${currentCacheKey.timestamp}/${currentCacheKey.key} for event id ${eventid}`
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
