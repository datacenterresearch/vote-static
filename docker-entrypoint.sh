#!/bin/sh
set -e

echo "Running Prisma database migrations..."
prisma migrate deploy

echo "Starting Next.js standalone server..."
exec node server.js
