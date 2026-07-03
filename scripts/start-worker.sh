#!/bin/sh
set -e
cd /app
exec pnpm --filter @nostril/worker start
