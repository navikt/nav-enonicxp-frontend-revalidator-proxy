const { updateClient } = require('../clients');

const heartbeatHandler = (req, res) => {
    const { address, redisPrefixes } = req.query;

    if (!address) {
        return res.status(400).send('No address provided');
    }

    updateClient(address, redisPrefixes);

    res.status(200).send(`${address} liveness updated`);
};

module.exports = { heartbeatHandler };
