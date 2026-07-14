import type { Request, Response } from 'express';
import { callClients } from '../clients';
import { redisCache } from '../redis';
import { logger } from '../logger';

const invalidateAllHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const eventid = Array.isArray(req.headers.eventid)
        ? req.headers.eventid[0]
        : req.headers.eventid;
    const safeEventid = eventid ?? '';

    await redisCache.clear();

    callClients('/invalidate/wipe-all', safeEventid);

    const msg = `Sent wipe-all request to all clients for event ${safeEventid}`;
    logger.info(msg);

    res.status(200).send(msg);
};

export { invalidateAllHandler };
