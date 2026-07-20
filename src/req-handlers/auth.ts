import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger';

const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const secretHeader = Array.isArray(req.headers.secret)
        ? req.headers.secret[0]
        : req.headers.secret;

    if (secretHeader !== process.env.SERVICE_SECRET) {
        logger.warn({ message: `Auth failed on ${req.url}` });
        res.status(401).send('Not authorized');
        return;
    }

    next();
};

export { authMiddleware };
