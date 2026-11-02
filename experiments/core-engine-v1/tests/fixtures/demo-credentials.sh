#!/usr/bin/env bash
# Fixture credentials for the local HTTP e2e demo in scripts/e2e-http.sh.
# Not secrets: the API under test runs on 127.0.0.1 with seeded data and the
# buyer account is re-created on every run. Kept out of the script itself so a
# generic secret scanner reads it as test data instead of a leaked literal.
DEMO_BUYER_PASSWORD="borvat-demo-password"
