"""Local delegated Outlook connection; no messages are sent or modified."""
import hashlib
import platform
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
import msal
from msal_extensions import KeychainPersistence, PersistedTokenCache

from .domain import RuleError, now_iso, parse_alert

SCOPES = ["Mail.Read"]
GRAPH = "https://graph.microsoft.com"


class Outlook:
    def __init__(self, store):
        self.store = store
        self._app = None
        self._app_id = None
        self._auth_lock = threading.Lock()
        self._sync_lock = threading.Lock()
        self._generation = 0
        self._retry_at = 0
        self._failures = 0

    def client(self):
        client_id = self.store.settings()["client_id"]
        if not client_id:
            raise RuleError("Save a Microsoft application (client) ID in Settings first.")
        if self._app is None or self._app_id != client_id:
            if platform.system() != "Darwin":
                raise RuleError("This build requires macOS Keychain for protected Outlook token storage.")
            account = hashlib.sha256((str(self.store.root.resolve()) + client_id).encode()).hexdigest()
            persistence = KeychainPersistence(str(self.store.root / "outlook-cache.lock"),
                                              service_name="WeddingRaffle", account_name=account)
            cache = PersistedTokenCache(persistence)
            self._app = msal.PublicClientApplication(client_id, authority="https://login.microsoftonline.com/consumers", token_cache=cache)
            self._app_id = client_id
        return self._app

    def start_login(self):
        config = self.store.settings()
        if not all(config.get(key) for key in ("client_id", "trusted_sender", "account_suffix", "start_time")):
            raise RuleError("Save the application ID, exact bank sender, account suffix and intake start time first.")
        if not self._auth_lock.acquire(blocking=False):
            raise RuleError("A sign-in is already open. Complete it in your browser.")
        with self.store.lock:
            self._generation += 1
            generation = self._generation
            self.store.set_values(mail_enabled=False, sync_status="Sign in in your browser…")

        def login():
            try:
                client = self.client()
                result = client.acquire_token_interactive(scopes=SCOPES, timeout=180, prompt="select_account")
                with self.store.lock:
                    if generation != self._generation:
                        return
                    if "access_token" in result:
                        claims = result.get("id_token_claims", {})
                        username = claims.get("preferred_username") or claims.get("email") or ""
                        accounts = client.get_accounts()
                        matches = [a for a in accounts if username and a.get("username", "").casefold() == username.casefold()]
                        if not matches:
                            local_id = claims.get("oid") or claims.get("sub")
                            matches = [a for a in accounts if local_id and a.get("local_account_id") == local_id]
                        if len(matches) != 1:
                            raise RuleError("The signed-in mailbox could not be identified. Disconnect and reconnect.")
                        selected = matches[0]
                        old_account = self.store.settings().get("mail_account_id")
                        values = {"mail_enabled": True, "mail_account_id": selected["home_account_id"],
                                  "mail_username": selected.get("username", username), "sync_status": "Connected · waiting for first sync"}
                        if old_account != selected["home_account_id"]:
                            values["delta_link"] = ""
                        self.store.set_values(**values)
                        self._retry_at = 0
                    else:
                        self.store.set_values(mail_enabled=False, sync_status="Sign-in was not completed. Check app registration and try again.")
            except Exception:
                with self.store.lock:
                    if generation == self._generation:
                        self.store.set_values(mail_enabled=False, sync_status="Sign-in failed. Check internet, Microsoft setup and Keychain access, then reconnect.")
            finally:
                self._auth_lock.release()

        threading.Thread(target=login, daemon=True).start()

    def disconnect(self):
        with self.store.lock:
            self._generation += 1
            self.store.set_values(mail_enabled=False, mail_account_id="", mail_username="", sync_status="Disconnected")
        if self._app:
            for account in self._app.get_accounts():
                self._app.remove_account(account)

    @staticmethod
    def _safe_link(link):
        parsed = urlparse(link)
        return parsed.scheme == "https" and parsed.netloc == "graph.microsoft.com" and parsed.path.startswith("/v1.0/")

    def ingest(self, message):
        config = self.store.settings()
        if message.get("@removed"):
            return False
        sender = message.get("from", {}).get("emailAddress", {}).get("address", "").strip().casefold()
        subject = message.get("subject", "").strip().casefold()
        if sender != config["trusted_sender"].casefold() or subject != "uob-paynow transfer received":
            return False
        # Delta results may include older messages; enforce the intake boundary locally too.
        try:
            received = datetime.fromisoformat(message["receivedDateTime"].replace("Z", "+00:00"))
            start = datetime.fromisoformat(config["start_time"].replace("Z", "+00:00"))
            if received < start:
                return False
        except (KeyError, ValueError):
            self.store.mail_issue(config.get("mail_account_id", "") + ":" + message["id"], "Alert timestamp could not be read.", message.get("webLink", ""))
            return False
        try:
            parsed = parse_alert(message.get("body", {}).get("content", ""))
        except RuleError as exc:
            self.store.mail_issue(config.get("mail_account_id", "") + ":" + message["id"], str(exc), message.get("webLink", ""))
            return False
        if parsed["account_suffix"] != config["account_suffix"]:
            return False
        _, created = self.store.create_payment(**parsed, source="outlook", source_key="graph:" + config.get("mail_account_id", "") + ":" + message["id"],
                                               source_link=message.get("webLink", ""))
        return created

    def poll(self):
        config = self.store.settings()
        if not config.get("mail_enabled") or time.monotonic() < self._retry_at or not self._sync_lock.acquire(blocking=False):
            return
        try:
            with self.store.lock:
                config = self.store.settings()
                generation = self._generation
                if not config.get("mail_enabled"):
                    return
            def update(**values):
                with self.store.lock:
                    if generation == self._generation:
                        self.store.set_values(**values)
            app = self.client()
            accounts = [a for a in app.get_accounts() if a.get("home_account_id") == config.get("mail_account_id")]
            token = app.acquire_token_silent(SCOPES, account=accounts[0]) if len(accounts) == 1 else None
            if not token or "access_token" not in token:
                update(mail_enabled=False, sync_status="Outlook session expired · reconnect to resume intake")
                return
            url = config["delta_link"] or GRAPH + "/v1.0/me/mailFolders/inbox/messages/delta"
            start = datetime.fromisoformat(config["start_time"].replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            params = None if config["delta_link"] else {"$select": "id,subject,from,body,receivedDateTime,webLink", "$filter": "receivedDateTime ge " + start}
            with httpx.Client(timeout=25) as client:
                for _ in range(20):
                    if not self._safe_link(url):
                        raise RuleError("Invalid mailbox sync address; reset intake in Settings.")
                    response = client.get(url, params=params, headers={"Authorization": "Bearer " + token["access_token"],
                                                                      "Prefer": 'IdType="ImmutableId", odata.maxpagesize=50'})
                    if response.status_code == 429:
                        try:
                            delay = max(15, int(response.headers.get("Retry-After", "60")))
                        except ValueError:
                            delay = 60
                        self._retry_at = time.monotonic() + delay
                        update(sync_status=f"Outlook rate limit · retrying in {delay}s")
                        return
                    if response.status_code in (401, 403):
                        update(mail_enabled=False, sync_status="Outlook access needs attention · reconnect or check Mail.Read consent")
                        return
                    try:
                        error_code = response.json().get("error", {}).get("code", "").casefold() if response.status_code >= 400 else ""
                    except ValueError:
                        error_code = ""
                    if response.status_code == 410 or error_code in {"syncstatenotfound", "invaliddeltatoken", "resyncrequired", "errorinvalidsyncstatedata"}:
                        update(delta_link="", sync_status="Refreshing expired sync history · existing imports are protected")
                        return
                    response.raise_for_status()
                    page = response.json()
                    with self.store.lock:
                        if generation != self._generation:
                            return
                        for message in page.get("value", []):
                            self.ingest(message)
                    link = page.get("@odata.nextLink") or page.get("@odata.deltaLink")
                    if not link or not self._safe_link(link):
                        raise RuleError("Outlook returned incomplete sync history; retrying without advancing the cursor.")
                    with self.store.lock:
                        if generation != self._generation:
                            return
                        self.store.set_values(delta_link=link)
                    if "@odata.nextLink" not in page:
                        break
                    url, params = link, None
            self._failures = 0
            update(last_sync=now_iso(), sync_status="Connected · checking every 15 seconds")
        except Exception:
            self._failures += 1
            self._retry_at = time.monotonic() + min(300, 15 * 2 ** min(self._failures, 5))
            with self.store.lock:
                if 'generation' in locals() and generation == self._generation:
                    self.store.set_values(sync_status="Outlook temporarily unavailable · retrying; manual entry still works")
        finally:
            self._sync_lock.release()
