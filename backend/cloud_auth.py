"""Verify bearer tokens with Supabase Auth; fail closed on missing configuration."""
import os
from urllib.parse import urlparse

import httpx


class CloudAuth:
    def __init__(self):
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
        self.admins = {value.strip().casefold() for value in os.environ["RAFFLE_ADMIN_EMAILS"].split(",") if value.strip()}
        parsed = urlparse(self.url)
        if parsed.scheme != "https" or not parsed.hostname or not self.admins or not self.key:
            raise RuntimeError("Configure HTTPS Supabase URL, publishable key and administrator email allowlist.")

    def config(self):
        return {"mode": "cloud", "supabase_url": self.url, "publishable_key": self.key}

    async def authorized(self, authorization):
        if not authorization.startswith("Bearer ") or not 1 < len(authorization) < 16384:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(self.url + "/auth/v1/user", headers={
                    "apikey": self.key, "Authorization": authorization})
            if response.status_code != 200:
                return False
            user = response.json()
            return bool(user.get("id") and user.get("email_confirmed_at") and not user.get("is_anonymous")
                        and str(user.get("email", "")).casefold() in self.admins)
        except (httpx.HTTPError, ValueError):
            return False
