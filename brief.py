"""
Generates a formatted markdown weekly brief from scored articles.
"""
from datetime import datetime, timezone

from models import Article

_MIN_SCORE = 0.4  # articles below this are excluded
_MAX_ARTICLES = 15

_SOURCE_LABELS = {
    "product_hunt": "Product Hunt",
    "reddit": "Reddit",
    "techcrunch": "TechCrunch",
    "the_verge": "The Verge",
}


def _format_score(score: float) -> str:
    if score >= 0.8:
        return "High relevance"
    if score >= 0.6:
        return "Medium-high relevance"
    return "Medium relevance"


def generate_brief(articles: list[Article]) -> str:
    scored = [a for a in articles if a.smb_relevance_score is not None]
    unscored = [a for a in articles if a.smb_relevance_score is None]

    # Sort by relevance, then by score
    top = sorted(scored, key=lambda a: a.smb_relevance_score, reverse=True)
    top = [a for a in top if a.smb_relevance_score >= _MIN_SCORE][:_MAX_ARTICLES]

    week = datetime.now(timezone.utc).strftime("%B %d, %Y")
    lines = [
        f"# AI Tools for Small Business — Weekly Brief",
        f"*Week of {week}*",
        "",
        f"**{len(top)} stories** selected from {len(articles)} sources "
        f"({len(scored)} scored, {len(unscored)} unscored).",
        "",
        "---",
        "",
    ]

    for i, article in enumerate(top, 1):
        source_label = _SOURCE_LABELS.get(article.source, article.source)
        score_label = _format_score(article.smb_relevance_score)
        pub_date = article.published_at.strftime("%b %d")

        lines += [
            f"## {i}. {article.title}",
            f"**Source:** {source_label} &nbsp;|&nbsp; "
            f"**Published:** {pub_date} &nbsp;|&nbsp; "
            f"**{score_label}** ({article.smb_relevance_score:.2f})",
            "",
        ]

        if article.summary:
            lines += [article.summary, ""]

        if article.smb_relevance_reason:
            lines += [f"*Why it matters: {article.smb_relevance_reason}*", ""]

        lines += [f"[Read more]({article.url})", "", "---", ""]

    # Append low-relevance leftovers as a compact "Also seen" section
    also_seen = [
        a for a in scored
        if a.smb_relevance_score < _MIN_SCORE
    ] + unscored

    if also_seen:
        lines += ["## Also Seen This Week", ""]
        for a in also_seen[:10]:
            source_label = _SOURCE_LABELS.get(a.source, a.source)
            lines.append(f"- [{a.title}]({a.url}) — {source_label}")
        lines.append("")

    return "\n".join(lines)


def save_brief(articles: list[Article], path: str | None = None) -> str:
    content = generate_brief(articles)
    if path is None:
        week = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        path = f"brief_{week}.md"
    with open(path, "w") as f:
        f.write(content)
    return path
