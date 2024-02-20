const { createClient } = require('redis');
const { getUniqueRedisPrefixes } = require('./clients');

const clientOptions = {
    url: process.env.REDIS_URI_PAGECACHE,
    username: process.env.REDIS_USERNAME_PAGECACHE,
    password: process.env.REDIS_PASSWORD_PAGECACHE,
    socket: { keepAlive: 5000, connectTimeout: 10000 },
};

class RedisCache {
    client;

    constructor() {
        this.client = createClient(clientOptions)
            .on('connect', () => {
                console.log('Redis client connected');
            })
            .on('ready', () => {
                console.log('Redis client ready');
            })
            .on('end', () => {
                console.log('Redis client connection closed');
            })
            .on('reconnecting', () => {
                console.log('Redis client reconnecting');
            })
            .on('error', (err) => {
                console.error(`Redis client error: ${err}`);
            });

        console.log(`Created redis client with url ${clientOptions.url}`);
    }

    async init() {
        return this.client.connect().then(() => {
            console.log('Initialized redis client');
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
                `Error deleting values from Redis for keys ${keysToDeleteStr} - ${e}`
            );
            return 0;
        });
    }

    async clear() {
        console.log('Clearing redis cache!');

        return this.client.flushDb().catch((e) => {
            console.error(`Error flushing database - ${e}`);
            return 'error';
        });
    }

    getKey(path, keyPrefix) {
        return `${keyPrefix}:${path === '/' ? '/index' : path}`;
    }
}

module.exports = { redisCache: new RedisCache() };
