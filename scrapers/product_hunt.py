"""
Product Hunt scraper using the GraphQL API v2.
Requires PRODUCT_HUNT_API_KEY in .env (Developer Token from
https://api.producthunt.com/v2/docs — create an application, then generate
a developer token under "OAuth Applications").
"""
import logging
from datetime import datetime, timedelta, timezone

import requests

from config import LOOKBACK_DAYS, PRODUCT_HUNT_API_KEY
from models import Article

logger = logging.getLogger(__name__)

_GQL_ENDPOINT = "https://api.producthunt.com/v2/api/graphql"

_POSTS_QUERY = """
query fetchPosts($after: String, $postedAfter: DateTime!) {
  posts(order: VOTES, after: $after, postedAfter: $postedAfter) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name
        tagline
        description
        url
        votesCount
        createdAt
        topics { edges { node { name } } }
      }
    }
  }
}
"""


def fetch_product_hunt(max_pages: int = 3) -> list[Article]:
    if not PRODUCT_HUNT_API_KEY:
        logger.warning("PRODUCT_HUNT_API_KEY not set — skipping Product Hunt")
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    headers = {
        "Authorization": f"Bearer {PRODUCT_HUNT_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    articles: list[Article] = []
    cursor: str | None = None

    for page in range(max_pages):
        variables: dict = {"postedAfter": cutoff.isoformat()}
        if cursor:
            variables["after"] = cursor

        try:
            resp = requests.post(
                _GQL_ENDPOINT,
                json={"query": _POSTS_QUERY, "variables": variables},
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.error("Product Hunt request failed: %s", exc)
            break

        data = resp.json()
        if "errors" in data:
            logger.error("Product Hunt GraphQL errors: %s", data["errors"])
            break

        posts_data = data["data"]["posts"]
        for edge in posts_data["edges"]:
            node = edge["node"]
            topics = [
                t["node"]["name"]
                for t in node.get("topics", {}).get("edges", [])
            ]
            published_at = datetime.fromisoformat(
                node["createdAt"].replace("Z", "+00:00")
            )
            summary = node.get("tagline") or node.get("description") or ""
            articles.append(
                Article(
                    title=node["name"],
                    url=node["url"],
                    source="product_hunt",
                    published_at=published_at,
                    summary=summary,
                    score=node.get("votesCount", 0),
                    tags=topics,
                )
            )

        page_info = posts_data["pageInfo"]
        if not page_info["hasNextPage"]:
            break
        cursor = page_info["endCursor"]

    logger.info("Product Hunt: fetched %d posts", len(articles))
    return articles
