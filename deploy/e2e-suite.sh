#!/usr/bin/env bash
# The e2e suite chainstrip's cove2e runs against the host-served app: the REST
# API suite (server-side evidence) and then the Playwright UI suite (browser
# evidence through covbrowser's embedded-script path). Exit non-zero if either
# failed, so the differential sees a failure whichever half produced it.
#
# E2E_UI_SPECS narrows the UI half (space-separated spec paths); the default
# is the whole suite, which its own config runs single-worker in about 40
# minutes. cove2e strips CI from the env, so playwright's CI-only maxFailures
# does not apply here.
set -uo pipefail
cd "$(dirname "$0")/../apps/meteor"
yarn testapi; api=$?
# shellcheck disable=SC2086
yarn playwright test ${E2E_UI_SPECS:-}; ui=$?
echo "e2e-suite: api exit $api, ui exit $ui"
[ "$api" -eq 0 ] && [ "$ui" -eq 0 ]
