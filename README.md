# nav.no frontend cache invalidator

## Om appen

Denne appen kalles av [nav-enonicxp](https://github.com/navikt/nav-enonicxp) ved behov for invalidering av cachen til [nav-enonicxp-frontend](https://github.com/navikt/nav-enonicxp-frontend).

Appen har to oppgaver:

- Invaliderer Valkey-cachen til nav-enonicxp-frontend.
- Videresender kall til alle podder for nav-enonicxp-frontend, slik at disse kan invalidere sin lokale cache.

Se [Dokumentasjon av caching](https://github.com/navikt/nav-enonicxp/wiki/Caching) for fullstendig dokumentasjon av cache-systemet.

## Utvikling lokalt

### Installere pnpm

Dette prosjektet bruker **pnpm** som package manager. Node.js kommer ikke lenger med Corepack (fra Node 25), så installer pnpm selv, for eksempel slik:

```bash
npm install --global pnpm
```

Se https://pnpm.io/installation for andre måter. pnpm leser `packageManager`-feltet i `package.json` og bytter automatisk til riktig versjon.

### Starte lokalt

Kopier `.env-template` til `.env` og kjør `pnpm dev`. Legg inn Valkey-credentials i `.env` ved behov.

### Tester

`pnpm test` bygger appen og kjører den uten Valkey, slik XP og frontend-poddene bruker den, og sjekker hva `/internal/metrics` rapporterer. Testen velger en ledig port selv, eller `TEST_PORT` om den er satt.

## Metrikker og varsler

Appen eksponerer Prometheus-metrikker på `/internal/metrics`, alle med prefikset `revalidator_proxy_` (se [src/metrics.ts](src/metrics.ts)):

- `invalidation_requests_total` og `invalidation_request_duration_seconds`: invalideringer fra XP, per type (`paths`, `wipe_all`) og utfall
- `frontend_requests_total`: invalideringer videresendt til frontend-poddene, per path og statusklasse
- `frontend_clients`: antall frontend-podder som har sendt heartbeat de siste 10 sekundene
- `heartbeats_total`: heartbeats fra frontend-poddene, per utfall
- `valkey_commands_total` og `valkey_ready`: Valkey-kommandoer per utfall, og om klienten er tilkoblet

Varslene ligger i [.nais/alerts.yml](.nais/alerts.yml), og deployes bare til prod, av `deploy.prod.yml`.

## Henvendelser

Spørsmål knyttet til koden eller prosjektet kan rettes mot https://github.com/orgs/navikt/teams/navno

### For NAV-ansatte

Interne henvendelser kan sendes via Slack i kanalen #team-navno
