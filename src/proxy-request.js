const fetch = require('node-fetch');

const clientPort = 3000;
const clientStaleTime = 10000;

const callClients = (clients, path, eventid, options) => {
    Object.entries(clients).forEach(([address, lastHeartbeat]) => {
        if (Date.now() - lastHeartbeat < clientStaleTime) {
            const url = `http://${address}:${clientPort}${path}`;
            fetch(url, options)
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
            delete clients[address];
        }
    });
};

module.exports = { callClients };
