from __future__ import annotations

import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, abort, jsonify, request, send_file, send_from_directory


BASE_DIR = Path(__file__).resolve().parent.parent / "scripts" / "uscoa-automation"
UI_DIR = BASE_DIR / "visual-ui"
OUTPUT_DIR = BASE_DIR / ".output"
GUIDES_DIR = OUTPUT_DIR / "guides"
FORMS_DIR = OUTPUT_DIR / "forms"
UPLOADS_DIR = OUTPUT_DIR / "ui_uploads"

DEFAULT_STAMP_OPTIONS = ["学校党委章", "学校行政章", "党委书记印", "校长印", "学校钢印", "合同用印"]
DEFAULT_GUIDE = {
    "guideKey": "科研事项用印",
    "title": "温馨提示",
    "sectionTitle": "科研部相关业务负责人信息如下",
    "responsibles": [
        {"category": "自科基金类项目（含国自、省自、实验室开放基金）", "owner": "吴喜军"},
        {"category": "自科纵向非基金类项目（校科研启动经费、重点研发、教育厅等）", "owner": "邓湘元"},
        {"category": "国防军工类项目", "owner": "贾非"},
        {"category": "横向科研项目", "owner": "解金柯"},
        {"category": "社科类项目", "owner": "谭文丽"},
        {"category": "科研平台、科技奖励", "owner": "戴兵"},
        {"category": "专利、软著等知识产权申报", "owner": "夏月辉"},
    ],
}
ATTACHMENT_EXTENSIONS = {
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "jpg",
    "jpeg",
    "png",
    "zip",
    "rar",
    "7z",
}
ATTACHMENT_MAX_COUNT = 10
ATTACHMENT_MAX_FILE_MB = 20
ATTACHMENT_MAX_TOTAL_MB = 100
RUN_TIMEOUT_SECONDS = 420


app = Flask(__name__, static_folder=str(UI_DIR), static_url_path="/static")


def _safe_read_json(file_path: Path) -> dict[str, Any]:
    if not file_path.exists():
        return {}
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _build_meta() -> dict[str, Any]:
    guide_data = dict(DEFAULT_GUIDE)
    guide_data.update(_safe_read_json(GUIDES_DIR / "usc_yzgl_kyyy_guide.json"))

    form_data = _safe_read_json(FORMS_DIR / "usc_yzgl_kyyy_form.json")
    stamp_options = form_data.get("stampOptions") or [{"label": value, "checked": False} for value in DEFAULT_STAMP_OPTIONS]

    return {
        "guide": guide_data,
        "form_template": {
            "defaultAction": "save_draft",
            "availableActions": ["fill_only", "save_draft"],
            "stamp_options": stamp_options,
            "attachment_constraints": {
                "max_count": ATTACHMENT_MAX_COUNT,
                "max_file_size_mb": ATTACHMENT_MAX_FILE_MB,
                "max_total_size_mb": ATTACHMENT_MAX_TOTAL_MB,
                "max_file_size_bytes": ATTACHMENT_MAX_FILE_MB * 1024 * 1024,
                "max_total_size_bytes": ATTACHMENT_MAX_TOTAL_MB * 1024 * 1024,
                "allowed_extensions": sorted(ATTACHMENT_EXTENSIONS),
                "accept": ",".join(f".{item}" for item in sorted(ATTACHMENT_EXTENSIONS)),
            },
        },
    }


def _validate_payload(data: dict[str, Any]) -> None:
    if not str(data.get("subject", "")).strip():
        raise ValueError("申办内容不能为空")
    seal_types = data.get("seal_types") or []
    if not seal_types:
        raise ValueError("至少选择一种用印类型")
    if not str(data.get("description", "")).strip():
        raise ValueError("事项说明不能为空")
    if not str(data.get("phone", "")).strip():
        raise ValueError("联系电话不能为空")
    action = data.get("action", "save_draft")
    if action not in {"fill_only", "save_draft"}:
        raise ValueError("action 仅支持 fill_only 或 save_draft")
    if data.get("attachments") and action != "save_draft":
        raise ValueError("上传附件时仅支持 save_draft")


def _sanitize_filename(value: str) -> str:
    invalid_chars = '<>:"/\\|?*'
    cleaned = "".join("_" if ch in invalid_chars or ord(ch) < 32 else ch for ch in value).strip().strip(". ")
    return cleaned or f"attachment_{uuid.uuid4().hex}.dat"


def _ensure_unique_path(target: Path) -> Path:
    if not target.exists():
        return target
    index = 1
    while True:
        candidate = target.with_name(f"{target.stem}_{index}{target.suffix}")
        if not candidate.exists():
            return candidate
        index += 1


