"""
Entry point. Run: python main.py
Outputs a markdown brief to brief_YYYY-MM-DD.md
"""
import logging
import sys

from brief import save_brief
from filter import score_articles
from scrapers import fetch_product_hunt, fetch_reddit, fetch_rss

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s [%(name)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info("Step 1/3 — Collecting sources...")
    articles = []
    articles.extend(fetch_rss())
    articles.extend(fetch_reddit())
    articles.extend(fetch_product_hunt())
    articles.sort(key=lambda a: a.published_at, reverse=True)
    logger.info("Total raw articles: %d", len(articles))

    logger.info("Step 2/3 — Scoring SMB relevance with Gemini...")
    articles = score_articles(articles)

    logger.info("Step 3/3 — Generating brief...")
    path = save_brief(articles)
    logger.info("Brief saved to: %s", path)
    print(f"\nDone. Open {path} to see your weekly brief.")


if __name__ == "__main__":
    main()
