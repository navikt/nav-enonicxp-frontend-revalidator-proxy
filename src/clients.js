const fetch = require('node-fetch');
const { currentCacheKey } = require('./req-handlers/cache-key');

const clientPort = 3000;
const clientStaleTime = 10000;

const clientAddressToHeartbeatMap = {};

const updateClient = (address) => {
    if (!clientAddressToHeartbeatMap[address]) {
        console.log(`New client: ${address}`);
    }

    clientAddressToHeartbeatMap[address] = Date.now();
};

const callClients = (path, eventid, options = {}) => {
    Object.entries(clientAddressToHeartbeatMap).forEach(
        ([address, lastHeartbeat]) => {
            if (Date.now() - lastHeartbeat < clientStaleTime) {
                const url = `http://${address}:${clientPort}${path}`;
                fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        secret: process.env.SERVICE_SECRET,
                        cache_key: currentCacheKey.key,
                        cache_ts: currentCacheKey.timestamp,
                    },
                })
                    .then((res) => {
                        if (!res.ok) {
                            throw new Error(
                                `${res.status} - ${res.statusText}`
                            );
                        }
                    })
                    .catch((e) =>
                        console.error(
                            `Request to ${url} failed for event ${eventid} - ${e}`
                        )
                    );
            } else {
                console.log(`Removing stale client: ${address}`);
                delete clientAddressToHeartbeatMap[address];
            }
        }
    );
};

module.exports = { callClients, updateClient };
