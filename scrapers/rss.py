"""
RSS scraper for TechCrunch and The Verge.
Uses feedparser; no API keys required.
"""
import logging
import ssl
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import certifi
import feedparser  # type: ignore

from config import LOOKBACK_DAYS, RSS_FEEDS
from models import Article

# Fix macOS Python SSL certificate verification
ssl._create_default_https_context = lambda: ssl.create_default_context(
    cafile=certifi.where()
)

logger = logging.getLogger(__name__)

_AI_KEYWORDS = {
    "ai", "artificial intelligence", "machine learning", "llm", "gpt",
    "chatgpt", "claude", "generative ai", "openai", "anthropic", "gemini",
    "copilot", "automation", "chatbot", "neural", "deep learning",
}

_SMB_KEYWORDS = {
    "small business", "smb", "startup", "entrepreneur", "freelance",
    "solopreneur", "side hustle", "small team", "founder",
}


def _parse_date(entry: feedparser.FeedParserDict) -> datetime:
    for attr in ("published", "updated", "created"):
        raw = entry.get(f"{attr}_parsed") or entry.get(attr)
        if raw is None:
            continue
        if isinstance(raw, str):
            try:
                return parsedate_to_datetime(raw).astimezone(timezone.utc)
            except Exception:
                pass
        elif hasattr(raw, "tm_year"):
            # time.struct_time from feedparser
            import calendar, time as _time
            ts = calendar.timegm(raw)
            return datetime.fromtimestamp(ts, tz=timezone.utc)
    return datetime.now(timezone.utc)


def _score_entry(title: str, summary: str) -> tuple[bool, bool]:
    """Returns (is_ai_related, is_smb_relevant)."""
    text = (title + " " + summary).lower()
    ai = any(kw in text for kw in _AI_KEYWORDS)
    smb = any(kw in text for kw in _SMB_KEYWORDS)
    return ai, smb


def fetch_rss() -> list[Article]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    articles: list[Article] = []

    for source_name, feed_url in RSS_FEEDS.items():
        try:
            feed = feedparser.parse(feed_url)
        except Exception as exc:
            logger.error("Failed to parse RSS feed %s: %s", feed_url, exc)
            continue

        if feed.bozo and feed.bozo_exception:
            logger.warning(
                "RSS feed %s has parse warnings: %s",
                source_name,
                feed.bozo_exception,
            )

        source_count = 0
        for entry in feed.entries:
            published_at = _parse_date(entry)
            if published_at < cutoff:
                continue

            title = entry.get("title", "").strip()
            summary = entry.get("summary", "") or entry.get("description", "")
            # Strip HTML tags crudely — feedparser sometimes leaves them in
            summary = summary.replace("<p>", " ").replace("</p>", " ")
            import re
            summary = re.sub(r"<[^>]+>", "", summary).strip()[:600]

            url = entry.get("link", "")
            tags = [t.get("term", "") for t in entry.get("tags", [])]

            is_ai, _ = _score_entry(title, summary)
            if not is_ai:
                continue  # hard filter: must mention AI at all

            articles.append(
                Article(
                    title=title,
                    url=url,
                    source=source_name,
                    published_at=published_at,
                    summary=summary,
                    score=0,
                    tags=tags,
                )
            )
            source_count += 1

        logger.info("RSS %s: fetched %d AI-related entries", source_name, source_count)

    return articles
