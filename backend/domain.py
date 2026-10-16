"""Money and ticket rules. All persisted money is integer SGD cents."""
import re
from datetime import datetime, timezone
from decimal import Decimal
from html import unescape
from zoneinfo import ZoneInfo

FIRST_TICKET = 52000001
LAST_TICKET = 52001500
TICKET_CAPACITY = LAST_TICKET - FIRST_TICKET + 1


class RuleError(ValueError):
    pass


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def ticket_count(cents: int) -> int:
    if type(cents) is not int or cents <= 0 or cents % 500:
        raise RuleError("Payment must be a positive multiple of $5. Resolve other amounts before allocating tickets.")
    fifties, remainder = divmod(cents, 5000)
    twenties, remainder = divmod(remainder, 2000)
    return fifties * 15 + twenties * 5 + remainder // 500


def prize_cents(pot: int) -> list[int]:
    if pot >= 160000:
        return [pot - 110000, 50000, 30000, 20000, 10000]
    weights = [5, 5, 3, 2, 1]
    prizes = [pot * weight // 16 for weight in weights]
    for index in range(pot - sum(prizes)):
        prizes[index] += 1
    return prizes


def plain_text(body: str) -> str:
    text = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", "", body, flags=re.I | re.S)
    return unescape(re.sub(r"<[^>]+>", " ", text)).replace("\xa0", " ")


def parse_alert(body: str) -> dict:
    text = plain_text(body)
    pattern = (r"You\s+have\s+received\s+SGD\s+([\d,]+\.\d{2})\s+in\s+your\s+"
               r"PayNow-linked\s+account\s+ending\s+(\d{4})\s+on\s+"
               r"(\d{2}-[A-Z]{3}-\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)")
    match = re.search(pattern, text, re.I)
    if not match:
        raise RuleError("This does not match the UOB incoming PayNow alert format. Enter a verified payment manually instead.")
    raw_amount, suffix, day, clock = match.groups()
    if not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}", raw_amount):
        raise RuleError("The alert amount is malformed.")
    cents = int(Decimal(raw_amount.replace(",", "")) * 100)
    if cents <= 0 or cents > 100_000_000:
        raise RuleError("The alert amount is outside the supported range.")
    # Explicit month map avoids relying on the laptop's language/locale.
    months = {name: i + 1 for i, name in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
    try:
        d, mon, year = day.upper().split("-")
        parsed_clock = datetime.strptime(re.sub(r"\s", "", clock.upper()), "%I:%M%p")
        timestamp = datetime(int(year), months[mon], int(d), parsed_clock.hour,
                             parsed_clock.minute, tzinfo=ZoneInfo("Asia/Singapore"))
    except (ValueError, KeyError) as exc:
        raise RuleError("The alert has an invalid payment date.") from exc
    return {"amount_cents": cents, "account_suffix": suffix, "bank_time": timestamp.isoformat()}
