const { createClient } = require('redis');
const { getUniqueRedisPrefixes } = require('./clients');

const clientOptions = {
    url: process.env.REDIS_URI_PAGECACHE,
    username: process.env.VALKEY_USERNAME_PAGECACHE,
    password: process.env.VALKEY_PASSWORD_PAGECACHE,
    socket: { keepAlive: 5000, connectTimeout: 10000 },
};

const validateRedisClientOptions = () =>
    !!(clientOptions.url && clientOptions.username && clientOptions.password);

class RedisCache {
    client;

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

    async init() {
        return this.client.connect().then(() => {
            console.log('Initialized Valkey client');
        });
    }

    async delete(paths) {
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

    async clear() {
        console.log('Clearing Valkey cache!');

        return this.client.flushDb().catch((e) => {
            console.error(`Error flushing database - ${e}`);
            return 'error';
        });
    }

    getKey(path, keyPrefix) {
        return `${keyPrefix}:${path === '/' ? '/index' : path}`;
    }
}

class RedisCacheDummy {
    init() {}
    delete() {}
    clear() {}
}

module.exports = {
    redisCache:
        process.env.NO_VALKEY === 'true'
            ? new RedisCacheDummy()
            : new RedisCache(),
    validateRedisClientOptions,
};
