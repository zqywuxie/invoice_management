"""
Lightweight project env-file loader.

This keeps local development dependency-free while allowing different
runtime config files for local and server deployments.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Optional


_LOADED_ENV_FILE: Optional[str] = None


def _candidate_files(app_env: str) -> Iterable[str]:
    if app_env:
        return (f".env.{app_env}", ".env")
    return (".env.local", ".env.server", ".env")


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _parse_env_line(line: str) -> Optional[tuple[str, str]]:
    content = line.strip()
    if not content or content.startswith("#"):
        return None
    if content.startswith("export "):
        content = content[7:].strip()
    if "=" not in content:
        return None

    key, value = content.split("=", 1)
    key = key.strip()
    if not key:
        return None
    return key, _strip_quotes(value.strip())


def load_project_env(project_root: str | None = None, override: bool = False) -> Optional[str]:
    """
    Load environment variables from the first matching project env file.

    Resolution order:
      1. ENV_FILE, if explicitly provided
      2. .env.<APP_ENV>, then .env
      3. .env.local, .env.server, .env

    Existing process env vars win unless override=True.
    """
    global _LOADED_ENV_FILE

    if _LOADED_ENV_FILE:
        return _LOADED_ENV_FILE

    root = Path(project_root or Path(__file__).resolve().parent.parent)
    explicit_env_file = os.environ.get("ENV_FILE", "").strip()
    app_env = os.environ.get("APP_ENV", "").strip().lower()

    if explicit_env_file:
        candidates = [explicit_env_file]
    else:
        candidates = list(_candidate_files(app_env))

    for candidate in candidates:
        env_path = Path(candidate)
        if not env_path.is_absolute():
            env_path = root / env_path
        if not env_path.exists() or not env_path.is_file():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_env_line(raw_line)
            if parsed is None:
                continue
            key, value = parsed
            if override or key not in os.environ:
                os.environ[key] = value

        _LOADED_ENV_FILE = str(env_path)
        return _LOADED_ENV_FILE

    return None


def get_loaded_env_file() -> Optional[str]:
    return _LOADED_ENV_FILE
