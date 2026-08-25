#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    ./.venv/bin/pip install -e ".[dev]"
fi

echo "Starting KnowledgeHub Backend API on http://127.0.0.1:8000..."
exec ./.venv/bin/uvicorn app.main:app --reload --port 8000 --host 127.0.0.1
