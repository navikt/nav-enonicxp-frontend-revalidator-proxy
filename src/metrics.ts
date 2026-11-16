import type {
    NextFunction,
    Request as ExpressRequest,
    Response as ExpressResponse,
} from 'express';
import {
    collectDefaultMetrics,
    Counter,
    Histogram,
    Registry,
} from '@prometheus-io/client';

// Scraped by nais at /internal/metrics (.nais/config.yml), alerts in .nais/alerts.yml.
// Gauges that read a module's own state live in that module: frontend_clients in clients.ts
// and valkey_ready in redis.ts.

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const metricsPrefix = 'revalidator_proxy_';

export const metricsHandler = async (
    _req: ExpressRequest,
    res: ExpressResponse
): Promise<void> => {
    res.set('Content-Type', registry.contentType).send(
        await registry.metrics()
    );
};

/** ok: 2xx. unauthorized: wrong or missing secret. invalid: other 4xx. error: 5xx. aborted: the caller hung up before we answered */
type ResponseOutcome = 'ok' | 'unauthorized' | 'invalid' | 'error' | 'aborted';

const responseOutcome = (res: ExpressResponse): ResponseOutcome => {
    if (!res.writableFinished) {
        return 'aborted';
    }
    if (res.statusCode === 401) {
        return 'unauthorized';
    }
    if (res.statusCode >= 500) {
        return 'error';
    }
    if (res.statusCode >= 400) {
        return 'invalid';
    }
    return 'ok';
};

// Invalidation requests from XP

const invalidationTypes = ['paths', 'wipe_all'] as const;
type InvalidationType = (typeof invalidationTypes)[number];

/** sent: handled and passed on (whether Valkey and the frontend pods then succeeded is in valkey_commands_total and frontend_requests_total). duplicate: an event id already handled in the last 10 seconds. The rest as for ResponseOutcome */
const invalidationOutcomes = [
    'sent',
    'duplicate',
    'unauthorized',
    'invalid',
    'error',
    'aborted',
] as const;

const invalidationRequests = new Counter({
    name: `${metricsPrefix}invalidation_requests_total`,
    help: 'Invalidation requests from XP by type (paths, wipe_all) and outcome (sent, duplicate, unauthorized, invalid, error, aborted)',
    labelNames: ['type', 'outcome'] as const,
    registers: [registry],
});

const invalidationDuration = new Histogram({
    name: `${metricsPrefix}invalidation_request_duration_seconds`,
    help: 'Time to answer an invalidation request from XP, including the Valkey command (not the calls to the frontend pods, which are not awaited)',
    labelNames: ['type'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry],
});

const duplicates = new WeakSet<ExpressResponse>();

/** Handlers call this when they skip an event they have already handled */
export const markDuplicate = (res: ExpressResponse): void => {
    duplicates.add(res);
};

/** Goes first on an invalidation route, so requests the auth and body parser reject are counted too */
export const countInvalidation =
    (type: InvalidationType) =>
    (_req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
        const stopTimer = invalidationDuration.startTimer({ type });
        // close fires both when the response is sent and when the caller hangs up
        res.on('close', () => {
            stopTimer();
            const outcome = responseOutcome(res);
            invalidationRequests.inc({
                type,
                outcome:
                    outcome !== 'ok'
                        ? outcome
                        : duplicates.has(res)
                          ? 'duplicate'
                          : 'sent',
            });
        });
        next();
    };

// Heartbeats from the frontend pods, which register them for invalidations

const heartbeatOutcomes = [
    'ok',
    'unauthorized',
    'invalid',
    'error',
    'aborted',
] as const;

const heartbeats = new Counter({
    name: `${metricsPrefix}heartbeats_total`,
    help: 'Heartbeats from frontend pods by outcome (ok, unauthorized, invalid, error, aborted)',
    labelNames: ['outcome'] as const,
    registers: [registry],
});

export const countHeartbeat = (
    _req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction
): void => {
    res.on('close', () => {
        heartbeats.inc({ outcome: responseOutcome(res) });
    });
    next();
};

// Invalidations passed on to the frontend pods

export const frontendPaths = ['/invalidate', '/invalidate/wipe-all'] as const;
export type FrontendPath = (typeof frontendPaths)[number];

const frontendStatuses = ['2xx', '4xx', '5xx', 'network_error'];

const frontendRequests = new Counter({
    name: `${metricsPrefix}frontend_requests_total`,
    help: 'Invalidations passed on to frontend pods, by path and response status class (2xx, 4xx, 5xx, …) or network_error',
    labelNames: ['path', 'status'] as const,
    registers: [registry],
});

/** Runs a request to a frontend pod and records its status class */
export const observeFrontendRequest = async (
    path: FrontendPath,
    request: () => Promise<Response>
): Promise<Response> => {
    try {
        const response = await request();
        frontendRequests.inc({
            path,
            status: `${Math.floor(response.status / 100)}xx`,
        });
        return response;
    } catch (e) {
        frontendRequests.inc({ path, status: 'network_error' });
        throw e;
    }
};

// Valkey

const valkeyCommandNames = ['del', 'flushdb'] as const;
type ValkeyCommand = (typeof valkeyCommandNames)[number];

const valkeyCommands = new Counter({
    name: `${metricsPrefix}valkey_commands_total`,
    help: 'Valkey commands by command (del, flushdb) and outcome (ok, error)',
    labelNames: ['command', 'outcome'] as const,
    registers: [registry],
});

/** Runs a Valkey command and records its outcome */
export const observeValkeyCommand = async <T>(
    command: ValkeyCommand,
    run: () => Promise<T>
): Promise<T> => {
    try {
        const result = await run();
        valkeyCommands.inc({ command, outcome: 'ok' });
        return result;
    } catch (e) {
        valkeyCommands.inc({ command, outcome: 'error' });
        throw e;
    }
};

// Every series exists from startup, so rates and alerts work before the first event
for (const type of invalidationTypes) {
    for (const outcome of invalidationOutcomes) {
        invalidationRequests.inc({ type, outcome }, 0);
    }
}
for (const outcome of heartbeatOutcomes) {
    heartbeats.inc({ outcome }, 0);
}
for (const path of frontendPaths) {
    for (const status of frontendStatuses) {
        frontendRequests.inc({ path, status }, 0);
    }
}
for (const command of valkeyCommandNames) {
    for (const outcome of ['ok', 'error']) {
        valkeyCommands.inc({ command, outcome }, 0);
    }
}
