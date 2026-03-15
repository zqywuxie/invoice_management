import os
import tempfile
from datetime import datetime
from decimal import Decimal
from io import BytesIO

import pytest

from invoice_web.app import create_app
from src.models import Invoice
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
    data = resp.get_json()
    assert data['success'] is True
    return client


def test_contract_management_crud_flow(admin_client):
    pdf_bytes = b'%PDF-1.4\n%contract\n1 0 obj\n<<>>\nendobj\n'

    upload_resp = admin_client.post(
        '/api/contracts',
        data={
            'invoice_numbers': 'INV-CONTRACT-001',
            'file': (BytesIO(pdf_bytes), 'contract.pdf'),
        },
        content_type='multipart/form-data',
    )
    assert upload_resp.status_code == 200
    upload_data = upload_resp.get_json()
    assert upload_data['success'] is True
    contract_id = upload_data['contract']['id']

    list_resp = admin_client.get('/api/contracts')
    assert list_resp.status_code == 200
    list_data = list_resp.get_json()
    assert list_data['success'] is True
    assert list_data['count'] == 1
    assert list_data['contracts'][0]['invoice_number'] == 'INV-CONTRACT-001'
    assert list_data['contracts'][0]['invoice_numbers'] == ['INV-CONTRACT-001']

    download_resp = admin_client.get(f'/api/contracts/{contract_id}/download')
    assert download_resp.status_code == 200
    assert download_resp.mimetype == 'application/pdf'
    assert download_resp.data == pdf_bytes

    delete_resp = admin_client.delete(f'/api/contracts/{contract_id}')
    assert delete_resp.status_code == 200
    delete_data = delete_resp.get_json()
    assert delete_data['success'] is True

    list_after_delete_resp = admin_client.get('/api/contracts')
    assert list_after_delete_resp.status_code == 200
    list_after_delete = list_after_delete_resp.get_json()
    assert list_after_delete['count'] == 0


