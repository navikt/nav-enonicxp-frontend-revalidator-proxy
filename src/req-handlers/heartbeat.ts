import type { Request, Response } from 'express';
import { updateClient } from '../clients';

const heartbeatHandler = (req: Request, res: Response): void => {
    const rawAddress = Array.isArray(req.query.address)
        ? req.query.address[0]
        : req.query.address;
    const rawRedisPrefixes = Array.isArray(req.query.redisPrefixes)
        ? req.query.redisPrefixes[0]
        : req.query.redisPrefixes;

    if (typeof rawAddress !== 'string' || rawAddress.length === 0) {
        res.status(400).send('No address provided');
        return;
    }

    const redisPrefixes =
        typeof rawRedisPrefixes === 'string' ? rawRedisPrefixes : undefined;

    updateClient(rawAddress, redisPrefixes);

    res.status(200).send(`${rawAddress} liveness updated`);
};

export { heartbeatHandler };
