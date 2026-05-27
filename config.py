import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
PRODUCT_HUNT_API_KEY = os.getenv("PRODUCT_HUNT_API_KEY", "")
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "smb-newsletter-agent/1.0")

RSS_FEEDS = {
    "techcrunch": "https://techcrunch.com/feed/",
    "the_verge": "https://www.theverge.com/rss/index.xml",
}

REDDIT_SUBREDDITS = ["smallbusiness", "entrepreneur"]

# Fetch posts from the last N days
LOOKBACK_DAYS = 7

# Minimum upvotes to include a Reddit post
REDDIT_MIN_SCORE = 10
