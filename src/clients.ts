import { currentCacheKey } from './req-handlers/cache-key';

const clientPort = 3000;
const clientStaleTime = 10000;

type ClientData = {
    lastHeartbeat: number;
    redisPrefixes: string[];
};

type FetchOptions = Omit<RequestInit, 'headers'> & {
    headers?: Record<string, string>;
};

const clientData: Record<string, ClientData> = {};

const updateClient = (address: string, redisPrefixes?: string): void => {
    if (!clientData[address]) {
        console.log(`New client: ${address}`);
    }

    clientData[address] = {
        lastHeartbeat: Date.now(),
        redisPrefixes: redisPrefixes ? redisPrefixes.split(',') : [],
    };
};

const callClients = (
    path: string,
    eventid?: string,
    options: FetchOptions = {}
): void => {
    Object.entries(clientData).forEach(([address, data]) => {
        const { lastHeartbeat } = data;

        if (Date.now() - lastHeartbeat < clientStaleTime) {
            const url = `http://${address}:${clientPort}${path}`;
            fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    eventid: eventid ?? '',
                    secret: process.env.SERVICE_SECRET ?? '',
                    cache_key: currentCacheKey.key,
                    cache_ts: String(currentCacheKey.timestamp),
                },
            })
                .then((res) => {
                    if (!res.ok) {
                        throw new Error(`${res.status} - ${res.statusText}`);
                    }
                })
                .catch((e: unknown) =>
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

const getUniqueRedisPrefixes = (): string[] => {
    return Object.values(clientData)
        .flatMap((data) => data.redisPrefixes)
        .filter((prefix, index, array) => array.indexOf(prefix) === index);
};

export { callClients, updateClient, getUniqueRedisPrefixes };
