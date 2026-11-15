#!/bin/sh
# Refuse to run staging if any name would collide with PRODUCTION.
#
# Run from /opt/phoenix-kti-staging (the deploy workflow does this before
# every pull/up). Renders the effective compose config with staging's .env
# and fails if it still points at production's project, containers, network,
# database volume, Traefik routes, hosts or :latest images, or if the
# STAGING safety switch is not on. See docs/STAGING.md.
set -eu

fail=0
cfg=$(docker compose config 2>&1) || { echo "GUARD: 'docker compose config' failed:"; echo "$cfg"; exit 1; }

forbid() {  # forbid <extended-regex> <explanation>
  if printf '%s\n' "$cfg" | grep -Eq -- "$1"; then
    echo "GUARD FAIL: $2"
    printf '%s\n' "$cfg" | grep -En -- "$1" | head -5 | sed 's/^/    /'
    fail=1
  fi
}

forbid '^name: phoenix_kti$'                              "compose project is production's (set STACK_PROJECT_NAME)"
forbid 'container_name: phoenix_kti_(postgres|redis)$'    "container names are production's (set STACK_CONTAINER_PREFIX)"
forbid '^ +name: phoenix_kti_backend$'                     "backend network is production's (set BACKEND_NETWORK_NAME)"
forbid 'name: phoenix-kti_kti_postgres_data$'             "DATABASE VOLUME IS PRODUCTION'S (set PG_VOLUME_NAME)"
forbid 'image: .*phoenix-kti-(backend|frontend)(:latest)?$' "images are not the :staging tag (set DOCKER_IMAGE_BACKEND/FRONTEND)"
forbid 'traefik\.http\.routers\.phoenix-kti-(api|ws|flower|frontend|frontend-http)\.' "Traefik router names are production's (set TRAEFIK_PREFIX)"
forbid 'middlewares\.kti-redirect-to-https\.'             "Traefik middleware name is production's (set TRAEFIK_MIDDLEWARE_PREFIX)"
forbid 'Host\(`(erp\.krystartrust\.ng|api\.kti\.krystartrust\.ng|flower\.kti\.krystartrust\.ng)`\)' "Host rules are production's (set FRONTEND_HOST/API_HOST/FLOWER_HOST)"

# The STAGING switch must be on for every Django process.
n=$(printf '%s\n' "$cfg" | grep -Ec '^ +STAGING: "true"$' || true)
if [ "$n" -lt 4 ]; then
  echo "GUARD FAIL: STAGING=true is on $n service(s), expected 4+ (is COMPOSE_FILE including docker-compose.staging.yml?)"
  fail=1
fi

# The frontend's nginx proxies /api/ to the hostname "backend", and BOTH
# stacks' backends are on the shared traefik_public network. Docker resolves a
# name found on several networks in alphabetical order of network name, so
# the stack's private network must sort BEFORE "traefik_public" or nginx can
# reach the other stack's backend (tested 2026-11-14; docs/STAGING.md).
net=$(printf '%s\n' "$cfg" | awk '/^networks:/{f=1;next} /^[a-z]/{f=0} f&&/^  phoenix_kti_backend:/{g=1;next} g&&/^  [a-z]/{g=0} g&&/^    name:/{print $2; exit}')
first=$(printf '%s\n%s\n' "$net" "traefik_public" | LC_ALL=C sort | head -1)
if [ -z "$net" ] || [ "$first" != "$net" ] || [ "$net" = "traefik_public" ]; then
  echo "GUARD FAIL: backend network '$net' must sort alphabetically before 'traefik_public' (e.g. phoenix_kti_staging_backend)"
  fail=1
fi

# No real Telegram credentials may reach staging.
forbid '^ +TELEGRAM_BOT_TOKEN: ("[^"]+"|[^" ].*)$' "TELEGRAM_BOT_TOKEN is set (remove it from staging's .env)"

if [ "$fail" -ne 0 ]; then
  echo "GUARD: staging is NOT isolated from production. Nothing was changed."
  exit 1
fi
echo "GUARD OK: staging is isolated from production."
