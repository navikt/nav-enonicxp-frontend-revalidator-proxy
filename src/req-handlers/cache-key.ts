import type { NextFunction, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { logger } from '../app';

type CacheKey = {
    timestamp: number;
    key: string;
};

const currentCacheKey: CacheKey = {
    timestamp: 0,
    key: uuid(),
};

const updateCacheKeyMiddleware = (
    req: Request,
    _res: Response,
    next: NextFunction
): void => {
    const eventid = Array.isArray(req.headers.eventid)
        ? req.headers.eventid[0]
        : req.headers.eventid;

    currentCacheKey.timestamp = Date.now();
    currentCacheKey.key = uuid();
    logger.info(
        `Updated cache timestamp/key ${currentCacheKey.timestamp}/${currentCacheKey.key} for event id ${eventid}`
    );

    next();
};

const getCacheKeyHandler = (_req: Request, res: Response): void => {
    res.status(200).send(currentCacheKey);
};

export { getCacheKeyHandler, updateCacheKeyMiddleware, currentCacheKey };
