// Runs the built app (dist/app.js) the way XP and the frontend pods use it, and reads what /internal/metrics says.
// One app for the whole file: the counts build on each other, in test order.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

const SECRET = 'test-secret';
// Doesn't resolve, so every invalidation passed on to this pod fails as network_error
const POD = 'frontend-pod.invalid';
const PREFIX = 'revalidator_proxy_';

let app: ChildProcess;
let output = '';
let origin: string;

const freePort = () =>
    new Promise<number>((resolve, reject) => {
        const server = createServer().listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() =>
                typeof address === 'object' && address
                    ? resolve(address.port)
                    : reject(new Error('No port'))
            );
        });
    });

before(async () => {
    const port = Number(process.env.TEST_PORT) || (await freePort());
    origin = `http://127.0.0.1:${port}`;
    app = spawn(process.execPath, ['dist/app.js'], {
        env: {
            PATH: process.env.PATH,
            APP_PORT: String(port),
            SERVICE_SECRET: SECRET,
            NO_VALKEY: 'true',
        },
    });
    app.stdout?.on('data', (data) => (output += data));
    app.stderr?.on('data', (data) => (output += data));

    let lastError: unknown;
    for (let attempt = 0; attempt < 50; attempt++) {
        const ready = await fetch(`${origin}/internal/isReady`).then(
            (res) => res.ok,
            (e) => {
                lastError = e;
                return false;
            }
        );
        if (ready) {
            return;
        }
        await sleep(100);
    }
    throw new Error(
        `The app didn't answer on ${origin}: ${lastError}\nIts output:\n${output}`,
        { cause: lastError }
    );
});

after(() => {
    app?.kill();
});

const heartbeat = (headers: Record<string, string> = { secret: SECRET }) =>
    fetch(`${origin}/liveness?address=${POD}&redisPrefixes=a,b`, { headers });

const invalidate = (body: string, headers: Record<string, string> = {}) =>
    fetch(`${origin}/revalidator-proxy`, {
        method: 'POST',
        headers: {
            secret: SECRET,
            'content-type': 'application/json',
            ...headers,
        },
        body,
    });

/** The app's own samples, named without the prefix, e.g. { 'heartbeats_total{outcome="ok"}': 1 } */
const scrape = async () => {
    const text = await (await fetch(`${origin}/internal/metrics`)).text();
    return Object.fromEntries(
        text
            .split('\n')
            .filter((line) => line.startsWith(PREFIX))
            .map((line) => {
                const space = line.lastIndexOf(' ');
                return [
                    line.slice(PREFIX.length, space),
                    Number(line.slice(space + 1)),
                ];
            })
    );
};

/** The samples of one metric, e.g. samples('heartbeats_total') */
const samples = async (metric: string) =>
    Object.fromEntries(
        Object.entries(await scrape()).filter(
            ([name]) => name === metric || name.startsWith(`${metric}{`)
        )
    );

const zero = (metric: string, labelSets: string[]) =>
    Object.fromEntries(labelSets.map((labels) => [`${metric}{${labels}}`, 0]));

const invalidationLabels = ['paths', 'wipe_all'].flatMap((type) =>
    ['sent', 'duplicate', 'unauthorized', 'invalid', 'error', 'aborted'].map(
        (outcome) => `type="${type}",outcome="${outcome}"`
    )
);
const heartbeatLabels = [
    'ok',
    'unauthorized',
    'invalid',
    'error',
    'aborted',
].map((outcome) => `outcome="${outcome}"`);
const frontendLabels = ['/invalidate', '/invalidate/wipe-all'].flatMap((path) =>
    ['2xx', '4xx', '5xx', 'network_error'].map(
        (status) => `path="${path}",status="${status}"`
    )
);

test('serves the app metrics and the Node.js defaults as Prometheus text', async () => {
    const res = await fetch(`${origin}/internal/metrics`);
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.match(
        res.headers.get('content-type') ?? '',
        /^text\/plain;.*\bversion=0\.0\.4\b/
    );
    assert.deepEqual(
        text
            .split('\n')
            .filter((line) => line.startsWith(`# TYPE ${PREFIX}`))
            .sort(),
        [
            // No valkey_ready, as the test runs without Valkey
            '# TYPE revalidator_proxy_frontend_clients gauge',
            '# TYPE revalidator_proxy_frontend_requests_total counter',
            '# TYPE revalidator_proxy_heartbeats_total counter',
            '# TYPE revalidator_proxy_invalidation_request_duration_seconds histogram',
            '# TYPE revalidator_proxy_invalidation_requests_total counter',
            '# TYPE revalidator_proxy_valkey_commands_total counter',
        ]
    );
    assert.match(text, /^process_cpu_seconds_total /m);
    assert.match(text, /^nodejs_eventloop_lag_seconds /m);
});

