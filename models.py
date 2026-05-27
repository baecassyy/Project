from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Article:
    title: str
    url: str
    source: str          # "product_hunt" | "reddit" | "techcrunch" | "the_verge"
    published_at: datetime
    summary: str = ""
    score: int = 0       # upvotes / PH votes
    tags: list[str] = field(default_factory=list)
    smb_relevance_score: float | None = None  # 0.0–1.0, set by filter step
    smb_relevance_reason: str = ""

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "url": self.url,
            "source": self.source,
            "published_at": self.published_at.isoformat(),
            "summary": self.summary,
            "score": self.score,
            "tags": self.tags,
            "smb_relevance_score": self.smb_relevance_score,
            "smb_relevance_reason": self.smb_relevance_reason,
        }
