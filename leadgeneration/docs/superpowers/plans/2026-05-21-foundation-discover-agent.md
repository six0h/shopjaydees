# Foundation + Discover Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project scaffolding, shared data models, configuration, API clients (ClickUp + Firecrawl), and the Stage 1 Discover agent that scrapes Google Maps for prospects and pushes raw leads to ClickUp.

**Architecture:** Python package with dependency-injected API clients, tested with mocked HTTP responses. Each pipeline stage is a separate Cloud Function triggered by Google Cloud Scheduler. ClickUp is the single source of truth — every lead lives there with its status, enrichment data, and outreach history. The Discover agent constructs Google Maps search URLs by segment/geography, uses Firecrawl's LLM extraction to pull structured business listings, deduplicates against existing ClickUp tasks, and creates new lead tasks with status "New".

**Tech Stack:** Python 3.11+, Pydantic v2, requests, pytest, responses (HTTP mocking), Google Cloud Functions Framework, Firecrawl API (scraping + extraction), ClickUp API v2

---

## Build Now vs. Blocked

**Buildable now (no client accounts needed):**
- All code, models, configuration, and API clients
- Full test suite with mocked HTTP responses
- Local Cloud Function testing via functions-framework
- Search query definitions and geographic targeting

**Blocked on client account setup:**
- ClickUp workspace/list/status/custom-field configuration (need client's ClickUp account)
- Live Firecrawl scraping (need client's API key)
- Google Cloud deployment (need client's GCP project)
- Real ClickUp custom field IDs (populated after workspace setup)
- End-to-end integration testing with live APIs

## Multi-Plan Overview

This is **Plan 1 of 5**. Each plan produces working, independently testable software.

| Plan | Scope | Depends On | Status |
|------|-------|-----------|--------|
| **1. Foundation + Discover** | Project scaffolding, models, config, ClickUp client, Firecrawl client, Discover agent | Nothing | This plan |
| 2. Enrich Agent | Hunter.io client, Gemini client, enrichment logic, lead scoring | Plan 1 |  |
| 3. Personalize Agent | Template framework, personalization layers, email/LinkedIn copy generation | Plans 1-2 |  |
| 4. Outreach Agent | Instantly client, send agent, engagement tracking, status updates | Plans 1-3 |  |
| 5. Deployment & Configuration | ClickUp workspace setup, GCF deploy, Cloud Scheduler, Instantly config, E2E testing | Plans 1-4 + client accounts |  |

---

## File Structure

All pipeline code lives under `pipeline/` within the `leadgeneration/` project directory.

```
pipeline/
├── pyproject.toml                         # Package definition, dependencies
├── .env.example                           # Template for environment variables
├── .gitignore                             # Python-specific ignores
├── functions.py                           # Cloud Function entry points (thin wrappers)
├── src/
│   └── leadgen/
│       ├── __init__.py                    # Package init
│       ├── models.py                      # Pydantic models: Prospect, Segment, ProspectStatus, DiscoverResult
│       ├── config.py                      # Configuration loading, search query definitions
│       ├── clients/
│       │   ├── __init__.py
│       │   ├── clickup.py                 # ClickUp API client: create tasks, list tasks, dedup
│       │   └── firecrawl_client.py        # Firecrawl API client: Google Maps scraping with LLM extraction
│       └── agents/
│           ├── __init__.py
│           └── discover.py                # Stage 1: scrape → dedup → push to ClickUp
└── tests/
    ├── __init__.py
    ├── conftest.py                        # Shared pytest fixtures
    ├── test_models.py                     # Model creation, serialization, defaults
    ├── test_config.py                     # Config loading, search query coverage
    ├── clients/
    │   ├── __init__.py
    │   ├── test_clickup.py                # Task creation, listing, pagination, custom fields
    │   └── test_firecrawl.py              # Maps scraping, empty results, failure handling
    └── agents/
        ├── __init__.py
        └── test_discover.py               # Full pipeline: new leads, dedup, error handling, multi-query
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `pipeline/pyproject.toml`
- Create: `pipeline/.env.example`
- Create: `pipeline/.gitignore`
- Create: `pipeline/src/leadgen/__init__.py`
- Create: `pipeline/src/leadgen/clients/__init__.py`
- Create: `pipeline/src/leadgen/agents/__init__.py`
- Create: `pipeline/tests/__init__.py`
- Create: `pipeline/tests/clients/__init__.py`
- Create: `pipeline/tests/agents/__init__.py`
- Create: `pipeline/tests/conftest.py`

- [ ] **Step 1: Create directory structure**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration
mkdir -p pipeline/src/leadgen/clients
mkdir -p pipeline/src/leadgen/agents
mkdir -p pipeline/tests/clients
mkdir -p pipeline/tests/agents
```

- [ ] **Step 2: Write pyproject.toml**

Create `pipeline/pyproject.toml`:

```toml
[project]
name = "shopjaydees-leadgen"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "requests>=2.31.0",
    "pydantic>=2.0.0",
    "python-dotenv>=1.0.0",
    "functions-framework>=3.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "responses>=0.25.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/leadgen"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 3: Write .env.example and .gitignore**

Create `pipeline/.env.example`:

```
# ClickUp
CLICKUP_API_TOKEN=
CLICKUP_LIST_ID=

# ClickUp custom field IDs (populated after workspace setup)
CLICKUP_FIELD_SEGMENT=
CLICKUP_FIELD_CATEGORY=
CLICKUP_FIELD_WEBSITE=
CLICKUP_FIELD_SOURCE_QUERY=

# Firecrawl
FIRECRAWL_API_KEY=

# Future (Plans 2-4)
# HUNTER_API_KEY=
# GEMINI_API_KEY=
# INSTANTLY_API_KEY=
```

Create `pipeline/.gitignore`:

```
__pycache__/
*.pyc
.env
.venv/
*.egg-info/
dist/
build/
.pytest_cache/
```

- [ ] **Step 4: Create package init files and conftest**

Create empty `__init__.py` files in all `src/leadgen/`, `src/leadgen/clients/`, `src/leadgen/agents/`, `tests/`, `tests/clients/`, and `tests/agents/` directories.

Create `pipeline/tests/conftest.py` (fixtures will be added in later tasks — start with a placeholder):

```python
import pytest
```

- [ ] **Step 5: Install dependencies and verify pytest runs**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest -v
```

Expected: `no tests ran` with exit code 5 (no tests collected). No import errors.

- [ ] **Step 6: Commit**

```bash
git add pipeline/
git commit -m "feat(pipeline): scaffold project structure with dependencies"
```

---

### Task 2: Data Models

**Files:**
- Create: `pipeline/src/leadgen/models.py`
- Create: `pipeline/tests/test_models.py`

- [ ] **Step 1: Write failing tests for all models**

Create `pipeline/tests/test_models.py`:

```python
from leadgen.models import Prospect, Segment, ProspectStatus, DiscoverResult


def test_segment_values():
    assert Segment.BUSINESS.value == "business"
    assert Segment.SCHOOL.value == "school"
    assert Segment.TEAM.value == "team"


def test_prospect_status_pipeline_stages():
    assert ProspectStatus.NEW.value == "new"
    assert ProspectStatus.ENRICHED.value == "enriched"
    assert ProspectStatus.PARKED.value == "parked"
    assert ProspectStatus.READY_FOR_REVIEW.value == "ready_for_review"
    assert ProspectStatus.APPROVED.value == "approved"
    assert ProspectStatus.OUTREACH_ACTIVE.value == "outreach_active"
    assert ProspectStatus.RESPONDED.value == "responded"
    assert ProspectStatus.DORMANT.value == "dormant"
    assert ProspectStatus.CONVERTED.value == "converted"


def test_prospect_creation_with_required_fields():
    p = Prospect(
        name="Test Business",
        segment=Segment.BUSINESS,
        category="Trades & Contractors",
        source_query="plumbing company Surrey BC",
    )
    assert p.name == "Test Business"
    assert p.segment == Segment.BUSINESS
    assert p.status == ProspectStatus.NEW
    assert p.address is None
    assert p.phone is None
    assert p.website is None


def test_prospect_creation_with_all_fields():
    p = Prospect(
        name="ABC Plumbing",
        address="123 King George Blvd, Surrey, BC",
        phone="604-555-1234",
        website="https://abcplumbing.ca",
        segment=Segment.BUSINESS,
        category="Trades & Contractors",
        source_query="plumbing company Surrey BC",
    )
    assert p.address == "123 King George Blvd, Surrey, BC"
    assert p.phone == "604-555-1234"
    assert p.website == "https://abcplumbing.ca"


def test_prospect_serialization_roundtrip():
    p = Prospect(
        name="Fraser Valley Academy",
        address="456 School Rd, Langley, BC",
        segment=Segment.SCHOOL,
        category="Elementary & Secondary",
        source_query="elementary school Langley BC",
    )
    data = p.model_dump()
    assert data["segment"] == "school"
    assert data["status"] == "new"
    restored = Prospect(**data)
    assert restored == p


def test_discover_result_defaults():
    r = DiscoverResult(total_scraped=10, duplicates_skipped=3, new_leads_created=7)
    assert r.errors == []


def test_discover_result_with_errors():
    r = DiscoverResult(
        total_scraped=5,
        duplicates_skipped=0,
        new_leads_created=3,
        errors=["Scrape failed for query X", "ClickUp error for Y"],
    )
    assert len(r.errors) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/test_models.py -v
```

Expected: `ModuleNotFoundError: No module named 'leadgen.models'`

- [ ] **Step 3: Implement all models**

Create `pipeline/src/leadgen/models.py`:

```python
from enum import Enum

from pydantic import BaseModel


class Segment(str, Enum):
    BUSINESS = "business"
    SCHOOL = "school"
    TEAM = "team"


class ProspectStatus(str, Enum):
    NEW = "new"
    ENRICHED = "enriched"
    PARKED = "parked"
    READY_FOR_REVIEW = "ready_for_review"
    APPROVED = "approved"
    OUTREACH_ACTIVE = "outreach_active"
    RESPONDED = "responded"
    DORMANT = "dormant"
    CONVERTED = "converted"


class Prospect(BaseModel):
    name: str
    address: str | None = None
    phone: str | None = None
    website: str | None = None
    segment: Segment
    category: str
    source_query: str
    status: ProspectStatus = ProspectStatus.NEW


class DiscoverResult(BaseModel):
    total_scraped: int
    duplicates_skipped: int
    new_leads_created: int
    errors: list[str] = []
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/test_models.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/leadgen/models.py pipeline/tests/test_models.py
git commit -m "feat(pipeline): add Prospect, Segment, ProspectStatus, and DiscoverResult models"
```

---

### Task 3: Configuration Module

**Files:**
- Create: `pipeline/src/leadgen/config.py`
- Create: `pipeline/tests/test_config.py`
- Modify: `pipeline/tests/conftest.py` — add shared fixtures

- [ ] **Step 1: Write failing tests for configuration**

Create `pipeline/tests/test_config.py`:

```python
import os
from unittest.mock import patch

from leadgen.config import (
    ClickUpConfig,
    DiscoverConfig,
    FirecrawlConfig,
    PHASE_1_QUERIES,
    SearchQuery,
    load_discover_config,
)
from leadgen.models import Segment


def test_search_query_creation():
    q = SearchQuery(
        query="plumbing company",
        location="Surrey BC",
        segment=Segment.BUSINESS,
        category="Trades & Contractors",
    )
    assert q.query == "plumbing company"
    assert q.location == "Surrey BC"


def test_phase_1_queries_cover_all_segments():
    segments = {q.segment for q in PHASE_1_QUERIES}
    assert Segment.BUSINESS in segments
    assert Segment.SCHOOL in segments
    assert Segment.TEAM in segments


def test_phase_1_queries_have_required_fields():
    for q in PHASE_1_QUERIES:
        assert q.query, f"Empty query in {q}"
        assert q.location, f"Empty location in {q}"
        assert q.category, f"Empty category in {q}"


def test_phase_1_queries_target_fraser_valley():
    locations = {q.location for q in PHASE_1_QUERIES}
    fraser_valley_cities = {"Surrey BC", "Langley BC", "Abbotsford BC"}
    assert locations & fraser_valley_cities, "Phase 1 should target Fraser Valley"


def test_load_discover_config_minimal():
    env = {
        "CLICKUP_API_TOKEN": "pk_test_token",
        "CLICKUP_LIST_ID": "list_123",
        "FIRECRAWL_API_KEY": "fc-test-key",
    }
    with patch.dict(os.environ, env, clear=False):
        config = load_discover_config()
    assert config.clickup.api_token == "pk_test_token"
    assert config.clickup.list_id == "list_123"
    assert config.firecrawl.api_key == "fc-test-key"
    assert len(config.search_queries) > 0
    assert config.clickup.field_ids == {}


def test_load_discover_config_with_custom_field_ids():
    env = {
        "CLICKUP_API_TOKEN": "pk_test",
        "CLICKUP_LIST_ID": "list_123",
        "FIRECRAWL_API_KEY": "fc-test",
        "CLICKUP_FIELD_SEGMENT": "field_seg_uuid",
        "CLICKUP_FIELD_CATEGORY": "field_cat_uuid",
    }
    with patch.dict(os.environ, env, clear=False):
        config = load_discover_config()
    assert config.clickup.field_ids["segment"] == "field_seg_uuid"
    assert config.clickup.field_ids["category"] == "field_cat_uuid"
    assert "website" not in config.clickup.field_ids


def test_load_discover_config_missing_required_var():
    env = {"CLICKUP_API_TOKEN": "pk_test"}
    with patch.dict(os.environ, env, clear=True):
        try:
            load_discover_config()
            assert False, "Should have raised KeyError"
        except KeyError:
            pass
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/test_config.py -v
```

Expected: `ModuleNotFoundError: No module named 'leadgen.config'`

- [ ] **Step 3: Implement configuration module**

Create `pipeline/src/leadgen/config.py`:

```python
import os

from pydantic import BaseModel

from leadgen.models import Segment


class SearchQuery(BaseModel):
    query: str
    location: str
    segment: Segment
    category: str


class ClickUpConfig(BaseModel):
    api_token: str
    list_id: str
    field_ids: dict[str, str] = {}


class FirecrawlConfig(BaseModel):
    api_key: str


class DiscoverConfig(BaseModel):
    clickup: ClickUpConfig
    firecrawl: FirecrawlConfig
    search_queries: list[SearchQuery]


PHASE_1_QUERIES: list[SearchQuery] = [
    # Businesses — Trades & Contractors
    SearchQuery(query="plumbing company", location="Surrey BC", segment=Segment.BUSINESS, category="Trades & Contractors"),
    SearchQuery(query="electrical contractor", location="Surrey BC", segment=Segment.BUSINESS, category="Trades & Contractors"),
    SearchQuery(query="plumbing company", location="Langley BC", segment=Segment.BUSINESS, category="Trades & Contractors"),
    SearchQuery(query="HVAC company", location="Abbotsford BC", segment=Segment.BUSINESS, category="Trades & Contractors"),
    # Businesses — Restaurants & Hospitality
    SearchQuery(query="restaurant", location="Surrey BC", segment=Segment.BUSINESS, category="Restaurants & Hospitality"),
    SearchQuery(query="brewery", location="Langley BC", segment=Segment.BUSINESS, category="Restaurants & Hospitality"),
    # Businesses — Fitness & Wellness
    SearchQuery(query="gym", location="Surrey BC", segment=Segment.BUSINESS, category="Fitness & Wellness"),
    SearchQuery(query="yoga studio", location="Abbotsford BC", segment=Segment.BUSINESS, category="Fitness & Wellness"),
    # Businesses — Real Estate
    SearchQuery(query="real estate brokerage", location="Surrey BC", segment=Segment.BUSINESS, category="Real Estate & Property Mgmt"),
    # Businesses — Auto & Trades Shops
    SearchQuery(query="auto body shop", location="Langley BC", segment=Segment.BUSINESS, category="Auto & Trades Shops"),
    # Schools — Elementary & Secondary
    SearchQuery(query="elementary school", location="Surrey BC", segment=Segment.SCHOOL, category="Elementary & Secondary"),
    SearchQuery(query="high school", location="Langley BC", segment=Segment.SCHOOL, category="Elementary & Secondary"),
    SearchQuery(query="elementary school", location="Maple Ridge BC", segment=Segment.SCHOOL, category="Elementary & Secondary"),
    # Schools — Independent & Private
    SearchQuery(query="private school", location="Surrey BC", segment=Segment.SCHOOL, category="Independent & Private"),
    # Schools — Daycares
    SearchQuery(query="daycare", location="Langley BC", segment=Segment.SCHOOL, category="Daycares & Preschools"),
    SearchQuery(query="preschool", location="Abbotsford BC", segment=Segment.SCHOOL, category="Daycares & Preschools"),
    # Teams — Youth Sports
    SearchQuery(query="minor hockey", location="Surrey BC", segment=Segment.TEAM, category="Youth Sports Leagues"),
    SearchQuery(query="soccer league", location="Langley BC", segment=Segment.TEAM, category="Youth Sports Leagues"),
    SearchQuery(query="minor baseball", location="Abbotsford BC", segment=Segment.TEAM, category="Youth Sports Leagues"),
    # Teams — Dance & Performance
    SearchQuery(query="dance studio", location="Surrey BC", segment=Segment.TEAM, category="Dance & Performance"),
    SearchQuery(query="martial arts", location="Langley BC", segment=Segment.TEAM, category="Dance & Performance"),
    # Teams — Community Sport Orgs
    SearchQuery(query="community centre", location="Chilliwack BC", segment=Segment.TEAM, category="Community Sport Orgs"),
    SearchQuery(query="recreation centre", location="Mission BC", segment=Segment.TEAM, category="Community Sport Orgs"),
]


def load_discover_config() -> DiscoverConfig:
    field_env_map = {
        "segment": "CLICKUP_FIELD_SEGMENT",
        "category": "CLICKUP_FIELD_CATEGORY",
        "website": "CLICKUP_FIELD_WEBSITE",
        "source_query": "CLICKUP_FIELD_SOURCE_QUERY",
    }

    return DiscoverConfig(
        clickup=ClickUpConfig(
            api_token=os.environ["CLICKUP_API_TOKEN"],
            list_id=os.environ["CLICKUP_LIST_ID"],
            field_ids={
                name: os.environ[env_var]
                for name, env_var in field_env_map.items()
                if env_var in os.environ and os.environ[env_var]
            },
        ),
        firecrawl=FirecrawlConfig(api_key=os.environ["FIRECRAWL_API_KEY"]),
        search_queries=PHASE_1_QUERIES,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/test_config.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Add shared fixtures to conftest.py**

Update `pipeline/tests/conftest.py`:

```python
import pytest

from leadgen.config import ClickUpConfig, FirecrawlConfig, SearchQuery
from leadgen.models import Prospect, Segment


@pytest.fixture
def clickup_config():
    return ClickUpConfig(
        api_token="pk_test_token",
        list_id="list_test_123",
        field_ids={
            "segment": "field_seg_id",
            "category": "field_cat_id",
            "website": "field_web_id",
            "source_query": "field_src_id",
        },
    )


@pytest.fixture
def clickup_config_no_fields():
    return ClickUpConfig(
        api_token="pk_test_token",
        list_id="list_test_123",
    )


@pytest.fixture
def firecrawl_config():
    return FirecrawlConfig(api_key="fc-test-key")


@pytest.fixture
def sample_prospect():
    return Prospect(
        name="ABC Plumbing",
        address="123 King George Blvd, Surrey, BC",
        phone="604-555-1234",
        website="https://abcplumbing.ca",
        segment=Segment.BUSINESS,
        category="Trades & Contractors",
        source_query="plumbing company Surrey BC",
    )


@pytest.fixture
def sample_search_query():
    return SearchQuery(
        query="plumbing company",
        location="Surrey BC",
        segment=Segment.BUSINESS,
        category="Trades & Contractors",
    )
```

- [ ] **Step 6: Run full test suite**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest -v
```

Expected: all 14 tests PASS (7 model + 7 config).

- [ ] **Step 7: Commit**

```bash
git add pipeline/src/leadgen/config.py pipeline/tests/test_config.py pipeline/tests/conftest.py
git commit -m "feat(pipeline): add configuration module with Phase 1 search queries"
```

---

### Task 4: ClickUp Client — Create Task

**Files:**
- Create: `pipeline/src/leadgen/clients/clickup.py`
- Create: `pipeline/tests/clients/test_clickup.py`

- [ ] **Step 1: Write failing tests for task creation**

Create `pipeline/tests/clients/test_clickup.py`:

```python
import json

import responses

from leadgen.clients.clickup import ClickUpClient
from leadgen.models import Prospect, Segment


CLICKUP_BASE = "https://api.clickup.com/api/v2"


@responses.activate
def test_create_task_returns_task_id(clickup_config, sample_prospect):
    responses.add(
        responses.POST,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={"id": "task_abc123"},
        status=200,
    )

    client = ClickUpClient(clickup_config)
    task_id = client.create_task(sample_prospect)

    assert task_id == "task_abc123"


@responses.activate
def test_create_task_sends_correct_payload(clickup_config, sample_prospect):
    responses.add(
        responses.POST,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={"id": "task_abc123"},
        status=200,
    )

    client = ClickUpClient(clickup_config)
    client.create_task(sample_prospect)

    assert len(responses.calls) == 1
    body = json.loads(responses.calls[0].request.body)
    assert body["name"] == "ABC Plumbing"
    assert body["status"] == "new"
    assert "123 King George Blvd" in body["description"]
    assert "604-555-1234" in body["description"]
    assert "https://abcplumbing.ca" in body["description"]


@responses.activate
def test_create_task_includes_custom_fields(clickup_config, sample_prospect):
    responses.add(
        responses.POST,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={"id": "task_abc123"},
        status=200,
    )

    client = ClickUpClient(clickup_config)
    client.create_task(sample_prospect)

    body = json.loads(responses.calls[0].request.body)
    fields_by_id = {f["id"]: f["value"] for f in body["custom_fields"]}
    assert fields_by_id["field_seg_id"] == "business"
    assert fields_by_id["field_cat_id"] == "Trades & Contractors"
    assert fields_by_id["field_web_id"] == "https://abcplumbing.ca"
    assert fields_by_id["field_src_id"] == "plumbing company Surrey BC"


@responses.activate
def test_create_task_without_custom_fields(clickup_config_no_fields, sample_prospect):
    responses.add(
        responses.POST,
        f"{CLICKUP_BASE}/list/{clickup_config_no_fields.list_id}/task",
        json={"id": "task_abc123"},
        status=200,
    )

    client = ClickUpClient(clickup_config_no_fields)
    client.create_task(sample_prospect)

    body = json.loads(responses.calls[0].request.body)
    assert "custom_fields" not in body


@responses.activate
def test_create_task_with_missing_optional_fields(clickup_config):
    responses.add(
        responses.POST,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={"id": "task_xyz"},
        status=200,
    )

    prospect = Prospect(
        name="Minimal Business",
        segment=Segment.BUSINESS,
        category="Trades & Contractors",
        source_query="test query",
    )

    client = ClickUpClient(clickup_config)
    task_id = client.create_task(prospect)

    assert task_id == "task_xyz"
    body = json.loads(responses.calls[0].request.body)
    assert "N/A" in body["description"]


@responses.activate
def test_create_task_sets_auth_header(clickup_config, sample_prospect):
    responses.add(
        responses.POST,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={"id": "task_abc123"},
        status=200,
    )

    client = ClickUpClient(clickup_config)
    client.create_task(sample_prospect)

    assert responses.calls[0].request.headers["Authorization"] == "pk_test_token"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/clients/test_clickup.py -v
```

Expected: `ModuleNotFoundError: No module named 'leadgen.clients.clickup'`

- [ ] **Step 3: Implement ClickUp client create_task**

Create `pipeline/src/leadgen/clients/clickup.py`:

```python
import logging

import requests

from leadgen.config import ClickUpConfig
from leadgen.models import Prospect

logger = logging.getLogger(__name__)

BASE_URL = "https://api.clickup.com/api/v2"


class ClickUpClient:
    def __init__(self, config: ClickUpConfig):
        self.config = config

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": self.config.api_token,
            "Content-Type": "application/json",
        }

    def create_task(self, prospect: Prospect) -> str:
        description = (
            f"**Address:** {prospect.address or 'N/A'}\n"
            f"**Phone:** {prospect.phone or 'N/A'}\n"
            f"**Website:** {prospect.website or 'N/A'}\n"
            f"**Category:** {prospect.category}\n"
            f"**Source:** {prospect.source_query}"
        )

        payload: dict = {
            "name": prospect.name,
            "description": description,
            "status": prospect.status.value,
        }

        field_values = {
            "segment": prospect.segment.value,
            "category": prospect.category,
            "website": prospect.website or "",
            "source_query": prospect.source_query,
        }
        custom_fields = [
            {"id": field_id, "value": field_values[name]}
            for name, field_id in self.config.field_ids.items()
            if name in field_values
        ]
        if custom_fields:
            payload["custom_fields"] = custom_fields

        resp = requests.post(
            f"{BASE_URL}/list/{self.config.list_id}/task",
            headers=self._headers(),
            json=payload,
        )
        resp.raise_for_status()
        task_id = resp.json()["id"]
        logger.info("Created ClickUp task %s for %s", task_id, prospect.name)
        return task_id
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/clients/test_clickup.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/leadgen/clients/clickup.py pipeline/tests/clients/test_clickup.py
git commit -m "feat(pipeline): add ClickUp client with task creation"
```

---

### Task 5: ClickUp Client — List Tasks + Dedup

**Files:**
- Modify: `pipeline/src/leadgen/clients/clickup.py` — add `get_all_task_names`
- Modify: `pipeline/tests/clients/test_clickup.py` — add listing/pagination tests

- [ ] **Step 1: Write failing tests for task listing and dedup**

Append to `pipeline/tests/clients/test_clickup.py`:

```python
@responses.activate
def test_get_all_task_names_single_page(clickup_config):
    responses.add(
        responses.GET,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={
            "tasks": [
                {"name": "ABC Plumbing"},
                {"name": "XYZ Electric"},
            ],
            "last_page": True,
        },
        status=200,
    )

    client = ClickUpClient(clickup_config)
    names = client.get_all_task_names()

    assert names == {"abc plumbing", "xyz electric"}


@responses.activate
def test_get_all_task_names_handles_pagination(clickup_config):
    responses.add(
        responses.GET,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={
            "tasks": [{"name": "ABC Plumbing"}],
            "last_page": False,
        },
        status=200,
    )
    responses.add(
        responses.GET,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={
            "tasks": [{"name": "XYZ Electric"}],
            "last_page": True,
        },
        status=200,
    )

    client = ClickUpClient(clickup_config)
    names = client.get_all_task_names()

    assert names == {"abc plumbing", "xyz electric"}
    assert len(responses.calls) == 2


@responses.activate
def test_get_all_task_names_empty_list(clickup_config):
    responses.add(
        responses.GET,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={"tasks": [], "last_page": True},
        status=200,
    )

    client = ClickUpClient(clickup_config)
    names = client.get_all_task_names()

    assert names == set()


@responses.activate
def test_get_all_task_names_normalizes_whitespace(clickup_config):
    responses.add(
        responses.GET,
        f"{CLICKUP_BASE}/list/{clickup_config.list_id}/task",
        json={
            "tasks": [{"name": "  ABC Plumbing  "}],
            "last_page": True,
        },
        status=200,
    )

    client = ClickUpClient(clickup_config)
    names = client.get_all_task_names()

    assert "abc plumbing" in names
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/clients/test_clickup.py::test_get_all_task_names_single_page -v
```

Expected: `AttributeError: 'ClickUpClient' object has no attribute 'get_all_task_names'`

- [ ] **Step 3: Implement get_all_task_names**

Add to `pipeline/src/leadgen/clients/clickup.py` inside the `ClickUpClient` class:

```python
    def get_all_task_names(self) -> set[str]:
        names: set[str] = set()
        page = 0
        while True:
            resp = requests.get(
                f"{BASE_URL}/list/{self.config.list_id}/task",
                headers=self._headers(),
                params={"page": page, "include_closed": "true"},
            )
            resp.raise_for_status()
            data = resp.json()
            for task in data["tasks"]:
                names.add(task["name"].strip().lower())
            if data.get("last_page", True):
                break
            page += 1
        logger.info("Fetched %d existing task names from ClickUp", len(names))
        return names
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/clients/test_clickup.py -v
```

Expected: all 10 tests PASS (6 create + 4 listing).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/leadgen/clients/clickup.py pipeline/tests/clients/test_clickup.py
git commit -m "feat(pipeline): add ClickUp task listing with pagination for dedup"
```

---

### Task 6: Firecrawl Client — Google Maps Scraping

**Files:**
- Create: `pipeline/src/leadgen/clients/firecrawl_client.py`
- Create: `pipeline/tests/clients/test_firecrawl.py`

- [ ] **Step 1: Write failing tests for Firecrawl scraping**

Create `pipeline/tests/clients/test_firecrawl.py`:

```python
import json

import responses

from leadgen.clients.firecrawl_client import FirecrawlClient


FIRECRAWL_BASE = "https://api.firecrawl.dev"


@responses.activate
def test_scrape_google_maps_returns_businesses(firecrawl_config):
    responses.add(
        responses.POST,
        f"{FIRECRAWL_BASE}/v1/scrape",
        json={
            "success": True,
            "data": {
                "extract": {
                    "businesses": [
                        {
                            "name": "ABC Plumbing",
                            "address": "123 Main St, Surrey, BC",
                            "phone": "604-555-1234",
                            "website": "https://abcplumbing.ca",
                        },
                        {
                            "name": "XYZ Plumbing",
                            "address": "456 Oak Ave, Surrey, BC",
                        },
                    ]
                }
            },
        },
        status=200,
    )

    client = FirecrawlClient(firecrawl_config)
    results = client.scrape_google_maps("plumbing company", "Surrey BC")

    assert len(results) == 2
    assert results[0]["name"] == "ABC Plumbing"
    assert results[0]["website"] == "https://abcplumbing.ca"
    assert results[1]["name"] == "XYZ Plumbing"


@responses.activate
def test_scrape_google_maps_constructs_correct_url(firecrawl_config):
    responses.add(
        responses.POST,
        f"{FIRECRAWL_BASE}/v1/scrape",
        json={"success": True, "data": {"extract": {"businesses": []}}},
        status=200,
    )

    client = FirecrawlClient(firecrawl_config)
    client.scrape_google_maps("plumbing company", "Surrey BC")

    body = json.loads(responses.calls[0].request.body)
    assert "google.com/maps/search" in body["url"]
    assert "plumbing" in body["url"]
    assert "Surrey" in body["url"]
    assert body["formats"] == ["extract"]
    assert "schema" in body["extract"]


@responses.activate
def test_scrape_google_maps_sets_auth_header(firecrawl_config):
    responses.add(
        responses.POST,
        f"{FIRECRAWL_BASE}/v1/scrape",
        json={"success": True, "data": {"extract": {"businesses": []}}},
        status=200,
    )

    client = FirecrawlClient(firecrawl_config)
    client.scrape_google_maps("test", "Test BC")

    assert responses.calls[0].request.headers["Authorization"] == "Bearer fc-test-key"


@responses.activate
def test_scrape_google_maps_empty_results(firecrawl_config):
    responses.add(
        responses.POST,
        f"{FIRECRAWL_BASE}/v1/scrape",
        json={"success": True, "data": {"extract": {"businesses": []}}},
        status=200,
    )

    client = FirecrawlClient(firecrawl_config)
    results = client.scrape_google_maps("nonexistent thing", "Nowhere BC")

    assert results == []


@responses.activate
def test_scrape_google_maps_handles_failed_scrape(firecrawl_config):
    responses.add(
        responses.POST,
        f"{FIRECRAWL_BASE}/v1/scrape",
        json={"success": False, "error": "Page not accessible"},
        status=200,
    )

    client = FirecrawlClient(firecrawl_config)
    results = client.scrape_google_maps("test", "Test BC")

    assert results == []


@responses.activate
def test_scrape_google_maps_handles_missing_extract_key(firecrawl_config):
    responses.add(
        responses.POST,
        f"{FIRECRAWL_BASE}/v1/scrape",
        json={"success": True, "data": {}},
        status=200,
    )

    client = FirecrawlClient(firecrawl_config)
    results = client.scrape_google_maps("test", "Test BC")

    assert results == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/clients/test_firecrawl.py -v
```

Expected: `ModuleNotFoundError: No module named 'leadgen.clients.firecrawl_client'`

- [ ] **Step 3: Implement Firecrawl client**

Create `pipeline/src/leadgen/clients/firecrawl_client.py`:

```python
import logging
from urllib.parse import quote

import requests

from leadgen.config import FirecrawlConfig

logger = logging.getLogger(__name__)

BASE_URL = "https://api.firecrawl.dev"

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "businesses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Business name"},
                    "address": {"type": "string", "description": "Full street address"},
                    "phone": {"type": "string", "description": "Phone number"},
                    "website": {"type": "string", "description": "Website URL"},
                },
                "required": ["name"],
            },
        },
    },
    "required": ["businesses"],
}


