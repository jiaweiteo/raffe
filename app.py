"""Vercel's ASGI entrypoint. Local launch continues to use scripts/run.py."""
from backend.app import create_app

app = create_app(cloud=True)