def _store_attachments(files: list[Any]) -> list[dict[str, Any]]:
    selected = [item for item in files if getattr(item, "filename", "")]
    if not selected:
        return []
    if len(selected) > ATTACHMENT_MAX_COUNT:
        raise ValueError(f"附件数量不能超过 {ATTACHMENT_MAX_COUNT} 个")

    run_dir = UPLOADS_DIR / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    run_dir.mkdir(parents=True, exist_ok=True)

    max_file_bytes = ATTACHMENT_MAX_FILE_MB * 1024 * 1024
    max_total_bytes = ATTACHMENT_MAX_TOTAL_MB * 1024 * 1024
    total_size = 0
    stored: list[dict[str, Any]] = []

    for storage in selected:
        original_name = str(storage.filename).strip()
        ext = Path(original_name).suffix.lower().lstrip(".")
        if ext not in ATTACHMENT_EXTENSIONS:
            raise ValueError(f"附件格式不支持: {original_name}")

        file_name = _sanitize_filename(original_name)
        target = _ensure_unique_path(run_dir / file_name)
        storage.save(str(target))
        size = target.stat().st_size
        if size > max_file_bytes:
            target.unlink(missing_ok=True)
            raise ValueError(f"附件过大: {original_name}，单个不能超过 {ATTACHMENT_MAX_FILE_MB} MB")
        if total_size + size > max_total_bytes:
            target.unlink(missing_ok=True)
            raise ValueError(f"附件总大小不能超过 {ATTACHMENT_MAX_TOTAL_MB} MB")

        total_size += size
        stored.append({"name": original_name, "path": str(target), "size": size})

    return stored


def _extract_json_payload(stdout: str) -> dict[str, Any] | None:
    if not stdout:
        return None
    start = stdout.find("{")
    end = stdout.rfind("}")
    if start < 0 or end <= start:
        return None
    snippet = stdout[start : end + 1]
    try:
        return json.loads(snippet)
    except json.JSONDecodeError:
        return None


def _collect_recent_artifacts() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if not OUTPUT_DIR.exists():
        return records
    for pattern in ("last-page.png", "last-page.html", "last-page.json", "forms/*.json", "guides/*.json", "attachments/*.json"):
        for path in OUTPUT_DIR.glob(pattern):
            if not path.is_file():
                continue
            rel = path.relative_to(OUTPUT_DIR).as_posix()
            records.append(
                {
                    "name": rel,
                    "url": f"/output/{rel}",
                    "size": path.stat().st_size,
                    "updated_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
                }
            )
    records.sort(key=lambda item: item["updated_at"], reverse=True)
    return records[:40]


def _run_autofill(payload: dict[str, Any], headful: bool) -> dict[str, Any]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, dir=str(BASE_DIR), encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            temp_path = handle.name

        command = [os.environ.get("USCOA_NODE_PATH", "node"), "uscoa-login.js", "--autofill-json", temp_path]
        if headful:
            command.append("--headful")

        completed = subprocess.run(
            command,
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=RUN_TIMEOUT_SECONDS,
            check=False,
        )

        parsed = _extract_json_payload(completed.stdout or "")
        return {
            "returncode": completed.returncode,
            "stdout": completed.stdout or "",
            "stderr": completed.stderr or "",
            "parsed_result": parsed,
            "artifacts": _collect_recent_artifacts(),
            "success": completed.returncode == 0,
        }
    finally:
        if temp_path:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except OSError:
                pass


@app.route("/")
def index_page():
    return send_from_directory(UI_DIR, "index.html")


@app.route("/api/meta", methods=["GET"])
def get_meta():
    return jsonify({"success": True, **_build_meta()})


@app.route("/api/run", methods=["POST"])
def run_autofill():
    try:
        seal_types = request.form.getlist("seal_types") or request.form.getlist("seal_types[]")
        payload = {
            "guide_key": "科研事项用印",
            "subject": str(request.form.get("subject", "")).strip(),
            "seal_types": [item.strip() for item in seal_types if str(item).strip()],
            "contract_amount": str(request.form.get("contract_amount", "")).strip(),
            "description": str(request.form.get("description", "")).strip(),
            "phone": str(request.form.get("phone", "")).strip(),
            "remark": str(request.form.get("remark", "")).strip(),
            "action": str(request.form.get("action", "save_draft")).strip() or "save_draft",
        }
        uploaded_files = request.files.getlist("attachments")
        attachments = _store_attachments(uploaded_files)
        if attachments:
            payload["attachments"] = attachments

        _validate_payload(payload)
        headful = str(request.form.get("headful", "")).strip() in {"1", "true", "True", "on"}
        run_result = _run_autofill(payload, headful=headful)

        status_code = 200 if run_result.get("success") else 500
        return (
            jsonify(
                {
                    "success": bool(run_result.get("success")),
                    "message": "执行完成" if run_result.get("success") else "执行失败",
                    "request": payload,
                    "run": run_result,
                }
            ),
            status_code,
        )
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "message": f"执行超时（>{RUN_TIMEOUT_SECONDS} 秒）"}), 504
    except Exception as exc:  # noqa: BLE001
        return jsonify({"success": False, "message": f"运行失败: {exc}"}), 500


@app.route("/api/artifacts", methods=["GET"])
def list_artifacts():
    return jsonify({"success": True, "items": _collect_recent_artifacts()})


@app.route("/output/<path:sub_path>", methods=["GET"])
def get_output_file(sub_path: str):
    candidate = (OUTPUT_DIR / sub_path).resolve()
    try:
        candidate.relative_to(OUTPUT_DIR.resolve())
    except ValueError:
        abort(404)
    if not candidate.exists() or not candidate.is_file():
        abort(404)
    return send_file(candidate)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    host = os.environ.get("USCOA_UI_HOST", "127.0.0.1")
    port_value = os.environ.get("USCOA_UI_PORT", "5080")
    try:
        port = int(port_value)
    except ValueError:
        port = 5080
    debug = os.environ.get("USCOA_UI_DEBUG", "0").strip() in {"1", "true", "True"}
    print(f"[USCOA UI] http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    main()
