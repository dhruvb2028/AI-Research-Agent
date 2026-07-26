"""Central configuration. All secrets come from the repo-root .env (never committed)."""
import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NIM_API_KEY = os.getenv("Nvidia_API_KEY", "")

# Model IDs are pinned after running scripts/nim_smoke.py against the live catalog.
LARGE_MODEL = os.getenv("LARGE_MODEL", "deepseek-ai/deepseek-v4-flash")
SMALL_MODEL = os.getenv("SMALL_MODEL", "meta/llama-3.1-8b-instruct")

# NIM free tier is rate-limited (~40 req/min); keep a client-side ceiling below it.
NIM_MAX_REQUESTS_PER_MINUTE = int(os.getenv("NIM_MAX_REQUESTS_PER_MINUTE", "30"))

# Retrieval / corpus
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
PINECONE_INDEX = os.getenv("PINECONE_INDEX", "research-agent")
# gemini-embedding-001 is 3072-dim natively; MRL-truncated to 768 to fit
# Pinecone's free 2GB and cut query latency. Truncated vectors are re-normalized.
EMBED_DIM = int(os.getenv("EMBED_DIM", "768"))
RERANK_ENABLED = os.getenv("RERANK_ENABLED", "true").lower() == "true"
RETRIEVE_TOP_K = int(os.getenv("RETRIEVE_TOP_K", "10"))
RERANK_TOP_N = int(os.getenv("RERANK_TOP_N", "4"))
