const { logger } = require('../logger');

const authMiddleware = (req, res, next) => {
    if (req.headers.secret !== process.env.SERVICE_SECRET) {
        logger.warn({ url: req.url }, 'Auth failed');
        return res.status(401).send('Not authorized');
    }

    next();
};

module.exports = { authMiddleware };