def test_contract_upload_rejects_non_pdf(admin_client):
    resp = admin_client.post(
        '/api/contracts',
        data={
            'invoice_numbers': 'INV-CONTRACT-001',
            'file': (BytesIO(b'not a pdf'), 'contract.txt'),
        },
        content_type='multipart/form-data',
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert data['success'] is False
    assert 'PDF' in data['message']


def test_contract_management_accepts_multiple_invoice_numbers(admin_client):
    pdf_bytes = b'%PDF-1.4\n%multi-contract\n1 0 obj\n<<>>\nendobj\n'

    upload_resp = admin_client.post(
        '/api/contracts',
        data={
            'invoice_numbers': 'INV-A-001, INV-A-002\nINV-A-003',
            'file': (BytesIO(pdf_bytes), 'multi-contract.pdf'),
        },
        content_type='multipart/form-data',
    )
    assert upload_resp.status_code == 200
    upload_data = upload_resp.get_json()
    assert upload_data['success'] is True
    assert upload_data['contract']['invoice_number'] == 'INV-A-001'
    assert upload_data['contract']['invoice_numbers'] == ['INV-A-001', 'INV-A-002', 'INV-A-003']

    list_resp = admin_client.get('/api/contracts?search=INV-A-003')
    assert list_resp.status_code == 200
    list_data = list_resp.get_json()
    assert list_data['count'] == 1
    assert list_data['contracts'][0]['invoice_count'] == 3
    assert list_data['contracts'][0]['invoice_numbers'] == ['INV-A-001', 'INV-A-002', 'INV-A-003']


def test_contract_upload_allows_empty_invoice_numbers(admin_client):
    pdf_bytes = b'%PDF-1.4\n%no-invoice\n1 0 obj\n<<>>\nendobj\n'
    upload_resp = admin_client.post(
        '/api/contracts',
        data={
            'invoice_numbers': '',
            'file': (BytesIO(pdf_bytes), 'no-invoice.pdf'),
        },
        content_type='multipart/form-data',
    )
    assert upload_resp.status_code == 200
    data = upload_resp.get_json()
    assert data['success'] is True
    assert data['contract']['invoice_numbers'] == []


def test_contract_upload_accepts_manual_title(admin_client):
    pdf_bytes = b'%PDF-1.4\n%manual-title\n1 0 obj\n<<>>\nendobj\n'
    upload_resp = admin_client.post(
        '/api/contracts',
        data={
            'invoice_numbers': 'INV-TITLE-001',
            'contract_title': '办公设备采购合同',
            'file': (BytesIO(pdf_bytes), 'manual-title.pdf'),
        },
        content_type='multipart/form-data',
    )
    assert upload_resp.status_code == 200
    data = upload_resp.get_json()
    assert data['success'] is True
    assert data['contract']['contract_title'] == '办公设备采购合同'


def test_contract_pairing_requires_existing_invoices(admin_client, data_store):
    invoice_numbers = ['INV-P-001', 'INV-P-002']
    for invoice_number in invoice_numbers:
        invoice = Invoice(
            invoice_number=invoice_number,
            invoice_date='2026-03-10',
            item_name='Pairing Test',
            amount=Decimal('100.00'),
            remark='pairing',
            file_path='MEMORY',
            scan_time=datetime.now(),
            uploaded_by='Admin'
        )
        data_store.insert(invoice)
        data_store.update_pdf_data(invoice.invoice_number, b'%PDF-1.4 test invoice')

    pdf_bytes = b'%PDF-1.4\n%pair-contract\n1 0 obj\n<<>>\nendobj\n'
    upload_resp = admin_client.post(
        '/api/contracts',
        data={
            'invoice_numbers': 'INV-P-001, INV-P-002',
            'file': (BytesIO(pdf_bytes), 'pair-contract.pdf'),
        },
        content_type='multipart/form-data',
    )
    assert upload_resp.status_code == 200
    contract_id = upload_resp.get_json()['contract']['id']

    pair_resp = admin_client.post(
        f'/api/contracts/{contract_id}/links',
        json={'invoice_numbers': invoice_numbers}
    )
    assert pair_resp.status_code == 200
    pair_data = pair_resp.get_json()
    assert pair_data['success'] is True
    assert pair_data['invoice_numbers'] == invoice_numbers

    links_resp = admin_client.get(f'/api/contracts/{contract_id}/links')
    assert links_resp.status_code == 200
    links_data = links_resp.get_json()
    assert links_data['invoice_numbers'] == invoice_numbers

    missing_resp = admin_client.post(
        f'/api/contracts/{contract_id}/links',
        json={'invoice_numbers': ['INV-P-003']}
    )
    assert missing_resp.status_code == 400
    missing_data = missing_resp.get_json()
    assert missing_data['success'] is False
    assert missing_data['missing_invoice_numbers'] == ['INV-P-003']


def test_contract_invoice_validation_endpoint_returns_found_and_missing(admin_client, data_store):
    invoice = Invoice(
        invoice_number='INV-LOOKUP-001',
        invoice_date='2026-03-10',
        item_name='Validation Test',
        amount=Decimal('88.00'),
        remark='lookup',
        file_path='MEMORY',
        scan_time=datetime.now(),
        uploaded_by='Admin'
    )
    data_store.insert(invoice)

    resp = admin_client.post(
        '/api/contracts/validate-invoices',
        json={'invoice_numbers': 'INV-LOOKUP-001, INV-LOOKUP-404'}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['invoice_numbers'] == ['INV-LOOKUP-001', 'INV-LOOKUP-404']
    assert data['found_count'] == 1
    assert data['missing_count'] == 1
    assert data['found'][0]['invoice_number'] == 'INV-LOOKUP-001'
    assert data['missing'] == ['INV-LOOKUP-404']


def test_contract_list_search_matches_linked_invoice_numbers(admin_client, data_store):
    for invoice_number in ['INV-LINK-001', 'INV-LINK-002']:
        invoice = Invoice(
            invoice_number=invoice_number,
            invoice_date='2026-03-10',
            item_name='Linked Search Test',
            amount=Decimal('120.00'),
            remark='linked-search',
            file_path='MEMORY',
            scan_time=datetime.now(),
            uploaded_by='Admin'
        )
        data_store.insert(invoice)

    pdf_bytes = b'%PDF-1.4\n%linked-search\n1 0 obj\n<<>>\nendobj\n'
    upload_resp = admin_client.post(
        '/api/contracts',
        data={
            'invoice_numbers': 'INV-LINK-001',
            'file': (BytesIO(pdf_bytes), 'linked-search.pdf'),
        },
        content_type='multipart/form-data',
    )
    assert upload_resp.status_code == 200
    contract_id = upload_resp.get_json()['contract']['id']

    pair_resp = admin_client.post(
        f'/api/contracts/{contract_id}/links',
        json={'invoice_numbers': ['INV-LINK-002']}
    )
    assert pair_resp.status_code == 200

    list_resp = admin_client.get('/api/contracts?search=INV-LINK-002')
    assert list_resp.status_code == 200
    list_data = list_resp.get_json()
    assert list_data['success'] is True
    assert list_data['count'] == 1
    assert list_data['contracts'][0]['id'] == contract_id
    assert list_data['contracts'][0]['linked_invoice_numbers'] == ['INV-LINK-002']


def test_invoice_related_contracts_endpoint_returns_candidate_and_linked_matches(admin_client, data_store):
    for invoice_number in ['INV-REL-001', 'INV-REL-002']:
        invoice = Invoice(
            invoice_number=invoice_number,
            invoice_date='2026-03-10',
            item_name='Related Contract Test',
            amount=Decimal('66.00'),
            remark='related-contract',
            file_path='MEMORY',
            scan_time=datetime.now(),
            uploaded_by='Admin'
        )
        data_store.insert(invoice)

    pdf_bytes = b'%PDF-1.4\n%related-contract\n1 0 obj\n<<>>\nendobj\n'
    upload_resp = admin_client.post(
        '/api/contracts',
        data={
            'invoice_numbers': 'INV-REL-001',
            'file': (BytesIO(pdf_bytes), 'related-contract.pdf'),
        },
        content_type='multipart/form-data',
    )
    assert upload_resp.status_code == 200
    contract_id = upload_resp.get_json()['contract']['id']

    pair_resp = admin_client.post(
        f'/api/contracts/{contract_id}/links',
        json={'invoice_numbers': ['INV-REL-002']}
    )
    assert pair_resp.status_code == 200

    candidate_resp = admin_client.get('/api/invoices/INV-REL-001/contracts')
    assert candidate_resp.status_code == 200
    candidate_data = candidate_resp.get_json()
    assert candidate_data['success'] is True
    assert candidate_data['count'] == 1
    assert candidate_data['contracts'][0]['id'] == contract_id

    linked_resp = admin_client.get('/api/invoices/INV-REL-002/contracts')
    assert linked_resp.status_code == 200
    linked_data = linked_resp.get_json()
    assert linked_data['success'] is True
    assert linked_data['count'] == 1
    assert linked_data['contracts'][0]['linked_invoice_numbers'] == ['INV-REL-002']
