const { createClient } = require('redis');
const { getUniqueRedisPrefixes } = require('./clients');
const { logger } = require('./logger');

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
                logger.info('Valkey client connected');
            })
            .on('ready', () => {
                logger.info('Valkey client ready');
            })
            .on('end', () => {
                logger.warn('Valkey client connection closed');
            })
            .on('reconnecting', () => {
                logger.warn('Valkey client reconnecting');
            })
            .on('error', (err) => {
                logger.error({ err }, 'Valkey client error');
            });

        logger.info({ url: clientOptions.url }, 'Created Valkey client');
    }

    async init() {
        return this.client.connect().then(() => {
            logger.info('Initialized Valkey client');
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

        logger.info({ keys: keysToDelete }, 'Deleting Valkey keys');

        return this.client.del(keysToDelete).catch((e) => {
            logger.error({ keys: keysToDelete, err: e }, 'Valkey delete failed');
            return 0;
        });
    }

    async clear() {
        logger.warn('Clearing entire Valkey cache');

        return this.client.flushDb().catch((e) => {
            logger.error({ err: e }, 'Valkey flush failed');
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
