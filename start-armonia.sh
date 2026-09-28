#!/bin/sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Armonìa richiede Node.js 24 o superiore." >&2
  exit 1
fi

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "Armonìa richiede Node.js 24 o superiore. Versione rilevata: $(node --version)" >&2
  exit 1
fi

exec node --experimental-strip-types src/cli.ts ui
