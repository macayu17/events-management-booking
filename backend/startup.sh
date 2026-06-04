#!/bin/bash
echo "Installing dependencies..."
npm ci --omit=dev
echo "Generating Prisma client..."
npx prisma generate
if [ "$AZURE_RUN_PRISMA_MIGRATIONS" = "true" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy
else
  echo "Skipping database migrations. Set AZURE_RUN_PRISMA_MIGRATIONS=true to run them from startup."
fi
echo "Starting server..."
node src/server.js
