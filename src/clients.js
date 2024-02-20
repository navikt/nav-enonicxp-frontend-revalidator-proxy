const { currentCacheKey } = require('./req-handlers/cache-key');

const clientPort = 3000;
const clientStaleTime = 10000;

const clientData = {};

const updateClient = (address, redisPrefixes) => {
    if (!clientData[address]) {
        console.log(`New client: ${address}`);
    }

    clientData[address] = {
        lastHeartbeat: Date.now(),
        redisPrefixes: redisPrefixes ? redisPrefixes.split(',') : [],
    };
};

const callClients = (path, eventid, options = {}) => {
    Object.entries(clientData).forEach(([address, data]) => {
        const { lastHeartbeat } = data;

        if (Date.now() - lastHeartbeat < clientStaleTime) {
            const url = `http://${address}:${clientPort}${path}`;
            fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    eventid,
                    secret: process.env.SERVICE_SECRET,
                    cache_key: currentCacheKey.key,
                    cache_ts: currentCacheKey.timestamp,
                },
            })
                .then((res) => {
                    if (!res.ok) {
                        throw new Error(`${res.status} - ${res.statusText}`);
                    }
                })
                .catch((e) =>
                    console.error(
                        `Request to ${url} failed for event ${eventid} - ${e}`
                    )
                );
        } else {
            console.log(`Removing stale client: ${address}`);
            delete clientData[address];
        }
    });
};

const getUniqueRedisPrefixes = () => {
    return Object.values(clientData)
        .flatMap((data) => data.redisPrefixes)
        .filter((prefix, index, array) => array.indexOf(prefix) === index);
};

module.exports = { callClients, updateClient, getUniqueRedisPrefixes };