test('every series the alerts use starts at 0', async () => {
    assert.deepEqual(await samples('frontend_clients'), {
        frontend_clients: 0,
    });
    assert.deepEqual(
        await samples('invalidation_requests_total'),
        zero('invalidation_requests_total', invalidationLabels)
    );
    assert.deepEqual(
        await samples('heartbeats_total'),
        zero('heartbeats_total', heartbeatLabels)
    );
    assert.deepEqual(
        await samples('frontend_requests_total'),
        zero('frontend_requests_total', frontendLabels)
    );
    assert.deepEqual(
        await samples('valkey_commands_total'),
        zero('valkey_commands_total', [
            'command="del",outcome="ok"',
            'command="del",outcome="error"',
            'command="flushdb",outcome="ok"',
            'command="flushdb",outcome="error"',
        ])
    );
});

test('counts heartbeats by outcome, and the frontend pods they register', async () => {
    assert.equal((await heartbeat({})).status, 401);
    assert.equal(
        (await fetch(`${origin}/liveness`, { headers: { secret: SECRET } }))
            .status,
        400
    );
    assert.equal((await heartbeat()).status, 200);

    assert.deepEqual(await samples('heartbeats_total'), {
        ...zero('heartbeats_total', heartbeatLabels),
        'heartbeats_total{outcome="ok"}': 1,
        'heartbeats_total{outcome="unauthorized"}': 1,
        'heartbeats_total{outcome="invalid"}': 1,
    });
    assert.deepEqual(await samples('frontend_clients'), {
        frontend_clients: 1,
    });
});

test('counts invalidations by type and outcome, and the calls passed on to the frontend pods', async () => {
    // The pod stays registered for 10 seconds after its last heartbeat
    await heartbeat();

    const paths = JSON.stringify({ paths: ['/a', '/b'] });
    const statuses = [
        (await invalidate(paths, { eventid: 'event-1' })).status,
        (await invalidate(paths, { eventid: 'event-1' })).status,
        (await invalidate(JSON.stringify({}), { eventid: 'event-2' })).status,
        (await invalidate('{not json', { eventid: 'event-3' })).status,
        // Not JSON, so the body isn't parsed
        (await invalidate(paths, { 'content-type': 'text/plain' })).status,
        (await invalidate(paths, { eventid: 'event-4', secret: 'wrong' }))
            .status,
        (
            await fetch(`${origin}/revalidator-proxy/wipe-all`, {
                headers: { secret: SECRET, eventid: 'event-5' },
            })
        ).status,
    ];
    assert.deepEqual(statuses, [200, 200, 400, 400, 400, 401, 200]);

    assert.deepEqual(await samples('invalidation_requests_total'), {
        ...zero('invalidation_requests_total', invalidationLabels),
        'invalidation_requests_total{type="paths",outcome="sent"}': 1,
        'invalidation_requests_total{type="paths",outcome="duplicate"}': 1,
        'invalidation_requests_total{type="paths",outcome="invalid"}': 3,
        'invalidation_requests_total{type="paths",outcome="unauthorized"}': 1,
        'invalidation_requests_total{type="wipe_all",outcome="sent"}': 1,
    });

    const durations = await scrape();
    assert.equal(
        durations['invalidation_request_duration_seconds_count{type="paths"}'],
        6
    );
    assert.equal(
        durations[
            'invalidation_request_duration_seconds_count{type="wipe_all"}'
        ],
        1
    );

    // The calls to the pods aren't awaited, so wait for them to fail
    const expected = {
        ...zero('frontend_requests_total', frontendLabels),
        'frontend_requests_total{path="/invalidate",status="network_error"}': 1,
        'frontend_requests_total{path="/invalidate/wipe-all",status="network_error"}': 1,
    };
    let actual = {};
    for (let attempt = 0; attempt < 50; attempt++) {
        actual = await samples('frontend_requests_total');
        if (JSON.stringify(actual) === JSON.stringify(expected)) {
            break;
        }
        await sleep(100);
    }
    assert.deepEqual(actual, expected);
});
