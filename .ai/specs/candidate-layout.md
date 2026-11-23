
my_ai_app/
│
├── src/
│   ├── __init__.py
│   │
│   ├── domain/               # Enterprise business rules (Entities, Value Objects, Aggregates)
│   │   ├── __init__.py
│   │   ├── models.py         # Pure Python dataclasses or Pydantic models (no DB markers)
│   │   └── exceptions.py     # Domain-specific errors (e.g., PromptTooLongException)
│   │
│   ├── usecases/             # Application-specific business rules (Interactors)
│   │   ├── __init__.py
│   │   ├── ports/            # Interfaces for external dependencies (Inversion of Control)
│   │   │   ├── llm_service.py
│   │   │   └── repository.py
│   │   ├── generate_summary.py
│   │   └── process_rag_query.py
│   │
│   ├── infrastructure/       # External tools, databases, frameworks, and third-party APIs
│   │   ├── __init__.py
│   │   ├── database/         # SQLALchemy, Tortoise, or Mongo adapters
│   │   │   ├── models.py     # Database schemas / ORM models
│   │   │   └── repositories.py # Implementation of usecases/ports/repository.py
│   │   ├── services/         # Adapters for APIs
│   │   │   ├── openai_service.py # Implementation of usecases/ports/llm_service.py
│   │   │   └── gemini_service.py
│   │   └── config.py         # Environment variables and settings
│   │
│   └── presentation/         # Interface adapters (Web API endpoints, CLI, WebSockets)
│       ├── __init__.py
│       ├── api/
│       │   ├── v1/
│       │   │   ├── endpoints.py
│       │   │   └── router.py
│       │   └── schemas.py      # HTTP request/response payloads
│       └── middlewares.py
│
├── tests/                    # Mirroring the src/ directory structure
│   ├── unit/                 # Tests domain and usecases (100% mocked, lightning fast)
│   └── integration/          # Tests infrastructure and presentation layers
│
├── main.py                   # App entrypoint (Composition Root)
├── requirements.txt
└── README.md
