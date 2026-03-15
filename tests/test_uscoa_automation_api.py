import os
import tempfile
from io import BytesIO
from time import sleep

import pytest

import invoice_web.routes as routes_module
from invoice_web.app import create_app
from src.sqlite_data_store import SQLiteDataStore


@pytest.fixture
def data_store():
    fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    store = SQLiteDataStore(db_path)
    store.create_user('admin', 'admin123', 'Admin', is_admin=True)
    yield store
    try:
        os.remove(db_path)
    except OSError:
        pass


@pytest.fixture
def client(data_store):
    app = create_app(data_store)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret'
    return app.test_client()


@pytest.fixture
def admin_client(client):
    resp = client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    assert resp.status_code == 200
    assert resp.get_json()['success'] is True
    return client


def test_uscoa_autofill_endpoint_returns_attachment_summary(admin_client, monkeypatch):
    service = admin_client.application.config['uscoa_automation_service']

    def fake_autofill(_data, uploaded_files=None):
        assert uploaded_files == []
        return {
            'message': 'ok',
            'request': {'subject': '测试'},
            'automation': {'result': {'ok': True}},
            'attachment_summary': {'success': True, 'requested_count': 1, 'matched_count': 1},
        }

    monkeypatch.setattr(service, 'autofill_research_seal', fake_autofill)
    resp = admin_client.post(
        '/api/uscoa/research-seal/autofill',
        json={
            'subject': '测试',
            'seal_types': ['学校行政章'],
            'description': '说明',
            'phone': '13800000000',
            'action': 'save_draft',
        },
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['attachment_summary']['success'] is True


def test_uscoa_async_task_success(admin_client, monkeypatch):
    service = admin_client.application.config['uscoa_automation_service']
    monkeypatch.setattr(routes_module, 'sleep', lambda _x: None)

    def fake_build(data, uploaded_files=None):
        assert data['subject'] == '异步任务'
        assert uploaded_files == []
        return {
            'subject': data['subject'],
            'seal_types': data['seal_types'],
            'description': data['description'],
            'phone': data['phone'],
            'action': 'save_draft',
            'attachments': [],
        }

    def fake_run(payload):
        return {
            'request': payload,
            'automation': {
                'result': {
                    'actionResult': {'success': True},
                },
            },
            'attachment_summary': None,
        }

    monkeypatch.setattr(service, 'build_research_seal_payload', fake_build)
    monkeypatch.setattr(service, 'run_prepared_research_seal_payload', fake_run)

    start_resp = admin_client.post(
        '/api/uscoa/research-seal/task-start',
        data={
            'subject': '异步任务',
            'seal_types': '学校行政章',
            'description': '说明',
            'phone': '13800000000',
            'action': 'save_draft',
        },
        content_type='multipart/form-data',
    )
    assert start_resp.status_code == 202
    task_id = start_resp.get_json()['task']['id']

    final_task = None
    for _ in range(30):
        query_resp = admin_client.get(f'/api/uscoa/research-seal/task/{task_id}')
        assert query_resp.status_code == 200
        final_task = query_resp.get_json()['task']
        if final_task['status'] in {'success', 'failed'}:
            break
        sleep(0.01)

    assert final_task is not None
    assert final_task['status'] == 'success'
    assert final_task['steps']['complete']['status'] == 'success'


def test_uscoa_async_task_failure_on_attachment_summary(admin_client, monkeypatch):
    service = admin_client.application.config['uscoa_automation_service']
    monkeypatch.setattr(routes_module, 'sleep', lambda _x: None)

    def fake_build(_data, uploaded_files=None):
        assert len(uploaded_files) == 1
        return {
            'subject': '附件任务',
            'seal_types': ['学校行政章'],
            'description': '说明',
            'phone': '13800000000',
            'action': 'save_draft',
            'attachments': [{'name': 'a.pdf', 'path': 'tmp/a.pdf', 'size': 1}],
        }

    def fake_run(payload):
        return {
            'request': payload,
            'automation': {
                'result': {
                    'actionResult': {'success': True},
                },
            },
            'attachment_summary': {'success': False, 'requested_count': 1, 'matched_count': 0},
        }

    monkeypatch.setattr(service, 'build_research_seal_payload', fake_build)
    monkeypatch.setattr(service, 'run_prepared_research_seal_payload', fake_run)

    start_resp = admin_client.post(
        '/api/uscoa/research-seal/task-start',
        data={
            'subject': '附件任务',
            'seal_types': '学校行政章',
            'description': '说明',
            'phone': '13800000000',
            'action': 'save_draft',
            'attachments': (BytesIO(b'abc'), 'a.pdf'),
        },
        content_type='multipart/form-data',
    )
    assert start_resp.status_code == 202
    task_id = start_resp.get_json()['task']['id']

    final_task = None
    for _ in range(30):
        query_resp = admin_client.get(f'/api/uscoa/research-seal/task/{task_id}')
        assert query_resp.status_code == 200
        final_task = query_resp.get_json()['task']
        if final_task['status'] in {'success', 'failed'}:
            break
        sleep(0.01)

    assert final_task is not None
    assert final_task['status'] == 'failed'
    assert final_task['steps']['upload_attachment']['status'] == 'failed'
