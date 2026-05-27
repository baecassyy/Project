"""
SMB relevance filter using Groq (free tier).
Scores each article 0.0–1.0 for relevance to AI tools for small businesses.
Articles are sent in batches to minimize API calls.
"""
import json
import logging
import time

from groq import Groq

from config import GROQ_API_KEY
from models import Article

logger = logging.getLogger(__name__)

_BATCH_SIZE = 10
_MODEL = "llama-3.3-70b-versatile"

_SYSTEM_PROMPT = """\
You are an editor for a B2B newsletter about AI tools for small businesses (SMBs).
Score each article for relevance to this audience: small business owners, founders,
and operators who want practical AI tools to save time or money.

High scores (0.8–1.0): AI product launches, pricing changes, tutorials, or case
studies directly useful to a small business with limited technical staff.

Medium scores (0.4–0.7): General AI news that has indirect SMB implications.

Low scores (0.0–0.3): Enterprise-only, highly technical, research papers, or
unrelated to AI tools.

Respond ONLY with a valid JSON array, one object per article, in the same order:
[{"score": 0.0, "reason": "one sentence"}, ...]
"""


def _build_batch_prompt(articles: list[Article]) -> str:
    lines = []
    for i, a in enumerate(articles, 1):
        lines.append(f"{i}. TITLE: {a.title}")
        if a.summary:
            lines.append(f"   SUMMARY: {a.summary[:300]}")
        lines.append(f"   SOURCE: {a.source}")
    return "\n".join(lines)


def score_articles(articles: list[Article]) -> list[Article]:
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set — skipping relevance scoring")
        return articles

    client = Groq(api_key=GROQ_API_KEY)

    for batch_start in range(0, len(articles), _BATCH_SIZE):
        batch = articles[batch_start : batch_start + _BATCH_SIZE]
        prompt = _build_batch_prompt(batch)

        try:
            response = client.chat.completions.create(
                model=_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            raw = response.choices[0].message.content
            parsed = json.loads(raw)
            # handle both {"articles": [...]} and bare [...]
            scores = parsed if isinstance(parsed, list) else next(iter(parsed.values()))
        except Exception as exc:
            logger.error("Groq scoring failed for batch %d: %s", batch_start, exc)
            continue

        if len(scores) != len(batch):
            logger.warning(
                "Groq returned %d scores for %d articles — skipping batch",
                len(scores),
                len(batch),
            )
            continue

        for article, result in zip(batch, scores):
            article.smb_relevance_score = float(result.get("score", 0.0))
            article.smb_relevance_reason = result.get("reason", "")

        if batch_start + _BATCH_SIZE < len(articles):
            time.sleep(1)

    scored = [a for a in articles if a.smb_relevance_score is not None]
    logger.info(
        "Scored %d/%d articles (avg %.2f)",
        len(scored),
        len(articles),
        sum(a.smb_relevance_score for a in scored) / max(len(scored), 1),
    )
    return articles