class FirecrawlClient:
    def __init__(self, config: FirecrawlConfig):
        self.config = config

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }

    def scrape_google_maps(self, query: str, location: str) -> list[dict]:
        search_term = f"{query} {location}"
        url = f"https://www.google.com/maps/search/{quote(search_term)}"

        resp = requests.post(
            f"{BASE_URL}/v1/scrape",
            headers=self._headers(),
            json={
                "url": url,
                "formats": ["extract"],
                "extract": {"schema": EXTRACTION_SCHEMA},
            },
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("success"):
            logger.warning("Firecrawl scrape failed for %s: %s", search_term, data.get("error"))
            return []

        businesses = data.get("data", {}).get("extract", {}).get("businesses", [])
        logger.info("Scraped %d businesses for '%s'", len(businesses), search_term)
        return businesses
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/clients/test_firecrawl.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/leadgen/clients/firecrawl_client.py pipeline/tests/clients/test_firecrawl.py
git commit -m "feat(pipeline): add Firecrawl client with Google Maps LLM extraction"
```

---

### Task 7: Discover Agent

**Files:**
- Create: `pipeline/src/leadgen/agents/discover.py`
- Create: `pipeline/tests/agents/test_discover.py`

- [ ] **Step 1: Write failing tests for the discover agent**

Create `pipeline/tests/agents/test_discover.py`:

```python
from unittest.mock import MagicMock

from leadgen.agents.discover import DiscoverAgent
from leadgen.config import SearchQuery
from leadgen.models import Segment


def _make_agent(existing_names=None, scrape_results=None, scrape_error=None, create_error=None):
    clickup = MagicMock()
    clickup.get_all_task_names.return_value = existing_names or set()
    if create_error:
        clickup.create_task.side_effect = create_error
    else:
        clickup.create_task.return_value = "task_123"

    firecrawl = MagicMock()
    if scrape_error:
        firecrawl.scrape_google_maps.side_effect = scrape_error
    else:
        firecrawl.scrape_google_maps.return_value = scrape_results or []

    return DiscoverAgent(clickup, firecrawl, [
        SearchQuery(query="plumbing", location="Surrey BC", segment=Segment.BUSINESS, category="Trades"),
    ]), clickup, firecrawl


def test_discover_creates_new_leads():
    agent, clickup, _ = _make_agent(scrape_results=[
        {"name": "ABC Plumbing", "address": "123 Main St", "phone": "604-555-1234"},
        {"name": "XYZ Electric", "address": "456 Oak Ave"},
    ])

    result = agent.run()

    assert result.total_scraped == 2
    assert result.new_leads_created == 2
    assert result.duplicates_skipped == 0
    assert result.errors == []
    assert clickup.create_task.call_count == 2


def test_discover_skips_existing_duplicates():
    agent, clickup, _ = _make_agent(
        existing_names={"abc plumbing"},
        scrape_results=[
            {"name": "ABC Plumbing", "address": "123 Main St"},
            {"name": "New Business", "address": "789 Elm St"},
        ],
    )

    result = agent.run()

    assert result.total_scraped == 2
    assert result.duplicates_skipped == 1
    assert result.new_leads_created == 1
    assert clickup.create_task.call_count == 1


def test_discover_skips_empty_names():
    agent, clickup, _ = _make_agent(scrape_results=[
        {"name": "", "address": "123 Main St"},
        {"name": "   ", "address": "456 Oak Ave"},
        {"name": "Valid Business", "address": "789 Elm St"},
    ])

    result = agent.run()

    assert result.new_leads_created == 1
    assert clickup.create_task.call_count == 1


def test_discover_handles_scrape_error_gracefully():
    agent, clickup, _ = _make_agent(scrape_error=Exception("Firecrawl API error"))

    result = agent.run()

    assert result.total_scraped == 0
    assert result.new_leads_created == 0
    assert len(result.errors) == 1
    assert "Firecrawl API error" in result.errors[0]
    clickup.create_task.assert_not_called()


def test_discover_handles_clickup_create_error_gracefully():
    agent, _, _ = _make_agent(
        scrape_results=[{"name": "ABC Plumbing", "address": "123 Main St"}],
        create_error=Exception("ClickUp API error"),
    )

    result = agent.run()

    assert result.total_scraped == 1
    assert result.new_leads_created == 0
    assert len(result.errors) == 1
    assert "ClickUp API error" in result.errors[0]


def test_discover_deduplicates_across_queries():
    clickup = MagicMock()
    clickup.get_all_task_names.return_value = set()
    clickup.create_task.return_value = "task_123"

    firecrawl = MagicMock()
    firecrawl.scrape_google_maps.return_value = [
        {"name": "Same Business", "address": "123 St"},
    ]

    queries = [
        SearchQuery(query="plumbing", location="Surrey BC", segment=Segment.BUSINESS, category="Trades"),
        SearchQuery(query="contractor", location="Surrey BC", segment=Segment.BUSINESS, category="Trades"),
    ]

    agent = DiscoverAgent(clickup, firecrawl, queries)
    result = agent.run()

    assert result.total_scraped == 2
    assert result.new_leads_created == 1
    assert result.duplicates_skipped == 1
    assert clickup.create_task.call_count == 1


def test_discover_assigns_correct_segment_and_category():
    clickup = MagicMock()
    clickup.get_all_task_names.return_value = set()
    clickup.create_task.return_value = "task_123"

    firecrawl = MagicMock()
    firecrawl.scrape_google_maps.return_value = [
        {"name": "Some School", "address": "100 School Rd"},
    ]

    queries = [
        SearchQuery(query="elementary school", location="Langley BC", segment=Segment.SCHOOL, category="Elementary & Secondary"),
    ]

    agent = DiscoverAgent(clickup, firecrawl, queries)
    agent.run()

    created_prospect = clickup.create_task.call_args[0][0]
    assert created_prospect.segment == Segment.SCHOOL
    assert created_prospect.category == "Elementary & Secondary"
    assert created_prospect.source_query == "elementary school Langley BC"


def test_discover_with_no_results():
    agent, clickup, _ = _make_agent(scrape_results=[])

    result = agent.run()

    assert result.total_scraped == 0
    assert result.new_leads_created == 0
    assert result.duplicates_skipped == 0
    assert result.errors == []
    clickup.create_task.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/agents/test_discover.py -v
```

Expected: `ModuleNotFoundError: No module named 'leadgen.agents.discover'`

- [ ] **Step 3: Implement the Discover agent**

Create `pipeline/src/leadgen/agents/discover.py`:

```python
import logging

from leadgen.clients.clickup import ClickUpClient
from leadgen.clients.firecrawl_client import FirecrawlClient
from leadgen.config import SearchQuery
from leadgen.models import DiscoverResult, Prospect

logger = logging.getLogger(__name__)


class DiscoverAgent:
    def __init__(
        self,
        clickup: ClickUpClient,
        firecrawl: FirecrawlClient,
        queries: list[SearchQuery],
    ):
        self.clickup = clickup
        self.firecrawl = firecrawl
        self.queries = queries

    def run(self) -> DiscoverResult:
        existing_names = self.clickup.get_all_task_names()
        total_scraped = 0
        duplicates_skipped = 0
        new_leads_created = 0
        errors: list[str] = []

        for query in self.queries:
            try:
                raw_results = self.firecrawl.scrape_google_maps(query.query, query.location)
            except Exception as exc:
                msg = f"Scrape failed for '{query.query} {query.location}': {exc}"
                logger.error(msg)
                errors.append(msg)
                continue

            total_scraped += len(raw_results)

            for biz in raw_results:
                name = biz.get("name", "").strip()
                if not name:
                    continue

                if name.lower() in existing_names:
                    duplicates_skipped += 1
                    continue

                prospect = Prospect(
                    name=name,
                    address=biz.get("address"),
                    phone=biz.get("phone"),
                    website=biz.get("website"),
                    segment=query.segment,
                    category=query.category,
                    source_query=f"{query.query} {query.location}",
                )

                try:
                    self.clickup.create_task(prospect)
                    new_leads_created += 1
                    existing_names.add(name.lower())
                except Exception as exc:
                    msg = f"Failed to create ClickUp task for '{name}': {exc}"
                    logger.error(msg)
                    errors.append(msg)

        logger.info(
            "Discover complete: scraped=%d dupes=%d new=%d errors=%d",
            total_scraped, duplicates_skipped, new_leads_created, len(errors),
        )
        return DiscoverResult(
            total_scraped=total_scraped,
            duplicates_skipped=duplicates_skipped,
            new_leads_created=new_leads_created,
            errors=errors,
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest tests/agents/test_discover.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest -v
```

Expected: all 31 tests PASS (7 model + 7 config + 10 clickup + 6 firecrawl + 8 discover — some totals may differ based on final test count, but zero failures).

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/leadgen/agents/discover.py pipeline/tests/agents/test_discover.py
git commit -m "feat(pipeline): add Discover agent — scrape, dedup, push to ClickUp"
```

---

### Task 8: Cloud Function Entry Point

**Files:**
- Create: `pipeline/functions.py`

This is a thin wrapper that wires config → clients → agent. The agent logic is fully tested in Task 7. No separate unit test needed for the entry point — it would only test that Python can call a function.

- [ ] **Step 1: Write the Cloud Function entry point**

Create `pipeline/functions.py`:

```python
import json
import logging

import functions_framework

from leadgen.agents.discover import DiscoverAgent
from leadgen.clients.clickup import ClickUpClient
from leadgen.clients.firecrawl_client import FirecrawlClient
from leadgen.config import load_discover_config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@functions_framework.http
def discover(request):
    logger.info("Discover agent triggered")
    config = load_discover_config()
    clickup = ClickUpClient(config.clickup)
    firecrawl = FirecrawlClient(config.firecrawl)
    agent = DiscoverAgent(clickup, firecrawl, config.search_queries)

    result = agent.run()

    logger.info(
        "Discover complete: scraped=%d dupes=%d new=%d errors=%d",
        result.total_scraped,
        result.duplicates_skipped,
        result.new_leads_created,
        len(result.errors),
    )
    return (
        json.dumps(result.model_dump()),
        200,
        {"Content-Type": "application/json"},
    )
```

- [ ] **Step 2: Verify the entry point is importable**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
python -c "from functions import discover; print('OK')"
```

Expected: prints `OK` with no errors.

- [ ] **Step 3: Test locally with functions-framework**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
# This verifies the function registers correctly (will fail on actual execution without env vars, which is expected)
functions-framework --target discover --dry-run 2>&1 || echo "dry-run not supported; that's fine"
```

- [ ] **Step 4: Run full test suite one final time**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
pytest -v
```

Expected: all tests PASS. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add pipeline/functions.py
git commit -m "feat(pipeline): add Cloud Function entry point for Discover agent"
```

---

## Plan 2-5 Outlines

### Plan 2: Enrich Agent

**Scope:** Build the Stage 2 agent that takes "New" leads from ClickUp, scrapes their website via Firecrawl, finds decision-maker emails via Hunter.io, scores leads 1-5 with Gemini, and updates ClickUp.

**New files:**
- `pipeline/src/leadgen/clients/hunter.py` — Hunter.io API client (email finder, email verifier)
- `pipeline/src/leadgen/clients/gemini.py` — Gemini 2.5 Flash client (lead scoring prompt, data parsing)
- `pipeline/src/leadgen/agents/enrich.py` — Orchestrates: fetch "New" tasks → scrape websites → find emails → score with LLM → update ClickUp to "Enriched" or "Parked"
- `pipeline/functions.py` — Add `enrich` entry point
- Tests for all of the above

**Key decisions:**
- Scoring prompt needs the 1-5 criteria from the design spec
- Leads scoring 1-2 get status "Parked", 3+ get "Enriched"
- ClickUp client gets a new `update_task` method and `get_tasks_by_status` method

### Plan 3: Personalize Agent

**Scope:** Build the Stage 3 agent that takes "Enriched" 3+ leads and generates personalized email sequences + LinkedIn connection request copy using Gemini.

**New files:**
- `pipeline/src/leadgen/agents/personalize.py` — Generates 3-touch email sequence + LinkedIn note per lead
- `pipeline/src/leadgen/templates/` — Segment-specific base templates (business, school, team)
- Tests for all of the above

**Key decisions:**
- Template structure: segment base + 3 personalization layers (context, relevance, community)
- Output format: 3 emails (subject + body each) + 1 LinkedIn note, stored in ClickUp task
- ClickUp status moves from "Enriched" to "Ready for Review"

### Plan 4: Outreach Agent

**Scope:** Build the Stage 4 agent that takes "Approved" messages and sends them via Instantly, then tracks engagement.

**New files:**
- `pipeline/src/leadgen/clients/instantly.py` — Instantly API client (campaign management, lead addition, analytics)
- `pipeline/src/leadgen/agents/outreach.py` — Sends approved emails, tracks opens/replies, flags warm leads
- Tests for all of the above

**Key decisions:**
- Instantly API integration for adding leads to campaigns and tracking engagement
- ClickUp status moves: "Approved" → "Outreach Active" → "Responded" (on reply)
- Follow-up timing: Touch 2 at Day 4, Touch 3 at Day 9 (handled by Instantly sequences)
- No response after Touch 3: status → "Dormant" after 90 days

### Plan 5: Deployment & Configuration

**Scope:** Deploy everything to Google Cloud, configure ClickUp workspace, set up Instantly, configure Cloud Scheduler.

**Blocked on:** Client completing account setup (ClickUp, Instantly, Hunter.io, Firecrawl, Google Cloud).

**Key tasks:**
- ClickUp workspace setup: create Space, List, Statuses (New/Enriched/Parked/Ready for Review/Approved/Outreach Active/Responded/Dormant/Converted), custom fields (segment, category, website, source_query, contact_name, contact_email, contact_role, linkedin_url, fit_score, enrichment_notes, email_sequence, linkedin_message)
- Deploy 4 Cloud Functions to GCP
- Configure Cloud Scheduler: Discover weekly (Sunday 6am PT), Enrich/Personalize/Send daily (8am PT)
- Instantly: create campaign, configure warmup, add sending email (jay@shopjaydees.com)
- Set all environment variables in Cloud Functions
- End-to-end integration testing with live APIs
- Owner walkthrough of ClickUp approval workflow
