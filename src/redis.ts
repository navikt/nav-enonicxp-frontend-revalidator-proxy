import { createClient } from 'redis';
import { getUniqueRedisPrefixes } from './clients';

const clientOptions = {
    url: process.env.REDIS_URI_PAGECACHE,
    username: process.env.VALKEY_USERNAME_PAGECACHE,
    password: process.env.VALKEY_PASSWORD_PAGECACHE,
    socket: {
        keepAlive: true,
        keepAliveInitialDelay: 5000,
        connectTimeout: 10000,
    },
};

const validateRedisClientOptions = (): boolean =>
    !!(clientOptions.url && clientOptions.username && clientOptions.password);

class RedisCache {
    private client;

    constructor() {
        this.client = createClient(clientOptions)
            .on('connect', () => {
                console.log('Valkey client connected');
            })
            .on('ready', () => {
                console.log('Valkey client ready');
            })
            .on('end', () => {
                console.log('Valkey client connection closed');
            })
            .on('reconnecting', () => {
                console.log('Valkey client reconnecting');
            })
            .on('error', (err) => {
                console.error(`Valkey client error: ${err}`);
            });

        console.log(`Created Valkey client with url ${clientOptions.url}`);
    }

    async init(): Promise<void> {
        return this.client.connect().then(() => {
            console.log('Initialized Valkey client');
        });
    }

    async delete(paths: string[]): Promise<number | void> {
        const prefixes = getUniqueRedisPrefixes();

        if (paths.length === 0 || prefixes.length === 0) {
            return;
        }

        const keysToDelete = paths.flatMap((path) =>
            prefixes.map((prefix) => this.getKey(path, prefix))
        );

        const keysToDeleteStr = keysToDelete.join(', ');

        console.log(`Deleting values for keys ${keysToDeleteStr}`);

        return this.client.del(keysToDelete).catch((e) => {
            console.error(
                `Error deleting values from Valkey for keys ${keysToDeleteStr} - ${e}`
            );
            return 0;
        });
    }

    async clear(): Promise<string> {
        console.log('Clearing Valkey cache!');

        return this.client.flushDb().catch((e) => {
            console.error(`Error flushing database - ${e}`);
            return 'error';
        });
    }

    private getKey(path: string, keyPrefix: string): string {
        return `${keyPrefix}:${path === '/' ? '/index' : path}`;
    }
}

class RedisCacheDummy {
    init(): Promise<void> {
        return Promise.resolve();
    }

    delete(_paths: string[]): Promise<void> {
        return Promise.resolve();
    }

    clear(): Promise<'ok'> {
        return Promise.resolve('ok');
    }
}

const redisCache: RedisCache | RedisCacheDummy =
    process.env.NO_VALKEY === 'true' ? new RedisCacheDummy() : new RedisCache();

export { redisCache, validateRedisClientOptions };
