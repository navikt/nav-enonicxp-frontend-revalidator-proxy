# nav.no frontend cache invalidator

## Om appen

Denne appen kalles av [nav-enonicxp](https://github.com/navikt/nav-enonicxp) ved behov for invalidering av cachen til [nav-enonicxp-frontend](https://github.com/navikt/nav-enonicxp-frontend).

Appen har to oppgaver:
- Invaliderer Redis-cachen til nav-enonicxp-frontend.
- Videresender kall til alle podder for nav-enonicxp-frontend, slik at disse kan invalidere sin lokale cache.

Se [Dokumentasjon av caching](https://github.com/navikt/nav-enonicxp/wiki/Caching) for fullstendig dokumentasjon av cache-systemet.

## Utvikling lokalt

Kopier `.env-template` til `.env` og kjør `npm run dev`. Legg inn Redis-credentials i `.env` ved behov.

## Henvendelser

Spørsmål knyttet til koden eller prosjektet kan rettes mot https://github.com/orgs/navikt/teams/personbruker

### For NAV-ansatte

Interne henvendelser kan sendes via Slack i kanalen #team-personbruker
