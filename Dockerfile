FROM python:3.12-slim

WORKDIR /app

# uv 설치
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 의존성 파일 복사
COPY pyproject.toml uv.lock ./

# 프로젝트 의존성 설치
RUN uv sync --frozen --no-install-project

# 소스 코드 복사
COPY server ./server

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "server.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
