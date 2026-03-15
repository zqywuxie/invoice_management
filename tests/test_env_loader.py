import importlib
import os

import src.env_loader as env_loader


def _reload_env_loader():
    return importlib.reload(env_loader)


def _mock_env_files(monkeypatch, loader, files):
    def fake_exists(self):
        return str(self) in files

    def fake_is_file(self):
        return str(self) in files

    def fake_read_text(self, encoding="utf-8"):
        return files[str(self)]

    monkeypatch.setattr(loader.Path, "exists", fake_exists)
    monkeypatch.setattr(loader.Path, "is_file", fake_is_file)
    monkeypatch.setattr(loader.Path, "read_text", fake_read_text)


def test_load_project_env_prefers_explicit_env_file(monkeypatch):
    project_root = "project_root"

    monkeypatch.setenv("ENV_FILE", "custom.env")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    loader = _reload_env_loader()
    root_path = loader.Path(project_root)
    local_path = str(root_path / ".env.local")
    custom_path = str(root_path / "custom.env")
    _mock_env_files(
        monkeypatch,
        loader,
        {
            local_path: "DATABASE_URL=sqlite:///data/local.db\n",
            custom_path: "DATABASE_URL=sqlite:///data/custom.db\n",
        },
    )
    loaded = loader.load_project_env(project_root)

    assert loaded == custom_path
    assert os.environ["DATABASE_URL"] == "sqlite:///data/custom.db"


def test_load_project_env_prefers_local_file(monkeypatch):
    project_root = "project_root"

    monkeypatch.delenv("ENV_FILE", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    loader = _reload_env_loader()
    root_path = loader.Path(project_root)
    local_path = str(root_path / ".env.local")
    server_path = str(root_path / ".env.server")
    _mock_env_files(
        monkeypatch,
        loader,
        {
            local_path: "DATABASE_URL=sqlite:///data/local.db\n",
            server_path: "DATABASE_URL=postgresql://user:pass@host:5432/db\n",
        },
    )
    loaded = loader.load_project_env(project_root)

    assert loaded == local_path
    assert os.environ["DATABASE_URL"] == "sqlite:///data/local.db"


def test_load_project_env_does_not_override_existing_env(monkeypatch):
    project_root = "project_root"

    monkeypatch.delenv("ENV_FILE", raising=False)
    monkeypatch.setenv("DATABASE_URL", "sqlite:///data/from-process.db")

    loader = _reload_env_loader()
    root_path = loader.Path(project_root)
    _mock_env_files(
        monkeypatch,
        loader,
        {
            str(root_path / ".env.local"): "DATABASE_URL=sqlite:///data/from-file.db\n",
        },
    )
    loader.load_project_env(project_root)

    assert os.environ["DATABASE_URL"] == "sqlite:///data/from-process.db"
