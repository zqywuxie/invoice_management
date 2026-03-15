from __future__ import annotations

import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable


class USCOAAutomationService:
    """Bridge the local Flask app with the Playwright-based OA automation."""

    GUIDE_KEY = '科研事项用印'
    GUIDE_ALIAS = 'research-seal'
    ATTACHMENT_ACTION_ERROR = '上传附件时仅支持 save_draft，因为 OA 需要先保存记录后才能进入附件页面'
    DEFAULT_ATTACHMENT_EXTENSIONS = (
        'pdf',
        'doc',
        'docx',
        'xls',
        'xlsx',
        'ppt',
        'pptx',
        'txt',
        'jpg',
        'jpeg',
        'png',
        'zip',
        'rar',
        '7z',
    )
    DEFAULT_GUIDE = {
        'guideKey': GUIDE_KEY,
        'title': '温馨提示',
        'sectionTitle': '科研部相关业务负责人信息如下',
        'responsibles': [
            {'category': '自科基金类项目（含国自、省自、实验室开放基金）', 'owner': '吴喜军'},
            {'category': '自科纵向非基金类项目（校科研启动经费、重点研发、教育厅等）', 'owner': '邓湘元'},
            {'category': '国防军工类项目', 'owner': '贾非'},
            {'category': '横向科研项目', 'owner': '解金柯'},
            {'category': '社科类项目', 'owner': '谭文丽'},
            {'category': '科研平台、科技奖励', 'owner': '戴兵'},
            {'category': '专利、软著等知识产权申报', 'owner': '夏月辉'},
        ],
        'notes': [
            '凡是涉及经费开支的用印申请，均需注明经费开支项目来源。',
            '非科研部管理的业务请勿提交“科研事项用印”申请。',
        ],
        'actionButton': {'id': 'next', 'text': '我已阅读并完全理解上述内容'},
    }
    DEFAULT_STAMP_OPTIONS = ['学校党委章', '学校行政章', '党委书记印', '校长印', '学校钢印', '合同用印']
    DEFAULT_FIELDS = [
        {'id': 'WJBT', 'label': '申办内容', 'type': 'text', 'required': True},
        {'id': 'seal_types', 'label': '用印类型', 'type': 'checkbox-group', 'required': True},
        {'id': 'HTJE', 'label': '合同金额', 'type': 'number', 'required': False},
        {'id': 'XGQK', 'label': '事项说明', 'type': 'textarea', 'required': True},
        {'id': 'LXDH', 'label': '联系电话', 'type': 'text', 'required': True},
        {'id': 'attachments', 'label': '附件', 'type': 'file', 'required': False},
    ]

    def __init__(self, project_root: str):
        self.project_root = os.path.abspath(project_root)
        self.automation_dir = os.path.join(self.project_root, 'scripts', 'uscoa-automation')
        self.script_path = os.path.join(self.automation_dir, 'uscoa-login.js')
        self.output_dir = os.path.join(self.automation_dir, '.output')
        self.guides_dir = os.path.join(self.output_dir, 'guides')
        self.forms_dir = os.path.join(self.output_dir, 'forms')
        self.guide_json_path = os.path.join(self.guides_dir, 'usc_yzgl_kyyy_guide.json')
        self.form_json_path = os.path.join(self.forms_dir, 'usc_yzgl_kyyy_form.json')
        self.uploads_dir = os.path.join(self.project_root, 'data', 'uscoa_attachments')
        self.attachment_constraints = self._load_attachment_constraints()
        self.node_executable = os.environ.get('USCOA_NODE_PATH', 'node')
        os.makedirs(self.uploads_dir, exist_ok=True)

    def get_research_seal_metadata(self) -> dict[str, Any]:
        guide = dict(self.DEFAULT_GUIDE)
        guide.update(self._read_json_if_exists(self.guide_json_path))

        form = self._read_json_if_exists(self.form_json_path)
        stamp_options = form.get('stampOptions') or [
            {'label': label, 'checked': False} for label in self.DEFAULT_STAMP_OPTIONS
        ]

        return {
            'guide': guide,
            'form_template': {
                'formKey': self.GUIDE_KEY,
                'defaultAction': 'save_draft',
                'availableActions': ['fill_only', 'save_draft'],
                'attachmentRule': self.ATTACHMENT_ACTION_ERROR,
                'fields': self.DEFAULT_FIELDS,
                'supports_attachments': True,
                'attachment_constraints': self._serialize_attachment_constraints(),
                'stamp_options': stamp_options,
                'summary': form.get('summary', {}),
                'action_buttons': form.get('actionButtons', []),
            },
        }

    def autofill_research_seal(
        self,
        raw_data: dict[str, Any],
        uploaded_files: Iterable[Any] | None = None,
    ) -> dict[str, Any]:
        payload = self.build_research_seal_payload(raw_data, uploaded_files=uploaded_files)
        execution = self.run_prepared_research_seal_payload(payload)
        return {
            'message': '已执行 OA 自动填报流程',
            'request': execution['request'],
            'automation': execution['automation'],
            'attachment_summary': execution['attachment_summary'],
        }

    def build_research_seal_payload(
        self,
        raw_data: dict[str, Any],
        uploaded_files: Iterable[Any] | None = None,
    ) -> dict[str, Any]:
        payload = self.prepare_research_seal_request(raw_data)
        attachments = self._store_uploaded_attachments(uploaded_files)
        if attachments:
            if payload['action'] != 'save_draft':
                raise ValueError(self.ATTACHMENT_ACTION_ERROR)
            payload['attachments'] = attachments
        return payload

    def run_prepared_research_seal_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = self._run_with_temp_payload(payload)
        attachment_summary = self._build_attachment_summary(payload, result)
        return {
            'request': payload,
            'automation': result,
            'attachment_summary': attachment_summary,
        }

    def prepare_research_seal_request(self, raw_data: dict[str, Any]) -> dict[str, Any]:
        data = raw_data or {}

        subject = str(data.get('subject') or data.get('content') or '').strip()
        if not subject:
            raise ValueError('申办内容不能为空')

        seal_types = data.get('seal_types') or data.get('sealTypes') or []
        if isinstance(seal_types, str):
            seal_types = [item.strip() for item in seal_types.split(',') if item.strip()]
        if not isinstance(seal_types, list) or not seal_types:
            raise ValueError('至少选择一种用印类型')

        allowed_types = set(self.DEFAULT_STAMP_OPTIONS)
        invalid_types = [item for item in seal_types if item not in allowed_types]
        if invalid_types:
            raise ValueError(f'存在无效的用印类型: {", ".join(invalid_types)}')

        description = str(data.get('description') or data.get('detail') or '').strip()
        if not description:
            raise ValueError('事项说明不能为空')

        phone = str(data.get('phone') or data.get('contact_phone') or '').strip()
        if not phone:
            raise ValueError('联系电话不能为空')

        contract_amount_raw = str(data.get('contract_amount') or data.get('contractAmount') or '').strip()
        contract_amount = ''
        if contract_amount_raw:
            try:
                contract_amount = format(Decimal(contract_amount_raw), 'f')
            except (InvalidOperation, ValueError) as exc:
                raise ValueError('合同金额格式不正确') from exc

        action = str(data.get('action') or 'save_draft').strip() or 'save_draft'
        if action not in {'fill_only', 'save_draft'}:
            raise ValueError('当前仅支持 fill_only 或 save_draft')

        remark = str(data.get('remark') or '').strip()

        return {
            'guide_key': self.GUIDE_KEY,
            'subject': subject,
            'seal_types': seal_types,
            'contract_amount': contract_amount,
            'description': description,
            'phone': phone,
            'remark': remark,
            'action': action,
        }

    def _store_uploaded_attachments(self, uploaded_files: Iterable[Any] | None) -> list[dict[str, Any]]:
        files = [item for item in (uploaded_files or []) if getattr(item, 'filename', '')]
        if not files:
            return []

        max_count = self.attachment_constraints['max_count']
        if len(files) > max_count:
            raise ValueError(f'附件数量不能超过 {max_count} 个')

        run_dir = os.path.join(
            self.uploads_dir,
            datetime.now().strftime('%Y%m%d_%H%M%S_') + uuid.uuid4().hex[:8],
        )
        os.makedirs(run_dir, exist_ok=True)

        allowed_extensions = self.attachment_constraints['allowed_extensions']
        max_file_size_bytes = self.attachment_constraints['max_file_size_bytes']
        max_total_size_bytes = self.attachment_constraints['max_total_size_bytes']
        stored_files: list[dict[str, Any]] = []
        total_size = 0
        for storage in files:
            original_name = str(getattr(storage, 'filename', '') or '').strip()
            if not original_name:
                continue

            safe_name = self._make_safe_filename(original_name)
            ext = os.path.splitext(safe_name)[1].lower().lstrip('.')
            if allowed_extensions and ext not in allowed_extensions:
                extensions = ', '.join(f'.{item}' for item in sorted(allowed_extensions))
                raise ValueError(f'附件格式不支持: {original_name}。仅支持: {extensions}')

            save_path = self._ensure_unique_path(os.path.join(run_dir, safe_name))
            storage.save(save_path)
            size = os.path.getsize(save_path)

            if size > max_file_size_bytes:
                os.remove(save_path)
                raise ValueError(
                    f'附件过大: {original_name}，单个文件不能超过 {self._format_size(max_file_size_bytes)}'
                )

            if total_size + size > max_total_size_bytes:
                os.remove(save_path)
                raise ValueError(
                    f'附件总大小超限，所有附件合计不能超过 {self._format_size(max_total_size_bytes)}'
                )

            total_size += size
            stored_files.append(
                {
                    'name': original_name,
                    'path': save_path,
                    'size': size,
                    'extension': ext,
                }
            )

        return stored_files

    def _build_attachment_summary(self, payload: dict[str, Any], automation: dict[str, Any]) -> dict[str, Any] | None:
        request_files = payload.get('attachments') or []
        if not request_files:
            return None

        result_payload = automation.get('result') if isinstance(automation, dict) else {}
        attachment_result = result_payload.get('attachmentResult') if isinstance(result_payload, dict) else {}
        if not isinstance(attachment_result, dict):
            attachment_result = {}
        page_signals = attachment_result.get('pageSignals') if isinstance(attachment_result, dict) else {}
        matched_files = (
            page_signals.get('matchedFiles')
            if isinstance(page_signals, dict) and isinstance(page_signals.get('matchedFiles'), list)
            else []
        )
        missing_files = (
            page_signals.get('missingFiles')
            if isinstance(page_signals, dict) and isinstance(page_signals.get('missingFiles'), list)
            else []
        )
        if not missing_files and matched_files:
            requested_names = [item.get('name', '') for item in request_files]
            matched_set = set(matched_files)
            missing_files = [name for name in requested_names if name and name not in matched_set]

        return {
            'requested_count': len(request_files),
            'matched_count': len(matched_files),
            'success': bool(attachment_result.get('success')),
            'record_id': str(attachment_result.get('recordId') or ''),
            'source_url': str(attachment_result.get('sourceUrl') or ''),
            'matched_files': matched_files,
            'missing_files': missing_files,
            'artifacts': attachment_result.get('artifacts') or {},
        }

    def _run_with_temp_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not os.path.exists(self.script_path):
            raise RuntimeError(f'自动化脚本不存在: {self.script_path}')

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode='w',
                suffix='.json',
                delete=False,
                dir=self.automation_dir,
                encoding='utf-8',
            ) as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                temp_path = handle.name

            command = [self.node_executable, 'uscoa-login.js', '--autofill-json', temp_path]
            completed = subprocess.run(
                command,
                cwd=self.automation_dir,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=300,
                check=False,
            )

            stdout = completed.stdout or ''
            stderr = completed.stderr or ''
            parsed = self._extract_json_payload(stdout)

            if completed.returncode != 0:
                detail = stderr.strip() or stdout.strip() or 'Node 脚本执行失败'
                raise RuntimeError(detail)

            return {
                'stdout': stdout.strip(),
                'stderr': stderr.strip(),
                'result': parsed,
            }
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

    @staticmethod
    def _extract_json_payload(output: str) -> dict[str, Any] | None:
        if not output:
            return None
        start = output.find('{')
        end = output.rfind('}')
        if start == -1 or end == -1 or end <= start:
            return None
        snippet = output[start:end + 1]
        try:
            return json.loads(snippet)
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _read_json_if_exists(file_path: str) -> dict[str, Any]:
        if not os.path.exists(file_path):
            return {}
        try:
            with open(file_path, 'r', encoding='utf-8') as handle:
                return json.load(handle)
        except (OSError, json.JSONDecodeError):
            return {}

    @staticmethod
    def _make_safe_filename(filename: str) -> str:
        invalid_chars = '<>:"/\\|?*'
        cleaned = ''.join('_' if ch in invalid_chars or ord(ch) < 32 else ch for ch in filename).strip()
        cleaned = cleaned.strip('. ')
        return cleaned or f'attachment_{uuid.uuid4().hex}'

    @staticmethod
    def _ensure_unique_path(file_path: str) -> str:
        if not os.path.exists(file_path):
            return file_path

        base, ext = os.path.splitext(file_path)
        index = 1
        candidate = f'{base}_{index}{ext}'
        while os.path.exists(candidate):
            index += 1
            candidate = f'{base}_{index}{ext}'
        return candidate

    def _load_attachment_constraints(self) -> dict[str, Any]:
        max_count = self._read_positive_int_env('USCOA_ATTACHMENT_MAX_COUNT', 10)
        max_file_size_mb = self._read_positive_int_env('USCOA_ATTACHMENT_MAX_FILE_MB', 20)
        max_total_size_mb = self._read_positive_int_env('USCOA_ATTACHMENT_MAX_TOTAL_MB', 100)

        env_extensions = str(os.environ.get('USCOA_ATTACHMENT_ALLOWED_EXTENSIONS', '') or '').strip()
        if env_extensions:
            allowed_extensions = tuple(
                item.strip().lower().lstrip('.') for item in env_extensions.split(',') if item.strip()
            )
        else:
            allowed_extensions = self.DEFAULT_ATTACHMENT_EXTENSIONS

        return {
            'max_count': max_count,
            'max_file_size_bytes': max_file_size_mb * 1024 * 1024,
            'max_total_size_bytes': max_total_size_mb * 1024 * 1024,
            'allowed_extensions': tuple(sorted(set(allowed_extensions))),
        }

    def _serialize_attachment_constraints(self) -> dict[str, Any]:
        data = dict(self.attachment_constraints)
        data['allowed_extensions'] = list(data['allowed_extensions'])
        data['accept'] = ','.join(f".{item}" for item in data['allowed_extensions'])
        data['max_file_size_mb'] = round(data['max_file_size_bytes'] / (1024 * 1024), 2)
        data['max_total_size_mb'] = round(data['max_total_size_bytes'] / (1024 * 1024), 2)
        return data

    @staticmethod
    def _read_positive_int_env(name: str, default: int) -> int:
        value = str(os.environ.get(name, '') or '').strip()
        if not value:
            return default
        try:
            parsed = int(value)
        except ValueError:
            return default
        return parsed if parsed > 0 else default

    @staticmethod
    def _format_size(size_bytes: int) -> str:
        if size_bytes >= 1024 * 1024:
            return f'{size_bytes / (1024 * 1024):.0f} MB'
        if size_bytes >= 1024:
            return f'{size_bytes / 1024:.0f} KB'
        return f'{size_bytes} B'
