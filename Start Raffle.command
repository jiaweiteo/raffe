#!/bin/zsh
set -e
cd -- "${0:A:h}"
if [[ ! -x .venv/bin/python || ! -f frontend/dist/index.html ]]; then
  print "Run ./setup.sh once first."
  read "?Press Enter to close."
  exit 1
fi
exec .venv/bin/python scripts/run.py
