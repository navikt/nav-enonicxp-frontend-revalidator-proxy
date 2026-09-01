import type { NextFunction, Request, Response } from 'express';
import { getToken, validateAzureToken } from '@navikt/oasis';
import { logger } from '../logger';

// Dev3 is deployed under its own NAIS app name (see .nais/vars-dev3.yml).
// NAIS_APP_NAME is automatically injected by the NAIS platform at runtime.
// Todo 1. sept 2026: This is a temporary check until all of XP is in the cloud, when all requess have to be authenticated with a valid Entra ID bearer token.
const isDev3 = (): boolean =>
    process.env.NAIS_APP_NAME?.endsWith('-dev3') ?? false;

// Dev3 does not accept SERVICE_SECRET as sufficient auth - a valid Azure AD
// bearer token is required instead.
const authenticateWithBearerToken = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const token = getToken(req);

    if (!token) {
        logger.warn({
            message: `Auth failed on ${req.url} - missing bearer token`,
        });
        res.status(401).send('Not authorized');
        return;
    }

    const validation = await validateAzureToken(token);

    if (!validation.ok) {
        logger.warn({
            message: `Auth failed on ${req.url} - invalid bearer token`,
            errorType: validation.errorType,
            error: validation.error.message,
        });
        res.status(401).send('Not authorized');
        return;
    }

    next();
};

const authenticateWithServiceSecret = (
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

const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (isDev3()) {
        authenticateWithBearerToken(req, res, next).catch((error) => {
            logger.warn({
                message: `Auth failed on ${req.url} - unexpected error validating bearer token`,
                error: error instanceof Error ? error.message : String(error),
            });
            res.status(401).send('Not authorized');
        });
        return;
    }

    authenticateWithServiceSecret(req, res, next);
};

export { authMiddleware };
