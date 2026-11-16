import { Gauge } from '@prometheus-io/client';
import { currentCacheKey } from './req-handlers/cache-key';
import { logger } from './logger';
import {
    type FrontendPath,
    metricsPrefix,
    observeFrontendRequest,
    registry,
} from './metrics';

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

const isActive = ({ lastHeartbeat }: ClientData): boolean =>
    Date.now() - lastHeartbeat < clientStaleTime;

// Counted when scraped, as stale clients are only removed from clientData on the next invalidation
new Gauge({
    name: `${metricsPrefix}frontend_clients`,
    help: 'Frontend pods with a heartbeat in the last 10 seconds, which invalidations are passed on to',
    registers: [registry],
    collect() {
        this.set(Object.values(clientData).filter(isActive).length);
    },
});

const updateClient = (address: string, redisPrefixes?: string): void => {
    if (!clientData[address]) {
        logger.info({ message: `New client: ${address}` });
    }

    clientData[address] = {
        lastHeartbeat: Date.now(),
        redisPrefixes: redisPrefixes ? redisPrefixes.split(',') : [],
    };
};

const callClients = (
    path: FrontendPath,
    eventid?: string,
    options: FetchOptions = {}
): void => {
    Object.entries(clientData).forEach(([address, data]) => {
        if (isActive(data)) {
            const url = `http://${address}:${clientPort}${path}`;
            observeFrontendRequest(path, () =>
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
            )
                .then((res) => {
                    if (!res.ok) {
                        throw new Error(`${res.status} - ${res.statusText}`);
                    }
                })
                .catch((e) =>
                    logger.error({
                        message: `Request to ${url} failed for event ${eventid} - ${e}`,
                    })
                );
        } else {
            logger.info({ message: `Removing stale client: ${address}` });
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
