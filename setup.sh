#!/bin/zsh
set -e
cd -- "${0:A:h}"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
npm --prefix frontend ci --no-audit --no-fund
npm --prefix frontend run build
print "Ready. Double-click Start Raffle.command to open both views."
