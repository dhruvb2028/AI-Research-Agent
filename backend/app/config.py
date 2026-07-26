"""Central configuration. All secrets come from the repo-root .env (never committed)."""
import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NIM_API_KEY = os.getenv("Nvidia_API_KEY", "")

# Model IDs are pinned after running scripts/nim_smoke.py against the live catalog.
LARGE_MODEL = os.getenv("LARGE_MODEL", "meta/llama-3.3-70b-instruct")
SMALL_MODEL = os.getenv("SMALL_MODEL", "meta/llama-3.1-8b-instruct")

# NIM free tier is rate-limited (~40 req/min); keep a client-side ceiling below it.
NIM_MAX_REQUESTS_PER_MINUTE = int(os.getenv("NIM_MAX_REQUESTS_PER_MINUTE", "30"))
