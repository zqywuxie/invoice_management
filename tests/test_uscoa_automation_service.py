from io import BytesIO
from pathlib import Path

import pytest

from src.uscoa_automation_service import USCOAAutomationService


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class DummyUpload:
    def __init__(self, filename: str, data: bytes):
        self.filename = filename
        self._data = data

    def save(self, destination: str) -> None:
        Path(destination).write_bytes(self._data)


def create_service() -> USCOAAutomationService:
    return USCOAAutomationService(str(PROJECT_ROOT))


def test_prepare_research_seal_request_normalizes_valid_payload():
    service = create_service()

    payload = service.prepare_research_seal_request(
        {
            'subject': '科研项目合同盖章申请',
            'seal_types': '学校行政章,合同用印',
            'contract_amount': '1000.50',
            'description': '用于科研合作合同签署。',
            'phone': '13800000000',
            'remark': '测试备注',
            'action': 'save_draft',
        }
    )

    assert payload == {
        'guide_key': '科研事项用印',
        'subject': '科研项目合同盖章申请',
        'seal_types': ['学校行政章', '合同用印'],
        'contract_amount': '1000.50',
        'description': '用于科研合作合同签署。',
        'phone': '13800000000',
        'remark': '测试备注',
        'action': 'save_draft',
    }


def test_prepare_research_seal_request_rejects_invalid_seal_type():
    service = create_service()

    with pytest.raises(ValueError) as exc_info:
        service.prepare_research_seal_request(
            {
                'subject': '测试',
                'seal_types': ['未知用印'],
                'description': '说明',
                'phone': '13800000000',
            }
        )

    assert '无效的用印类型' in str(exc_info.value)


def test_autofill_rejects_attachments_with_fill_only():
    service = create_service()

    with pytest.raises(ValueError) as exc_info:
        service.autofill_research_seal(
            {
                'subject': '测试',
                'seal_types': ['学校行政章'],
                'description': '说明',
                'phone': '13800000000',
                'action': 'fill_only',
            },
            uploaded_files=[DummyUpload('test.txt', b'hello')],
        )

    assert '仅支持 save_draft' in str(exc_info.value)


def test_autofill_includes_stored_attachments_in_payload(monkeypatch):
    service = create_service()

    captured = {}

    def fake_run(payload):
        captured['payload'] = payload
        return {'result': {'ok': True}}

    monkeypatch.setattr(service, '_run_with_temp_payload', fake_run)

    result = service.autofill_research_seal(
        {
            'subject': '测试附件',
            'seal_types': ['学校行政章'],
            'description': '说明',
            'phone': '13800000000',
            'action': 'save_draft',
        },
        uploaded_files=[DummyUpload('contract.txt', b'abc')],
    )

    payload = captured['payload']
    assert 'attachments' in payload
    assert len(payload['attachments']) == 1
    item = payload['attachments'][0]
    assert item['name'] == 'contract.txt'
    assert Path(item['path']).exists()
    assert result['automation']['result']['ok'] is True
    assert result['attachment_summary']['requested_count'] == 1
    assert result['attachment_summary']['success'] is False


def test_autofill_rejects_unsupported_attachment_extension():
    service = create_service()

    with pytest.raises(ValueError) as exc_info:
        service._store_uploaded_attachments([DummyUpload('contract.exe', b'abc')])

    assert '附件格式不支持' in str(exc_info.value)


def test_autofill_rejects_attachment_over_max_count():
    service = create_service()
    service.attachment_constraints = {
        **service.attachment_constraints,
        'max_count': 2,
    }

    files = [
        DummyUpload('a.pdf', b'1'),
        DummyUpload('b.pdf', b'2'),
        DummyUpload('c.pdf', b'3'),
    ]
    with pytest.raises(ValueError) as exc_info:
        service._store_uploaded_attachments(files)

    assert '附件数量不能超过 2 个' in str(exc_info.value)


def test_autofill_builds_attachment_summary_from_automation_result(monkeypatch):
    service = create_service()

    def fake_run(payload):
        return {
            'result': {
                'attachmentResult': {
                    'success': True,
                    'recordId': '12345',
                    'sourceUrl': 'http://example.test/attachment',
                    'pageSignals': {
                        'matchedFiles': ['contract.pdf'],
                        'missingFiles': [],
                    },
                    'artifacts': {
                        'jsonPath': '.output/attachments/demo.json',
                    },
                },
            },
        }

    monkeypatch.setattr(service, '_run_with_temp_payload', fake_run)

    result = service.autofill_research_seal(
        {
            'subject': '测试附件摘要',
            'seal_types': ['学校行政章'],
            'description': '说明',
            'phone': '13800000000',
            'action': 'save_draft',
        },
        uploaded_files=[DummyUpload('contract.pdf', b'abc')],
    )

    summary = result['attachment_summary']
    assert summary['success'] is True
    assert summary['record_id'] == '12345'
    assert summary['matched_count'] == 1
    assert summary['missing_files'] == []
