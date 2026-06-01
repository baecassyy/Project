"""
Reddit scraper using PRAW (read-only mode).
Falls back to unauthenticated JSON API when credentials are absent so the
agent works without Reddit API keys for basic usage.
"""
import logging
from datetime import datetime, timedelta, timezone

import requests

from config import (
    LOOKBACK_DAYS,
    REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET,
    REDDIT_MIN_SCORE,
    REDDIT_SUBREDDITS,
    REDDIT_USER_AGENT,
)
from models import Article

logger = logging.getLogger(__name__)

# Keywords that suggest AI-tool relevance
_AI_KEYWORDS = {
    "ai", "artificial intelligence", "machine learning", "ml", "gpt", "llm",
    "chatgpt", "claude", "gemini", "copilot", "automation", "chatbot",
    "generative", "openai", "anthropic",
}


def _is_ai_related(title: str, body: str) -> bool:
    text = (title + " " + body).lower()
    return any(kw in text for kw in _AI_KEYWORDS)


def _fetch_with_praw(subreddit: str, cutoff: datetime) -> list[Article]:
    try:
        import praw  # type: ignore
    except ImportError:
        logger.warning("praw not installed; falling back to JSON API")
        return _fetch_with_json_api(subreddit, cutoff)

    reddit = praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_CLIENT_SECRET,
        user_agent=REDDIT_USER_AGENT,
        read_only=True,
    )
    articles: list[Article] = []
    sub = reddit.subreddit(subreddit)
    for post in sub.new(limit=100):
        published_at = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)
        if published_at < cutoff:
            break
        if post.score < REDDIT_MIN_SCORE:
            continue
        if not _is_ai_related(post.title, post.selftext or ""):
            continue
        articles.append(
            Article(
                title=post.title,
                url=f"https://reddit.com{post.permalink}",
                source="reddit",
                published_at=published_at,
                summary=(post.selftext or "")[:500],
                score=post.score,
                tags=[f"r/{subreddit}"],
            )
        )
    return articles


def _fetch_with_json_api(subreddit: str, cutoff: datetime) -> list[Article]:
    """Unauthenticated fallback — rate-limited to ~60 req/min."""
    url = f"https://www.reddit.com/r/{subreddit}/new.json"
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; smb-newsletter-bot/1.0 by u/newsletter_bot)",
        "Accept": "application/json",
    }
    articles: list[Article] = []
    after: str | None = None

    for _ in range(5):  # max 5 pages × 100 posts
        params: dict = {"limit": 100}
        if after:
            params["after"] = after

        try:
            resp = requests.get(url, headers=headers, params=params, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.error("Reddit JSON API error for r/%s: %s", subreddit, exc)
            break

        data = resp.json()["data"]
        for child in data["children"]:
            post = child["data"]
            published_at = datetime.fromtimestamp(
                post["created_utc"], tz=timezone.utc
            )
            if published_at < cutoff:
                return articles  # posts are sorted newest-first
            if post.get("score", 0) < REDDIT_MIN_SCORE:
                continue
            if not _is_ai_related(post["title"], post.get("selftext", "")):
                continue
            articles.append(
                Article(
                    title=post["title"],
                    url=f"https://reddit.com{post['permalink']}",
                    source="reddit",
                    published_at=published_at,
                    summary=(post.get("selftext") or "")[:500],
                    score=post.get("score", 0),
                    tags=[f"r/{subreddit}"],
                )
            )

        after = data.get("after")
        if not after:
            break

    return articles


def fetch_reddit() -> list[Article]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    use_praw = bool(REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET)
    articles: list[Article] = []

    for subreddit in REDDIT_SUBREDDITS:
        if use_praw:
            results = _fetch_with_praw(subreddit, cutoff)
        else:
            logger.info(
                "Reddit credentials not set — using unauthenticated JSON API"
            )
            results = _fetch_with_json_api(subreddit, cutoff)
        logger.info("Reddit r/%s: fetched %d posts", subreddit, len(results))
        articles.extend(results)

    return articles
