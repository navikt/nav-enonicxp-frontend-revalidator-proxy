const { createClient } = require('redis');

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

    async delete(key, prefix) {
        const prefixedKey = this.getPrefixedKey(key, prefix);
        console.log(`Deleting redis cache entry for ${prefixedKey}`);

        return this.client.del(prefixedKey).catch((e) => {
            console.error(`Error deleting value for key ${key} - ${e}`);
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

    getPrefixedKey(key, prefix) {
        return `${prefix}:${key}`;
    }
}

module.exports = { redisCache: new RedisCache() };
