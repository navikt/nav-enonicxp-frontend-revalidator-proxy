import type { NextFunction, Request, Response } from 'express';

const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const secretHeader = Array.isArray(req.headers.secret)
        ? req.headers.secret[0]
        : req.headers.secret;

    if (secretHeader !== process.env.SERVICE_SECRET) {
        console.warn(`Auth failed on ${req.url}`);
        res.status(401).send('Not authorized');
        return;
    }

    next();
};

export { authMiddleware };
