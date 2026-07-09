import type { Request, Response } from 'express';
import { callClients } from '../clients';
import { redisCache } from '../redis';
import { logger } from '../app';

type InvalidatePathsBody = {
    paths?: unknown;
};

const eventStatus: Record<string, boolean> = {};

const eventTimeout = 10000;

const updateEventStatus = (eventid?: string): boolean => {
    if (!eventid) {
        return false;
    }

    if (eventStatus[eventid]) {
        return true;
    }

    logger.info(`Adding entry for event ${eventid}`);
    eventStatus[eventid] = true;

    setTimeout(() => {
        logger.info(`Event ${eventid} expired`);
        delete eventStatus[eventid];
    }, eventTimeout);

    return false;
};

const invalidatePathsHandler = async (
    req: Request<unknown, unknown, InvalidatePathsBody>,
    res: Response
): Promise<void> => {
    const eventid = Array.isArray(req.headers.eventid)
        ? req.headers.eventid[0]
        : req.headers.eventid;
    const safeEventid = eventid ?? '';
    const { paths } = req.body;

    if (!Array.isArray(paths)) {
        logger.error(`Bad request for event ${safeEventid}`);
        res.status(400).send(
            'Body field "paths" is required and must be an array'
        );
        return;
    }

    const typedPaths = paths as string[];
    const eventWasProcessed = updateEventStatus(safeEventid);

    if (eventWasProcessed) {
        const msg = `Event ${safeEventid} has already been processsed`;
        logger.info(msg);
        res.status(200).send(msg);
        return;
    }

    await redisCache.delete(typedPaths);

    callClients('/invalidate', safeEventid, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paths: typedPaths }),
    });

    const msg = `Sent invalidation request for event ${safeEventid} to all clients - Paths: ${typedPaths.join(
        ', '
    )}`;
    logger.info(msg);

    res.status(200).send(msg);
};

export { invalidatePathsHandler };
