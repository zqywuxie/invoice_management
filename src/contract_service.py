"""
Contract service.

Stores contract PDFs in database BLOB fields to avoid filesystem/path issues,
while keeping compatibility with legacy file-path based records.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from src.models import Contract
from src.sqlite_data_store import SQLiteDataStore


class ContractService:
    """Service for uploading, listing, downloading and deleting invoice contracts."""

    LARGE_INVOICE_THRESHOLD = 10000
    _DB_PATH_PREFIX = "db://contracts/"

    def __init__(self, data_store: SQLiteDataStore, storage_base_path: str = "data/contracts"):
        self.data_store = data_store
        # Kept only for legacy file cleanup compatibility.
        self.storage_base_path = storage_base_path

    @staticmethod
    def is_large_invoice(amount: float) -> bool:
        return amount > ContractService.LARGE_INVOICE_THRESHOLD

    @staticmethod
    def is_pdf_filename(filename: str) -> bool:
        return bool(filename) and filename.lower().endswith(".pdf")

    @staticmethod
    def _safe_filename(filename: str) -> str:
        base = os.path.basename((filename or "").strip())
        return base or "contract.pdf"

    def _build_virtual_path(self, invoice_number: str, filename: str) -> str:
        safe_filename = self._safe_filename(filename)
        return f"{self._DB_PATH_PREFIX}{invoice_number}/{safe_filename}"

    @staticmethod
    def _build_admin_contract_key() -> str:
        return f"ADMIN-CONTRACT-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"

    @staticmethod
    def parse_invoice_numbers(raw_value: Any) -> List[str]:
        if raw_value is None:
            return []
        if isinstance(raw_value, str):
            pieces = raw_value.replace("\r", "\n").replace("，", ",").splitlines()
            values: List[str] = []
            for piece in pieces:
                values.extend(piece.split(","))
        elif isinstance(raw_value, (list, tuple, set)):
            values = [str(item) for item in raw_value]
        else:
            values = [str(raw_value)]

        normalized: List[str] = []
        seen = set()
        for value in values:
            item = value.strip()
            if not item or item in seen:
                continue
            seen.add(item)
            normalized.append(item)
        if len(normalized) == 1 and normalized[0].startswith("ADMIN-CONTRACT-"):
            return []
        return normalized

    @staticmethod
    def parse_tags(raw_value: Any) -> List[str]:
        if raw_value is None:
            return []
        if isinstance(raw_value, str):
            pieces = raw_value.replace("，", ",").replace("\n", ",").split(",")
            values = pieces
        elif isinstance(raw_value, (list, tuple, set)):
            values = [str(item) for item in raw_value]
        else:
            values = [str(raw_value)]

        normalized: List[str] = []
        seen = set()
        for value in values:
            item = value.strip()
            if not item or item in seen:
                continue
            seen.add(item)
            normalized.append(item)
        return normalized

    @classmethod
    def format_tags_text(cls, tags: List[str]) -> str:
        return ", ".join(cls.parse_tags(tags))

    @staticmethod
    def _first_non_empty_line(text: str) -> str:
        for line in (text or "").splitlines():
            cleaned = line.strip()
            if cleaned:
                return cleaned
        return ""

    def _extract_title_from_text(self, text: str) -> str:
        title = self._first_non_empty_line(text)
        return title[:120] if title else ""

    def _extract_title_from_pdf(self, file_data: bytes) -> str:
        if not file_data:
            return ""

        # Try embedded text via PyMuPDF first.
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=file_data, filetype="pdf")
            if doc.page_count > 0:
                page = doc[0]
                blocks = page.get_text("blocks") or []
                blocks = sorted(blocks, key=lambda item: item[1])
                for block in blocks:
                    text = block[4]
                    title = self._extract_title_from_text(text)
                    if title:
                        return title
        except Exception:
            pass

        # Fallback to OCR if available.
        try:
            import pytesseract
            from pdf2image import convert_from_bytes

            try:
                pytesseract.get_tesseract_version()
            except Exception:
                return ""

            images = convert_from_bytes(file_data, first_page=1, last_page=1)
            if not images:
                return ""
            image = images[0]
            width, height = image.size
            crop_height = max(1, int(height * 0.2))
            crop = image.crop((0, 0, width, crop_height))
            text = pytesseract.image_to_string(crop, lang="chi_sim+eng")
            return self._extract_title_from_text(text)
        except Exception:
            return ""

    def _fallback_title_from_filename(self, filename: str) -> str:
        stem = os.path.splitext(self._safe_filename(filename))[0].strip()
        return stem[:120] if stem else ""

    def _build_invoice_preview(self, invoice_number: str) -> Optional[Dict[str, Any]]:
        invoice = self.data_store.get_invoice_by_number(invoice_number)
        if not invoice:
            return None

        return {
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date,
            "item_name": invoice.item_name,
            "amount": str(invoice.amount),
            "uploaded_by": invoice.uploaded_by or "",
            "reimbursement_status": invoice.reimbursement_status or "",
            "record_type": invoice.record_type or "invoice",
        }

    @classmethod
    def format_invoice_numbers_text(cls, invoice_numbers: List[str]) -> str:
        return "\n".join(cls.parse_invoice_numbers(invoice_numbers))

    @classmethod
    def get_primary_invoice_number(cls, invoice_numbers: List[str]) -> str:
        normalized = cls.parse_invoice_numbers(invoice_numbers)
        return normalized[0] if normalized else ""

    def _cleanup_legacy_file_if_needed(self, file_path: str) -> None:
        if not file_path or file_path.startswith(self._DB_PATH_PREFIX):
            return
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

    def upload_contract(
        self,
        invoice_number: str,
        file_data: bytes,
        original_filename: str,
        content_type: str = "application/pdf",
    ) -> Tuple[bool, str, Optional[Contract]]:
        """Upload a contract PDF for an invoice."""
        try:
            if not self.is_pdf_filename(original_filename):
                return False, "仅支持PDF格式合同", None
            if not file_data:
                return False, "合同文件内容为空", None

            invoice = self.data_store.get_invoice_by_number(invoice_number)
            if not invoice:
                return False, "发票不存在", None

            existing_contract = self.data_store.get_contract_by_invoice(invoice_number)
            if existing_contract:
                self.delete_contract(invoice_number)

            contract = Contract(
                id=None,
                invoice_number=invoice_number,
                file_path=self._build_virtual_path(invoice_number, original_filename),
                original_filename=self._safe_filename(original_filename),
                upload_time=datetime.now(),
                invoice_numbers_text=invoice_number,
            )
            contract_id = self.data_store.insert_contract_with_data(
                contract,
                file_data,
                content_type or "application/pdf",
            )
            contract.id = contract_id

            return True, "合同上传成功", contract
        except Exception as exc:
            return False, f"合同上传失败: {exc}", None

    def get_contract(self, invoice_number: str) -> Optional[Contract]:
        return self.data_store.get_contract_by_invoice(invoice_number)

    def get_contract_by_id(self, contract_id: int) -> Optional[Contract]:
        return self.data_store.get_contract_by_id(contract_id)

    def get_contract_links(self, contract_id: int) -> List[str]:
        return self.data_store.get_contract_links(contract_id)

    def get_contract_metadata(self, invoice_number: str) -> Optional[Dict[str, Any]]:
        contract = self.get_contract(invoice_number)
        if not contract:
            return None

        content_type = "application/pdf"
        file_size = 0
        data_row = self.data_store.get_contract_data_by_invoice(invoice_number)
        if data_row:
            blob, stored_type = data_row
            content_type = stored_type or "application/pdf"
            if blob:
                file_size = len(blob)

        invoice_numbers = self.parse_invoice_numbers(contract.invoice_numbers_text)
        tags = self.parse_tags(contract.contract_tags_text)
        primary_invoice_number = invoice_numbers[0] if invoice_numbers else ""
        return {
            "id": contract.id,
            "invoice_number": primary_invoice_number,
            "invoice_numbers": invoice_numbers,
            "invoice_numbers_text": contract.invoice_numbers_text or "",
            "contract_title": contract.contract_title or "",
            "contract_tags": tags,
            "contract_tags_text": contract.contract_tags_text or "",
            "original_filename": contract.original_filename,
            "upload_time": contract.upload_time.isoformat(),
            "content_type": content_type,
            "file_size": file_size,
        }

    def create_contract_record(
        self,
        invoice_numbers: Any,
        file_data: bytes,
        original_filename: str,
        contract_tags: Any = None,
        contract_title: str = "",
        content_type: str = "application/pdf",
    ) -> Tuple[bool, str, Optional[Contract]]:
        try:
            normalized_invoice_numbers = self.parse_invoice_numbers(invoice_numbers)
            if not self.is_pdf_filename(original_filename):
                return False, "仅支持PDF格式合同", None
            if not file_data:
                return False, "合同文件内容为空", None

            admin_contract_key = self._build_admin_contract_key()
            invoice_numbers_text = self.format_invoice_numbers_text(normalized_invoice_numbers)
            resolved_contract_title = (
                (contract_title or "").strip()
                or self._extract_title_from_pdf(file_data)
                or self._fallback_title_from_filename(original_filename)
            )
            contract_tags_text = self.format_tags_text(self.parse_tags(contract_tags))
            contract = Contract(
                id=None,
                invoice_number=admin_contract_key,
                file_path=self._build_virtual_path(admin_contract_key, original_filename),
                original_filename=self._safe_filename(original_filename),
                upload_time=datetime.now(),
                invoice_numbers_text=invoice_numbers_text,
                contract_title=resolved_contract_title,
                contract_tags_text=contract_tags_text,
            )
            contract_id = self.data_store.insert_contract_with_data(
                contract,
                file_data,
                content_type or "application/pdf",
            )
            contract.id = contract_id
            return True, "合同上传成功", contract
        except Exception as exc:
            return False, f"合同上传失败: {exc}", None

    def get_contract_file(self, invoice_number: str) -> Optional[Tuple[bytes, str, str]]:
        """
        Return (file_data, original_filename, content_type).
        """
        contract = self.get_contract(invoice_number)
        if not contract:
            return None

        data_row = self.data_store.get_contract_data_by_invoice(invoice_number)
        if data_row and data_row[0]:
            file_data, content_type = data_row
            return file_data, contract.original_filename, content_type or "application/pdf"

        # Legacy fallback: read from old filesystem path.
        if contract.file_path and os.path.exists(contract.file_path):
            with open(contract.file_path, "rb") as fh:
                return fh.read(), contract.original_filename, "application/pdf"

        return None

    def get_contract_file_by_id(self, contract_id: int) -> Optional[Tuple[bytes, str, str]]:
        contract = self.get_contract_by_id(contract_id)
        if not contract:
            return None

        data_row = self.data_store.get_contract_data_by_id(contract_id)
        if data_row and data_row[0]:
            file_data, content_type = data_row
            return file_data, contract.original_filename, content_type or "application/pdf"

        if contract.file_path and os.path.exists(contract.file_path):
            with open(contract.file_path, "rb") as fh:
                return fh.read(), contract.original_filename, "application/pdf"

        return None

    def delete_contract(self, invoice_number: str) -> Tuple[bool, str]:
        try:
            contract = self.get_contract(invoice_number)
            if not contract:
                return False, "合同不存在"

            self._cleanup_legacy_file_if_needed(contract.file_path)
            self.data_store.delete_contract_links_by_contract(contract.id)
            self.data_store.delete_contract(contract.id)
            return True, "合同删除成功"
        except Exception as exc:
            return False, f"合同删除失败: {exc}"

    def delete_contract_by_id(self, contract_id: int) -> Tuple[bool, str]:
        try:
            contract = self.get_contract_by_id(contract_id)
            if not contract:
                return False, "合同不存在"

            self._cleanup_legacy_file_if_needed(contract.file_path)
            self.data_store.delete_contract_links_by_contract(contract_id)
            self.data_store.delete_contract(contract_id)
            return True, "合同删除成功"
        except Exception as exc:
            return False, f"合同删除失败: {exc}"

    def delete_contracts_by_invoice(self, invoice_number: str) -> Tuple[bool, str]:
        try:
            # Legacy cleanup: best effort for old storage path.
            legacy_dir = os.path.join(self.storage_base_path, invoice_number)
            if os.path.isdir(legacy_dir):
                for root, _, files in os.walk(legacy_dir, topdown=False):
                    for name in files:
                        try:
                            os.remove(os.path.join(root, name))
                        except OSError:
                            pass
                    try:
                        os.rmdir(root)
                    except OSError:
                        pass

            self.data_store.delete_contracts_by_invoice(invoice_number)
            return True, "合同清理成功"
        except Exception as exc:
            return False, f"合同清理失败: {exc}"

    def list_contracts(self, search: str = "", limit: int = 200) -> List[Dict[str, Any]]:
        records = self.data_store.get_contract_records(search=search, limit=limit)
        contract_ids = [row["id"] for row in records]
        link_counts = self.data_store.get_contract_link_counts(contract_ids)
        link_map = self.data_store.get_contract_links_map(contract_ids)
        result: List[Dict[str, Any]] = []

        for row in records:
            invoice_numbers = self.parse_invoice_numbers(row.get("invoice_numbers_text") or "")
            primary_invoice_number = invoice_numbers[0] if invoice_numbers else ""
            invoice_preview = self.preview_invoice_numbers(invoice_numbers)
            primary_invoice_preview = invoice_preview["found"][0] if invoice_preview["found"] else None
            tags = self.parse_tags(row.get("contract_tags_text") or "")
            linked_invoice_numbers = link_map.get(row["id"], [])
            result.append(
                {
                    "id": row["id"],
                    "invoice_number": primary_invoice_number,
                    "invoice_numbers": invoice_numbers,
                    "invoice_numbers_text": row.get("invoice_numbers_text") or "",
                    "invoice_count": len(invoice_numbers),
                    "linked_invoice_numbers": linked_invoice_numbers,
                    "linked_invoice_count": link_counts.get(row["id"], len(linked_invoice_numbers)),
                    "contract_title": row.get("contract_title") or "",
                    "contract_tags": tags,
                    "contract_tags_text": row.get("contract_tags_text") or "",
                    "original_filename": row["original_filename"],
                    "upload_time": row["upload_time"],
                    "content_type": row["content_type"],
                    "file_size": row["file_size"],
                    "invoice_date": primary_invoice_preview["invoice_date"] if primary_invoice_preview else "",
                    "item_name": primary_invoice_preview["item_name"] if primary_invoice_preview else "",
                    "amount": primary_invoice_preview["amount"] if primary_invoice_preview else "0",
                    "uploaded_by": primary_invoice_preview["uploaded_by"] if primary_invoice_preview else "",
                    "candidate_existing_count": invoice_preview["found_count"],
                    "candidate_missing_count": invoice_preview["missing_count"],
                    "missing_invoice_numbers": invoice_preview["missing"],
                }
            )

        return result

    def list_contracts_by_invoice_number(self, invoice_number: str, limit: int = 50) -> List[Dict[str, Any]]:
        target = (invoice_number or "").strip()
        if not target:
            return []

        matched: List[Dict[str, Any]] = []
        for contract in self.list_contracts(search=target, limit=limit):
            candidate_numbers = self.parse_invoice_numbers(contract.get("invoice_numbers_text") or contract.get("invoice_numbers") or [])
            linked_numbers = self.parse_invoice_numbers(contract.get("linked_invoice_numbers") or [])
            if target == contract.get("invoice_number") or target in candidate_numbers or target in linked_numbers:
                matched.append(contract)
        return matched

    def preview_invoice_numbers(self, invoice_numbers: Any) -> Dict[str, Any]:
        normalized = self.parse_invoice_numbers(invoice_numbers)
        found: List[Dict[str, Any]] = []
        missing: List[str] = []

        for invoice_number in normalized:
            preview = self._build_invoice_preview(invoice_number)
            if preview:
                found.append(preview)
            else:
                missing.append(invoice_number)

        return {
            "invoice_numbers": normalized,
            "found": found,
            "missing": missing,
            "found_count": len(found),
            "missing_count": len(missing),
        }

    def set_contract_links(self, contract_id: int, invoice_numbers: Any) -> Tuple[bool, str, List[str], List[str]]:
        contract = self.get_contract_by_id(contract_id)
        if not contract:
            return False, "合同不存在", [], []

        normalized = self.parse_invoice_numbers(invoice_numbers)
        if not normalized:
            self.data_store.replace_contract_links(contract_id, [])
            return True, "已清空配对", [], []

        existing = self.data_store.get_existing_invoice_numbers(normalized)
        existing_set = set(existing)
        missing = [num for num in normalized if num not in existing_set]
        if missing:
            return False, "存在未录入的发票编号", [], missing

        self.data_store.replace_contract_links(contract_id, normalized)
        return True, "配对成功", normalized, []

    def get_contract_detail(self, contract_id: int) -> Optional[Dict[str, Any]]:
        contract = self.get_contract_by_id(contract_id)
        if not contract:
            return None

        invoice_numbers = self.parse_invoice_numbers(contract.invoice_numbers_text)
        tags = self.parse_tags(contract.contract_tags_text)
        linked_invoice_numbers = self.data_store.get_contract_links(contract_id)
        candidate_preview = self.preview_invoice_numbers(invoice_numbers)
        linked_preview = self.preview_invoice_numbers(linked_invoice_numbers)
        linked_set = set(linked_invoice_numbers)

        content_type = "application/pdf"
        file_size = 0
        data_row = self.data_store.get_contract_data_by_id(contract_id)
        if data_row:
            blob, stored_type = data_row
            content_type = stored_type or "application/pdf"
            if blob:
                file_size = len(blob)

        return {
            "id": contract.id,
            "invoice_numbers": invoice_numbers,
            "invoice_numbers_text": contract.invoice_numbers_text or "",
            "invoice_count": len(invoice_numbers),
            "linked_invoice_numbers": linked_invoice_numbers,
            "linked_invoice_count": len(linked_invoice_numbers),
            "candidate_invoice_details": candidate_preview["found"],
            "candidate_missing_invoice_numbers": candidate_preview["missing"],
            "candidate_existing_count": candidate_preview["found_count"],
            "candidate_missing_count": candidate_preview["missing_count"],
            "linked_invoice_details": linked_preview["found"],
            "linked_missing_invoice_numbers": linked_preview["missing"],
            "candidate_linked_invoice_numbers": [num for num in invoice_numbers if num in linked_set],
            "candidate_unlinked_invoice_numbers": [num for num in invoice_numbers if num not in linked_set],
            "contract_title": contract.contract_title or "",
            "contract_tags": tags,
            "contract_tags_text": contract.contract_tags_text or "",
            "original_filename": contract.original_filename,
            "upload_time": contract.upload_time.isoformat(),
            "content_type": content_type,
            "file_size": file_size,
        }

    def update_contract_metadata(
        self,
        contract_id: int,
        invoice_numbers: Any,
        contract_title: str,
        contract_tags: Any
    ) -> Tuple[bool, str]:
        contract = self.get_contract_by_id(contract_id)
        if not contract:
            return False, "合同不存在"

        invoice_numbers_text = self.format_invoice_numbers_text(self.parse_invoice_numbers(invoice_numbers))
        tags_text = self.format_tags_text(self.parse_tags(contract_tags))
        updated = self.data_store.update_contract_metadata(
            contract_id,
            invoice_numbers_text,
            contract_title or "",
            tags_text
        )
        if not updated:
            return False, "更新失败"
        return True, "更新成功"

    def validate_large_invoice_contract(self, invoice_number: str, amount: float) -> Tuple[bool, str]:
        if not self.is_large_invoice(amount):
            return True, "非大额发票，无需合同"

        contract = self.get_contract(invoice_number)
        if contract:
            return True, "合同已上传"

        return False, f"金额超过{self.LARGE_INVOICE_THRESHOLD}元的大额发票必须上传合同"
