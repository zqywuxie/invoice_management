/**
 * Invoice Web Application - Main JavaScript
 * 电子发票汇总系统 - 前端交互逻辑
 * Requirements: 1.2, 2.1, 6.1, 7.1, 9.1
 */

// ============================================
// Application State
// ============================================
const AppState = {
    invoices: [],
    currentSort: {
        column: 'invoice_date',
        direction: 'desc'
    },
    searchQuery: '',
    currentInvoice: null,
    currentUser: null,
    dateFilter: {
        startDate: '',
        endDate: ''
    },
    selectedInvoices: new Set(),  // 用于批量选择
    personFilter: '',  // 报销人筛选
    uploaderFilter: '',  // 上传人筛选
    reimbursementStatusFilter: '',  // 报销状态筛选
    recordTypeFilter: ''  // 记录类型筛选 (Requirements: 13.4, 13.5)
};

// ============================================
// API Service
// ============================================
const API = {
    baseUrl: '/api',

    async checkAuth() {
        const response = await fetch(`${this.baseUrl}/auth/status`);
        return response.json();
    },

    async login(username, password) {
        const response = await fetch(`${this.baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return response.json();
    },

    async logout() {
        const response = await fetch(`${this.baseUrl}/auth/logout`, {
            method: 'POST'
        });
        return response.json();
    },

    async getInvoices(search = '', startDate = '', endDate = '', reimbursementPersonId = '', uploadedBy = '', reimbursementStatus = '', recordType = '') {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (reimbursementPersonId) params.append('reimbursement_person_id', reimbursementPersonId);
        if (uploadedBy) params.append('uploaded_by', uploadedBy);
        if (reimbursementStatus) params.append('reimbursement_status', reimbursementStatus);
        if (recordType) params.append('record_type', recordType);
        const queryString = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`${this.baseUrl}/invoices${queryString}`);
        const data = await response.json();
        if (data.need_login) {
            Auth.showLoginModal();
            throw new Error('需要登录');
        }
        if (!response.ok) throw new Error('获取发票列表失败');
        return data;
    },

    async updateReimbursementStatus(invoiceNumber, status) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/reimbursement-status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || '更新报销状态失败');
        }
        return data;
    },

    async getUploaders() {
        const response = await fetch(`${this.baseUrl}/uploaders`);
        if (!response.ok) throw new Error('获取上传人列表失败');
        return response.json();
    },

    async getInvoice(invoiceNumber) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}`);
        if (!response.ok) throw new Error('获取发票详情失败');
        return response.json();
    },

    async uploadInvoice(file, reimbursementPersonId = null) {
        const formData = new FormData();
        formData.append('file', file);
        if (reimbursementPersonId) {
            formData.append('reimbursement_person_id', reimbursementPersonId);
        }
        const response = await fetch(`${this.baseUrl}/invoices`, {
            method: 'POST',
            body: formData
        });
        return response.json();
    },

    async deleteInvoice(invoiceNumber) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}`, {
            method: 'DELETE'
        });
        return response.json();
    },

    async updateInvoice(invoiceNumber, data) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    getExportUrl() {
        return `${this.baseUrl}/invoices/export`;
    },

    getPdfUrl(invoiceNumber, preview = false) {
        const url = `${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/pdf`;
        return preview ? `${url}?preview=true` : url;
    },

    // Voucher API methods
    async getVouchers(invoiceNumber) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/vouchers`);
        if (!response.ok) throw new Error('获取凭证列表失败');
        return response.json();
    },

    async uploadVoucher(invoiceNumber, file) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/vouchers`, {
            method: 'POST',
            body: formData
        });
        return response.json();
    },

    async deleteVoucher(voucherId) {
        const response = await fetch(`${this.baseUrl}/vouchers/${voucherId}`, {
            method: 'DELETE'
        });
        return response.json();
    },

    getVoucherImageUrl(voucherId) {
        return `${this.baseUrl}/vouchers/${voucherId}/image`;
    },

    getDocxExportUrl(invoiceNumber) {
        return `${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/export-docx`;
    },

    async exportDocxBatch(invoiceNumbers) {
        const response = await fetch(`${this.baseUrl}/invoices/export-docx-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice_numbers: invoiceNumbers })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || '批量导出失败');
        }
        return response.blob();
    },

    // Reimbursement person API methods
    async getReimbursementPersons() {
        const response = await fetch(`${this.baseUrl}/reimbursement-persons`);
        if (!response.ok) throw new Error('获取报销人列表失败');
        return response.json();
    },

    async createReimbursementPerson(name) {
        const response = await fetch(`${this.baseUrl}/reimbursement-persons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        return response.json();
    },

    // Admin API methods
    async getAllUsers() {
        const response = await fetch(`${this.baseUrl}/admin/users`);
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || '获取用户列表失败');
        }
        return response.json();
    },

    async createUser(userData) {
        const response = await fetch(`${this.baseUrl}/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        return response.json();
    },

    async updateUser(userId, userData) {
        const response = await fetch(`${this.baseUrl}/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        return response.json();
    },

    async deleteUser(userId) {
        const response = await fetch(`${this.baseUrl}/admin/users/${userId}`, {
            method: 'DELETE'
        });
        return response.json();
    },

    // Signature API methods
    async getSignature(invoiceNumber) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/signature`);
        if (!response.ok) throw new Error('获取签章信息失败');
        return response.json();
    },

    async uploadSignature(invoiceNumber, file, positionX, positionY, width, height, pageNumber) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('position_x', positionX);
        formData.append('position_y', positionY);
        formData.append('width', width);
        formData.append('height', height);
        formData.append('page_number', pageNumber);
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/signature`, {
            method: 'POST',
            body: formData
        });
        return response.json();
    },

    async updateSignaturePosition(invoiceNumber, positionX, positionY, width, height, pageNumber) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/signature/position`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                position_x: positionX,
                position_y: positionY,
                width: width,
                height: height,
                page_number: pageNumber
            })
        });
        return response.json();
    },

    async deleteSignature(invoiceNumber) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/signature`, {
            method: 'DELETE'
        });
        return response.json();
    },

    getSignatureImageUrl(invoiceNumber) {
        return `${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/signature/image`;
    },

    getSignedPdfUrl(invoiceNumber) {
        return `${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/pdf-with-signature`;
    },

    async getPdfDimensions(invoiceNumber) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/pdf-dimensions`);
        if (!response.ok) throw new Error('获取PDF尺寸失败');
        return response.json();
    },

    // Signature Template API methods
    async getSignatureTemplates() {
        const response = await fetch(`${this.baseUrl}/signature-templates`);
        if (!response.ok) throw new Error('获取签章模板列表失败');
        return response.json();
    },

    async uploadSignatureTemplate(file, name) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        const response = await fetch(`${this.baseUrl}/signature-templates`, {
            method: 'POST',
            body: formData
        });
        return response.json();
    },

    async deleteSignatureTemplate(templateId) {
        const response = await fetch(`${this.baseUrl}/signature-templates/${templateId}`, {
            method: 'DELETE'
        });
        return response.json();
    },

    getSignatureTemplateImageUrl(templateId) {
        return `${this.baseUrl}/signature-templates/${templateId}/image`;
    },

    async applySignatureTemplate(invoiceNumber, templateId, positionX, positionY, width, height, pageNumber) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/apply-signature-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id: templateId,
                position_x: positionX,
                position_y: positionY,
                width: width,
                height: height,
                page_number: pageNumber
            })
        });
        return response.json();
    }
};

// ============================================
// DOM Elements
// ============================================
const DOM = {
    // Statistics
    totalCount: document.getElementById('totalCount'),
    totalAmount: document.getElementById('totalAmount'),

    // Table
    invoiceTable: document.getElementById('invoiceTable'),
    invoiceTableBody: document.getElementById('invoiceTableBody'),
    emptyState: document.getElementById('emptyState'),

    // Search
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),

    // Buttons
    uploadBtn: document.getElementById('uploadBtn'),
    uploadBtnEmpty: document.getElementById('uploadBtnEmpty'),
    exportBtn: document.getElementById('exportBtn'),
    fileInput: document.getElementById('fileInput'),

    // Detail Modal
    detailModal: document.getElementById('detailModal'),
    detailInvoiceNumber: document.getElementById('detailInvoiceNumber'),
    detailInvoiceDate: document.getElementById('detailInvoiceDate'),
    detailItemName: document.getElementById('detailItemName'),
    detailAmount: document.getElementById('detailAmount'),
    detailRemark: document.getElementById('detailRemark'),
    detailFilePath: document.getElementById('detailFilePath'),
    detailScanTime: document.getElementById('detailScanTime'),
    detailUploadedBy: document.getElementById('detailUploadedBy'),
    downloadPdfBtn: document.getElementById('downloadPdfBtn'),
    previewPdfBtn: document.getElementById('previewPdfBtn'),

    // PDF Preview Modal
    pdfPreviewModal: document.getElementById('pdfPreviewModal'),
    pdfPreviewFrame: document.getElementById('pdfPreviewFrame'),

    // Delete Modal
    deleteModal: document.getElementById('deleteModal'),
    deleteInvoiceNumber: document.getElementById('deleteInvoiceNumber'),
    deleteItemName: document.getElementById('deleteItemName'),
    deleteAmount: document.getElementById('deleteAmount'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

    // Duplicate Modal
    duplicateModal: document.getElementById('duplicateModal'),
    newInvoiceNumber: document.getElementById('newInvoiceNumber'),
    newInvoiceDate: document.getElementById('newInvoiceDate'),
    newItemName: document.getElementById('newItemName'),
    newAmount: document.getElementById('newAmount'),
    newRemark: document.getElementById('newRemark'),
    existingInvoiceNumber: document.getElementById('existingInvoiceNumber'),
    existingInvoiceDate: document.getElementById('existingInvoiceDate'),
    existingItemName: document.getElementById('existingItemName'),
    existingAmount: document.getElementById('existingAmount'),
    existingRemark: document.getElementById('existingRemark'),

    // Upload Progress Modal
    uploadProgressModal: document.getElementById('uploadProgressModal'),
    uploadProgressBar: document.getElementById('uploadProgressBar'),
    uploadProgressText: document.getElementById('uploadProgressText'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer'),

    // Login
    loginModal: document.getElementById('loginModal'),
    loginForm: document.getElementById('loginForm'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    loginError: document.getElementById('loginError'),
    currentUserName: document.getElementById('currentUserName'),
    logoutBtn: document.getElementById('logoutBtn'),

    // Date Filter
    startDateInput: document.getElementById('startDateInput'),
    endDateInput: document.getElementById('endDateInput'),
    applyDateFilterBtn: document.getElementById('applyDateFilterBtn'),
    clearDateFilterBtn: document.getElementById('clearDateFilterBtn'),

    // Edit Modal
    editModal: document.getElementById('editModal'),
    editForm: document.getElementById('editForm'),
    editInvoiceNumber: document.getElementById('editInvoiceNumber'),
    editInvoiceDate: document.getElementById('editInvoiceDate'),
    editItemName: document.getElementById('editItemName'),
    editAmount: document.getElementById('editAmount'),
    editRemark: document.getElementById('editRemark'),
    editError: document.getElementById('editError'),

    // Upload Invoice Modal
    uploadInvoiceModal: document.getElementById('uploadInvoiceModal'),
    uploadInvoiceForm: document.getElementById('uploadInvoiceForm'),
    invoicePdfInput: document.getElementById('invoicePdfInput'),
    pdfPreviewContainer: document.getElementById('pdfPreviewContainer'),
    voucherImagesInput: document.getElementById('voucherImagesInput'),
    voucherPreviewContainer: document.getElementById('voucherPreviewContainer'),
    uploadInvoiceError: document.getElementById('uploadInvoiceError'),
    submitUploadBtn: document.getElementById('submitUploadBtn'),

    // Reimbursement Person in Upload Modal
    reimbursementPersonSelect: document.getElementById('reimbursementPersonSelect'),
    addNewPersonBtn: document.getElementById('addNewPersonBtn'),
    newPersonInputGroup: document.getElementById('newPersonInputGroup'),
    newPersonNameInput: document.getElementById('newPersonNameInput'),
    confirmNewPersonBtn: document.getElementById('confirmNewPersonBtn'),
    cancelNewPersonBtn: document.getElementById('cancelNewPersonBtn'),

    // Reimbursement Person in Detail Modal
    detailReimbursementPerson: document.getElementById('detailReimbursementPerson'),

    // Voucher Gallery in Detail Modal
    voucherGallery: document.getElementById('voucherGallery'),
    noVouchersMessage: document.getElementById('noVouchersMessage'),
    detailVoucherCount: document.getElementById('detailVoucherCount'),
    addVoucherBtn: document.getElementById('addVoucherBtn'),
    exportDocxBtn: document.getElementById('exportDocxBtn'),

    // Voucher Lightbox Modal
    voucherLightboxModal: document.getElementById('voucherLightboxModal'),
    voucherLightboxImage: document.getElementById('voucherLightboxImage'),
    voucherLightboxIndex: document.getElementById('voucherLightboxIndex'),
    voucherImageContainer: document.getElementById('voucherImageContainer'),
    prevVoucherBtn: document.getElementById('prevVoucherBtn'),
    nextVoucherBtn: document.getElementById('nextVoucherBtn'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    zoomResetBtn: document.getElementById('zoomResetBtn'),

    // Add Voucher Modal
    addVoucherModal: document.getElementById('addVoucherModal'),
    addVoucherForm: document.getElementById('addVoucherForm'),
    newVoucherInput: document.getElementById('newVoucherInput'),
    newVoucherPreviewContainer: document.getElementById('newVoucherPreviewContainer'),
    addVoucherError: document.getElementById('addVoucherError')
};


// ============================================
// Utility Functions
// ============================================
const Utils = {
    formatCurrency(amount) {
        const num = parseFloat(amount) || 0;
        return `¥${num.toFixed(2)}`;
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        return dateStr;
    },

    formatDateTime(dateTimeStr) {
        if (!dateTimeStr) return '-';
        try {
            const date = new Date(dateTimeStr);
            return date.toLocaleString('zh-CN');
        } catch {
            return dateTimeStr;
        }
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// ============================================
// Toast Notifications (Task 6.9)
// ============================================
const Toast = {
    show(message, type = 'success', duration = 3000) {
        const toastId = `toast-${Date.now()}`;
        const bgClass = type === 'success' ? 'bg-success' :
            type === 'error' ? 'bg-danger' :
                type === 'warning' ? 'bg-warning' : 'bg-info';
        const textClass = type === 'warning' ? 'text-dark' : 'text-white';

        const toastHtml = `
            <div id="${toastId}" class="toast ${bgClass} ${textClass}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header ${bgClass} ${textClass}">
                    <i class="bi ${type === 'success' ? 'bi-check-circle' : type === 'error' ? 'bi-x-circle' : 'bi-exclamation-circle'} me-2"></i>
                    <strong class="me-auto">${type === 'success' ? '成功' : type === 'error' ? '错误' : '提示'}</strong>
                    <button type="button" class="btn-close ${type !== 'warning' ? 'btn-close-white' : ''}" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">
                    ${Utils.escapeHtml(message)}
                </div>
            </div>
        `;

        DOM.toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: duration });
        toast.show();

        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    },

    success(message) {
        this.show(message, 'success');
    },

    error(message) {
        this.show(message, 'error', 5000);
    },

    warning(message) {
        this.show(message, 'warning', 4000);
    }
};

// ============================================
// Statistics Update (Task 6.7, Requirements: 13.6)
// ============================================
const Statistics = {
    update(totalCount, totalAmount, invoiceCount = 0, manualCount = 0, invoiceAmount = '0', manualAmount = '0') {
        DOM.totalCount.textContent = totalCount || 0;
        DOM.totalAmount.textContent = Utils.formatCurrency(totalAmount);

        // Update categorized statistics (Requirements: 13.6)
        const invoiceCountEl = document.getElementById('invoiceCount');
        const manualCountEl = document.getElementById('manualCount');
        const invoiceAmountEl = document.getElementById('invoiceAmount');
        const manualAmountEl = document.getElementById('manualAmount');

        if (invoiceCountEl) invoiceCountEl.textContent = invoiceCount || 0;
        if (manualCountEl) manualCountEl.textContent = manualCount || 0;
        if (invoiceAmountEl) invoiceAmountEl.textContent = Utils.formatCurrency(invoiceAmount);
        if (manualAmountEl) manualAmountEl.textContent = Utils.formatCurrency(manualAmount);
    }
};

// ============================================
// Invoice Table Rendering and Sorting (Task 6.2)
// ============================================
const InvoiceTable = {
    render(invoices) {
        AppState.invoices = invoices;

        // 清除不存在的发票选择
        const invoiceNumbers = new Set(invoices.map(inv => inv.invoice_number));
        AppState.selectedInvoices.forEach(num => {
            if (!invoiceNumbers.has(num)) {
                AppState.selectedInvoices.delete(num);
            }
        });

        if (!invoices || invoices.length === 0) {
            DOM.invoiceTableBody.innerHTML = '';
            DOM.emptyState.classList.remove('d-none');
            DOM.invoiceTable.classList.add('d-none');
            AppState.selectedInvoices.clear();
            this.updateBatchExportButton();
            return;
        }

        DOM.emptyState.classList.add('d-none');
        DOM.invoiceTable.classList.remove('d-none');

        // Sort invoices
        const sorted = this.sortInvoices(invoices);

        const rows = sorted.map(invoice => this.createRow(invoice)).join('');
        DOM.invoiceTableBody.innerHTML = rows;

        // Update sort indicators
        this.updateSortIndicators();
        this.updateSelectAllCheckbox();
        this.updateBatchExportButton();
    },

    createRow(invoice) {
        const voucherCount = invoice.voucher_count || 0;
        const voucherBadge = voucherCount > 0
            ? `<span class="badge bg-success voucher-badge">${voucherCount}</span>`
            : `<span class="badge bg-secondary voucher-badge">0</span>`;
        const isChecked = AppState.selectedInvoices.has(invoice.invoice_number);

        // 报销状态显示
        const reimbursementStatus = invoice.reimbursement_status || '未报销';
        const isReimbursed = reimbursementStatus === '已报销';
        const statusBadgeClass = isReimbursed ? 'bg-success' : 'bg-warning text-dark';
        const isAdmin = AppState.currentUser?.is_admin;

        // 管理员可以点击切换状态
        const statusCell = isAdmin
            ? `<span class="badge ${statusBadgeClass} reimbursement-status-badge" 
                     style="cursor: pointer;" 
                     data-invoice-number="${Utils.escapeHtml(invoice.invoice_number)}"
                     data-current-status="${Utils.escapeHtml(reimbursementStatus)}"
                     title="点击切换状态">${Utils.escapeHtml(reimbursementStatus)}</span>`
            : `<span class="badge ${statusBadgeClass}">${Utils.escapeHtml(reimbursementStatus)}</span>`;

        // 记录类型标识 (Requirements: 13.1, 13.2, 13.3)
        const recordType = invoice.record_type || 'invoice';
        const recordTypeBadge = recordType === 'manual'
            ? '<span class="badge badge-manual"><i class="bi bi-pencil-square me-1"></i>无票报销</span>'
            : '<span class="badge badge-invoice"><i class="bi bi-file-earmark-pdf me-1"></i>有发票</span>';

        return `
            <tr data-invoice-number="${Utils.escapeHtml(invoice.invoice_number)}">
                <td class="text-center">
                    <input type="checkbox" class="form-check-input invoice-checkbox" 
                           data-invoice-number="${Utils.escapeHtml(invoice.invoice_number)}"
                           ${isChecked ? 'checked' : ''}>
                </td>
                <td>${Utils.escapeHtml(invoice.invoice_number)}</td>
                <td>${Utils.escapeHtml(invoice.invoice_date)}</td>
                <td>${Utils.escapeHtml(invoice.item_name)}</td>
                <td class="text-end amount-cell">${Utils.formatCurrency(invoice.amount)}</td>
                <td>${Utils.escapeHtml(invoice.reimbursement_person_name || '-')}</td>
                <td>${Utils.escapeHtml(invoice.remark || '-')}</td>
                <td>${Utils.escapeHtml(invoice.uploaded_by || '-')}</td>
                <td><small class="text-muted">${Utils.escapeHtml(invoice.time_ago || '-')}</small></td>
                <td class="text-center">${statusCell}</td>
                <td class="text-center">${recordTypeBadge}</td>
                <td class="text-center">${voucherBadge}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary me-1 view-btn" title="查看详情">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success me-1 export-docx-btn" title="导出DOCX">
                        <i class="bi bi-file-earmark-word"></i>
                    </button>
                    ${isAdmin ? `<button class="btn btn-sm btn-outline-info me-1 signature-btn" title="电子签章">
                        <i class="bi bi-pen"></i>
                    </button>` : ''}
                    <button class="btn btn-sm btn-outline-warning me-1 edit-btn" title="修改">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-btn" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    },

    toggleSelectAll(checked) {
        if (checked) {
            AppState.invoices.forEach(inv => AppState.selectedInvoices.add(inv.invoice_number));
        } else {
            AppState.selectedInvoices.clear();
        }
        this.updateCheckboxes();
        this.updateBatchExportButton();
    },

    toggleInvoiceSelection(invoiceNumber, checked) {
        if (checked) {
            AppState.selectedInvoices.add(invoiceNumber);
        } else {
            AppState.selectedInvoices.delete(invoiceNumber);
        }
        this.updateSelectAllCheckbox();
        this.updateBatchExportButton();
    },

    updateCheckboxes() {
        document.querySelectorAll('.invoice-checkbox').forEach(cb => {
            cb.checked = AppState.selectedInvoices.has(cb.dataset.invoiceNumber);
        });
        this.updateSelectAllCheckbox();
    },

    updateSelectAllCheckbox() {
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb && AppState.invoices.length > 0) {
            selectAllCb.checked = AppState.selectedInvoices.size === AppState.invoices.length;
            selectAllCb.indeterminate = AppState.selectedInvoices.size > 0 &&
                AppState.selectedInvoices.size < AppState.invoices.length;
        }
    },

    updateBatchExportButton() {
        const btn = document.getElementById('batchExportDocxBtn');
        if (btn) {
            const count = AppState.selectedInvoices.size;
            btn.disabled = count === 0;
            btn.innerHTML = count > 0
                ? `<i class="bi bi-file-earmark-word me-1"></i>批量导出DOCX (${count})`
                : `<i class="bi bi-file-earmark-word me-1"></i>批量导出DOCX`;
        }
    },

    sortInvoices(invoices) {
        const { column, direction } = AppState.currentSort;

        return [...invoices].sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            // Handle amount as number
            if (column === 'amount') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            let comparison = 0;
            if (valA < valB) comparison = -1;
            if (valA > valB) comparison = 1;

            return direction === 'asc' ? comparison : -comparison;
        });
    },

    updateSortIndicators() {
        // Remove all sort classes
        document.querySelectorAll('.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });

        // Add sort class to current column
        const currentTh = document.querySelector(`.sortable[data-sort="${AppState.currentSort.column}"]`);
        if (currentTh) {
            currentTh.classList.add(AppState.currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    },

    handleSort(column) {
        if (AppState.currentSort.column === column) {
            // Toggle direction
            AppState.currentSort.direction = AppState.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // New column, default to ascending
            AppState.currentSort.column = column;
            AppState.currentSort.direction = 'asc';
        }

        // Re-render with new sort
        this.render(AppState.invoices);
    }
};


// ============================================
// Search Functionality (Task 6.4)
// ============================================
const Search = {
    async execute(query) {
        AppState.searchQuery = query;
        try {
            const { startDate, endDate } = AppState.dateFilter;
            const data = await API.getInvoices(
                query,
                startDate,
                endDate,
                AppState.personFilter,
                AppState.uploaderFilter,
                AppState.reimbursementStatusFilter,
                AppState.recordTypeFilter
            );
            InvoiceTable.render(data.invoices);
            Statistics.update(
                data.total_count,
                data.total_amount,
                data.invoice_count,
                data.manual_count,
                data.invoice_amount,
                data.manual_amount
            );
        } catch (error) {
            if (error.message !== '需要登录') {
                Toast.error('搜索失败: ' + error.message);
            }
        }
    },

    clear() {
        DOM.searchInput.value = '';
        this.execute('');
    }
};

// ============================================
// Date Filter Functionality
// ============================================
const DateFilter = {
    apply() {
        const startDate = DOM.startDateInput?.value || '';
        const endDate = DOM.endDateInput?.value || '';

        AppState.dateFilter.startDate = startDate;
        AppState.dateFilter.endDate = endDate;

        Search.execute(AppState.searchQuery);
    },

    clear() {
        if (DOM.startDateInput) DOM.startDateInput.value = '';
        if (DOM.endDateInput) DOM.endDateInput.value = '';
        AppState.dateFilter.startDate = '';
        AppState.dateFilter.endDate = '';
        Search.execute(AppState.searchQuery);
    }
};

// ============================================
// Person/Uploader Filter Functionality
// ============================================
const PersonFilter = {
    async loadUploaders() {
        try {
            const data = await API.getUploaders();
            this.populateUploaderSelect(data.uploaders || []);
        } catch (error) {
            console.error('Failed to load uploaders:', error);
        }
    },

    populateUploaderSelect(uploaders) {
        const select = document.getElementById('uploaderFilterSelect');
        if (!select) return;

        select.innerHTML = '<option value="">全部上传人</option>';
        uploaders.forEach(uploader => {
            const option = document.createElement('option');
            option.value = uploader;
            option.textContent = uploader;
            select.appendChild(option);
        });
    },

    async loadPersons() {
        try {
            const data = await API.getReimbursementPersons();
            this.populatePersonSelect(data.persons || []);
        } catch (error) {
            console.error('Failed to load persons:', error);
        }
    },

    populatePersonSelect(persons) {
        const select = document.getElementById('personFilterSelect');
        if (!select) return;

        select.innerHTML = '<option value="">全部报销人</option>';
        persons.forEach(person => {
            const option = document.createElement('option');
            option.value = person.id;
            option.textContent = person.name;
            select.appendChild(option);
        });
    },

    applyPersonFilter() {
        const select = document.getElementById('personFilterSelect');
        AppState.personFilter = select?.value || '';
        Search.execute(AppState.searchQuery);
    },

    applyUploaderFilter() {
        const select = document.getElementById('uploaderFilterSelect');
        AppState.uploaderFilter = select?.value || '';
        Search.execute(AppState.searchQuery);
    },

    clearFilters() {
        const personSelect = document.getElementById('personFilterSelect');
        const uploaderSelect = document.getElementById('uploaderFilterSelect');
        if (personSelect) personSelect.value = '';
        if (uploaderSelect) uploaderSelect.value = '';
        AppState.personFilter = '';
        AppState.uploaderFilter = '';
        // 保留当前标签页的状态筛选
        Search.execute(AppState.searchQuery);
    }
};

// ============================================
// Record Type Filter Functionality (Requirements: 13.4, 13.5)
// ============================================
const RecordTypeFilter = {
    applyFilter() {
        const checkedRadio = document.querySelector('input[name="adminRecordTypeFilter"]:checked');
        AppState.recordTypeFilter = checkedRadio?.value || '';
        Search.execute(AppState.searchQuery);
    },

    clearFilter() {
        const allRadio = document.getElementById('admin-filter-all');
        if (allRadio) {
            allRadio.checked = true;
            AppState.recordTypeFilter = '';
            Search.execute(AppState.searchQuery);
        }
    }
};

// ============================================
// File Upload Functionality (Task 6.5)
// ============================================
const Upload = {
    modalInstance: null,
    uploadInvoiceModalInstance: null,
    isUploading: false,
    // 报销人分组列表，每个分组包含: { personId, personName, records: [{ pdfFile, voucherFiles }] }
    personGroups: [],
    groupIdCounter: 0,
    recordIdCounter: 0,
    // 缓存报销人列表
    cachedPersons: [],

    init() {
        this.modalInstance = new bootstrap.Modal(DOM.uploadProgressModal);
        if (DOM.uploadInvoiceModal) {
            this.uploadInvoiceModalInstance = new bootstrap.Modal(DOM.uploadInvoiceModal);
        }
    },

    async showUploadModal() {
        // Reset form
        if (DOM.uploadInvoiceForm) DOM.uploadInvoiceForm.reset();
        if (DOM.uploadInvoiceError) DOM.uploadInvoiceError.classList.add('d-none');

        // 重置报销人分组列表
        this.personGroups = [];
        this.groupIdCounter = 0;
        this.recordIdCounter = 0;

        // 加载报销人列表并缓存
        await ReimbursementPerson.loadPersons();
        this.cachedPersons = ReimbursementPerson.persons;

        this.renderPersonGroups();

        // 显示提示信息
        const hint = document.getElementById('uploadHint');
        if (hint) hint.classList.remove('d-none');

        if (this.uploadInvoiceModalInstance) {
            this.uploadInvoiceModalInstance.show();
        }
    },

    hideUploadModal() {
        if (this.uploadInvoiceModalInstance) {
            this.uploadInvoiceModalInstance.hide();
        }
    },

    /**
     * 添加一个新的报销人分组
     */
    addPersonGroup() {
        const groupId = ++this.groupIdCounter;
        this.personGroups.push({
            id: groupId,
            personId: null,
            personName: '',
            isNewPerson: false,
            newPersonName: '',
            records: []
        });
        this.renderPersonGroups();

        // 隐藏提示信息
        const hint = document.getElementById('uploadHint');
        if (hint) hint.classList.add('d-none');
    },

    /**
     * 删除一个报销人分组
     */
    removePersonGroup(groupId) {
        this.personGroups = this.personGroups.filter(g => g.id !== groupId);
        this.renderPersonGroups();

        // 如果没有分组了，显示提示信息
        if (this.personGroups.length === 0) {
            const hint = document.getElementById('uploadHint');
            if (hint) hint.classList.remove('d-none');
        }
    },

    /**
     * 为指定报销人分组添加发票记录
     */
    addRecordToGroup(groupId) {
        const group = this.personGroups.find(g => g.id === groupId);
        if (!group) return;

        const recordId = ++this.recordIdCounter;
        group.records.push({
            id: recordId,
            pdfFile: null,
            voucherFiles: []
        });
        this.renderPersonGroups();
    },

    /**
     * 从指定报销人分组删除发票记录
     */
    removeRecordFromGroup(groupId, recordId) {
        const group = this.personGroups.find(g => g.id === groupId);
        if (!group) return;

        group.records = group.records.filter(r => r.id !== recordId);
        this.renderPersonGroups();
    },

    /**
     * 生成报销人选择下拉框的HTML
     */
    getPersonSelectHtml(groupId, selectedPersonId) {
        const options = this.cachedPersons.map(p =>
            `<option value="${p.id}" ${p.id === selectedPersonId ? 'selected' : ''}>${Utils.escapeHtml(p.name)}</option>`
        ).join('');
        return `
            <option value="">-- 选择报销人 --</option>
            ${options}
            <option value="__new__">➕ 添加新报销人</option>
        `;
    },

    /**
     * 渲染报销人分组列表
     */
    renderPersonGroups() {
        const container = document.getElementById('personGroupsContainer');
        if (!container) return;

        if (this.personGroups.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.personGroups.map((group, gIndex) => `
            <div class="card mb-3 border-primary person-group-card" data-group-id="${group.id}">
                <div class="card-header bg-primary bg-opacity-10 py-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center flex-grow-1 me-2">
                            <i class="bi bi-person-circle me-2 text-primary"></i>
                            <span class="fw-semibold me-2">报销人 ${gIndex + 1}:</span>
                            ${group.isNewPerson ? `
                                <div class="input-group input-group-sm" style="max-width: 250px;">
                                    <input type="text" class="form-control new-person-name-input" 
                                           data-group-id="${group.id}" placeholder="输入新报销人姓名" 
                                           value="${Utils.escapeHtml(group.newPersonName)}">
                                    <button class="btn btn-outline-secondary cancel-new-person-btn" 
                                            type="button" data-group-id="${group.id}" title="取消">
                                        <i class="bi bi-x"></i>
                                    </button>
                                </div>
                            ` : `
                                <select class="form-select form-select-sm person-select" 
                                        data-group-id="${group.id}" style="max-width: 200px;">
                                    ${this.getPersonSelectHtml(group.id, group.personId)}
                                </select>
                            `}
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger remove-group-btn" 
                                data-group-id="${group.id}" title="删除报销人">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="card-body py-2">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <small class="text-muted">发票记录 (${group.records.length})</small>
                        <button type="button" class="btn btn-sm btn-outline-primary add-record-btn" 
                                data-group-id="${group.id}">
                            <i class="bi bi-plus me-1"></i>添加发票
                        </button>
                    </div>
                    <div class="records-container" data-group-id="${group.id}">
                        ${group.records.length === 0 ? `
                            <div class="text-center text-muted py-2 small">
                                <i class="bi bi-inbox"></i> 暂无发票记录，点击上方按钮添加
                            </div>
                        ` : group.records.map((record, rIndex) => `
                            <div class="card mb-2 record-card" data-record-id="${record.id}">
                                <div class="card-body py-2 px-3">
                                    <div class="d-flex justify-content-between align-items-start">
                                        <div class="flex-grow-1">
                                            <div class="row g-2">
                                                <div class="col-md-6">
                                                    <label class="form-label small mb-1">
                                                        <i class="bi bi-file-earmark-pdf text-danger me-1"></i>发票PDF <span class="text-danger">*</span>
                                                    </label>
                                                    <input type="file" class="form-control form-control-sm pdf-input" 
                                                           data-group-id="${group.id}" data-record-id="${record.id}" accept=".pdf">
                                                    <div class="pdf-preview mt-1" data-group-id="${group.id}" data-record-id="${record.id}">
                                                        ${record.pdfFile ? `
                                                            <small class="text-success">
                                                                <i class="bi bi-check-circle me-1"></i>${Utils.escapeHtml(record.pdfFile.name)}
                                                            </small>
                                                        ` : ''}
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <label class="form-label small mb-1">
                                                        <i class="bi bi-images text-info me-1"></i>凭证图片 <span class="text-muted">(可选)</span>
                                                    </label>
                                                    <input type="file" class="form-control form-control-sm voucher-input" 
                                                           data-group-id="${group.id}" data-record-id="${record.id}" 
                                                           accept=".jpg,.jpeg,.png" multiple>
                                                    <div class="voucher-preview mt-1 d-flex flex-wrap gap-1" 
                                                         data-group-id="${group.id}" data-record-id="${record.id}">
                                                        ${record.voucherFiles.map((f, i) => `
                                                            <span class="badge bg-info small">${i + 1}</span>
                                                        `).join('')}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <button type="button" class="btn btn-sm btn-link text-danger remove-record-btn ms-2" 
                                                data-group-id="${group.id}" data-record-id="${record.id}" title="删除">
                                            <i class="bi bi-x-lg"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');

        // 绑定事件
        this.bindGroupEvents();
    },

    /**
     * 绑定报销人分组的事件
     */
    bindGroupEvents() {
        const container = document.getElementById('personGroupsContainer');
        if (!container) return;

        // 删除报销人分组
        container.querySelectorAll('.remove-group-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = parseInt(e.currentTarget.dataset.groupId);
                this.removePersonGroup(groupId);
            });
        });

        // 报销人选择
        container.querySelectorAll('.person-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const groupId = parseInt(e.target.dataset.groupId);
                const group = this.personGroups.find(g => g.id === groupId);
                if (!group) return;

                if (e.target.value === '__new__') {
                    // 切换到新增报销人模式
                    group.isNewPerson = true;
                    group.personId = null;
                    group.newPersonName = '';
                    this.renderPersonGroups();
                } else {
                    group.personId = e.target.value ? parseInt(e.target.value) : null;
                    const person = this.cachedPersons.find(p => p.id === group.personId);
                    group.personName = person ? person.name : '';
                }
            });
        });

        // 新报销人名称输入
        container.querySelectorAll('.new-person-name-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const groupId = parseInt(e.target.dataset.groupId);
                const group = this.personGroups.find(g => g.id === groupId);
                if (group) {
                    group.newPersonName = e.target.value;
                }
            });
        });

        // 取消新增报销人
        container.querySelectorAll('.cancel-new-person-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = parseInt(e.currentTarget.dataset.groupId);
                const group = this.personGroups.find(g => g.id === groupId);
                if (group) {
                    group.isNewPerson = false;
                    group.newPersonName = '';
                    this.renderPersonGroups();
                }
            });
        });

        // 添加发票记录
        container.querySelectorAll('.add-record-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = parseInt(e.currentTarget.dataset.groupId);
                this.addRecordToGroup(groupId);
            });
        });

        // 删除发票记录
        container.querySelectorAll('.remove-record-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = parseInt(e.currentTarget.dataset.groupId);
                const recordId = parseInt(e.currentTarget.dataset.recordId);
                this.removeRecordFromGroup(groupId, recordId);
            });
        });

        // PDF文件选择
        container.querySelectorAll('.pdf-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const groupId = parseInt(e.target.dataset.groupId);
                const recordId = parseInt(e.target.dataset.recordId);
                const group = this.personGroups.find(g => g.id === groupId);
                if (!group) return;
                const record = group.records.find(r => r.id === recordId);
                if (record && e.target.files.length > 0) {
                    record.pdfFile = e.target.files[0];
                    const preview = container.querySelector(`.pdf-preview[data-group-id="${groupId}"][data-record-id="${recordId}"]`);
                    if (preview) {
                        preview.innerHTML = `<small class="text-success"><i class="bi bi-check-circle me-1"></i>${Utils.escapeHtml(record.pdfFile.name)}</small>`;
                    }
                }
            });
        });

        // 凭证文件选择
        container.querySelectorAll('.voucher-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const groupId = parseInt(e.target.dataset.groupId);
                const recordId = parseInt(e.target.dataset.recordId);
                const group = this.personGroups.find(g => g.id === groupId);
                if (!group) return;
                const record = group.records.find(r => r.id === recordId);
                if (record) {
                    record.voucherFiles = Array.from(e.target.files);
                    const preview = container.querySelector(`.voucher-preview[data-group-id="${groupId}"][data-record-id="${recordId}"]`);
                    if (preview) {
                        preview.innerHTML = record.voucherFiles.map((f, i) => `<span class="badge bg-info small">${i + 1}</span>`).join('');
                    }
                }
            });
        });
    },

    /**
     * Handle batch upload of PDF invoices with optional vouchers.
     * 按报销人分组上传，每个记录有各自的凭证
     */
    async handleUploadWithVouchers() {
        // 验证是否有报销人分组
        if (this.personGroups.length === 0) {
            if (DOM.uploadInvoiceError) {
                DOM.uploadInvoiceError.textContent = '请添加至少一个报销人';
                DOM.uploadInvoiceError.classList.remove('d-none');
            }
            return;
        }

        // 验证每个分组都有报销人和发票记录
        for (let i = 0; i < this.personGroups.length; i++) {
            const group = this.personGroups[i];
            if (group.isNewPerson) {
                if (!group.newPersonName.trim()) {
                    if (DOM.uploadInvoiceError) {
                        DOM.uploadInvoiceError.textContent = `报销人 ${i + 1} 请输入新报销人姓名`;
                        DOM.uploadInvoiceError.classList.remove('d-none');
                    }
                    return;
                }
            } else if (!group.personId) {
                if (DOM.uploadInvoiceError) {
                    DOM.uploadInvoiceError.textContent = `报销人 ${i + 1} 请选择报销人`;
                    DOM.uploadInvoiceError.classList.remove('d-none');
                }
                return;
            }

            if (group.records.length === 0) {
                if (DOM.uploadInvoiceError) {
                    DOM.uploadInvoiceError.textContent = `报销人 ${i + 1} 请添加至少一条发票记录`;
                    DOM.uploadInvoiceError.classList.remove('d-none');
                }
                return;
            }

            const invalidRecords = group.records.filter(r => !r.pdfFile);
            if (invalidRecords.length > 0) {
                if (DOM.uploadInvoiceError) {
                    DOM.uploadInvoiceError.textContent = `报销人 ${i + 1} 有发票记录未选择PDF文件`;
                    DOM.uploadInvoiceError.classList.remove('d-none');
                }
                return;
            }
        }

        if (this.isUploading) return;
        this.isUploading = true;

        // 计算总记录数
        const totalRecords = this.personGroups.reduce((sum, g) => sum + g.records.length, 0);
        let processedCount = 0;

        // Track upload results
        let successCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;
        let lastDuplicateInfo = null;

        try {
            // Hide upload modal and show progress
            this.hideUploadModal();
            await new Promise(resolve => setTimeout(resolve, 300));

            // 开始允许显示进度
            this.startProgress();

            // 处理每个报销人分组
            for (const group of this.personGroups) {
                let personId = group.personId;

                // 如果是新报销人，先创建
                if (group.isNewPerson && group.newPersonName.trim()) {
                    try {
                        const result = await API.createReimbursementPerson(group.newPersonName.trim());
                        if (result.success && result.person) {
                            personId = result.person.id;
                        } else {
                            Toast.error(`创建报销人 "${group.newPersonName}" 失败`);
                            continue;
                        }
                    } catch (e) {
                        Toast.error(`创建报销人 失败: ${e.message}`);
                        continue;
                    }
                }

                // 处理该报销人的每条发票记录
                for (const record of group.records) {
                    processedCount++;

                    // Update progress display
                    this.showProgress(
                        Math.round((processedCount / totalRecords) * 100),
                        `正在处理 ${processedCount}/${totalRecords} 条记录...`
                    );

                    try {
                        // Upload invoice with reimbursement person
                        const invoiceResult = await API.uploadInvoice(record.pdfFile, personId);

                        if (invoiceResult.success) {
                            successCount++;

                            // Upload vouchers for this specific invoice
                            if (record.voucherFiles.length > 0) {
                                const invoiceNumber = invoiceResult.invoice.invoice_number;
                                for (const voucherFile of record.voucherFiles) {
                                    try {
                                        await API.uploadVoucher(invoiceNumber, voucherFile);
                                    } catch (e) {
                                        console.error('Voucher upload failed:', e);
                                    }
                                }
                            }
                        } else if (invoiceResult.is_duplicate) {
                            duplicateCount++;
                            if (invoiceResult.invoice && invoiceResult.original_invoice) {
                                lastDuplicateInfo = {
                                    newInvoice: invoiceResult.invoice,
                                    existingInvoice: invoiceResult.original_invoice
                                };
                            }
                        } else {
                            errorCount++;
                        }
                    } catch (e) {
                        errorCount++;
                        console.error('Invoice upload failed:', e);
                    }
                }
            }

            // Final progress update
            this.showProgress(100, '处理完成');

            await this.forceHideProgress();
            this.isUploading = false;

            // Show result feedback
            if (successCount > 0) {
                Toast.success(`成功上传 ${successCount} 张发票`);
            }
            if (duplicateCount > 0) {
                Toast.warning(`${duplicateCount} 张发票已存在，已跳过`);
            }
            if (errorCount > 0) {
                Toast.error(`${errorCount} 条记录处理失败`);
            }

            // Show duplicate modal only when exactly one duplicate is found
            if (duplicateCount === 1 && lastDuplicateInfo) {
                await this.showDuplicateWarning(lastDuplicateInfo.newInvoice, lastDuplicateInfo.existingInvoice);
            }

            // Refresh invoice list
            await App.loadInvoices();

        } catch (error) {
            await this.forceHideProgress();
            this.isUploading = false;
            Toast.error('上传失败: ' + error.message);
        }
    },

    async handleFiles(files) {
        if (!files || files.length === 0) return;
        if (this.isUploading) return; // 防止重复上传

        this.isUploading = true;
        this.startProgress();  // 开始允许显示进度
        const fileArray = Array.from(files);
        const total = fileArray.length;
        let processed = 0;
        let successCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;
        let duplicateInfo = null;

        try {
            // Show progress modal
            this.showProgress(0, `正在处理 0/${total} 个文件...`);

            for (const file of fileArray) {
                try {
                    const result = await API.uploadInvoice(file);
                    processed++;

                    if (result.success) {
                        successCount++;
                    } else if (result.is_duplicate) {
                        duplicateCount++;
                        if (result.invoice && result.original_invoice) {
                            duplicateInfo = { newInvoice: result.invoice, existingInvoice: result.original_invoice };
                        }
                    } else {
                        errorCount++;
                        // 不在循环中显示错误，避免阻塞
                    }

                    const progress = Math.round((processed / total) * 100);
                    this.showProgress(progress, `正在处理 ${processed}/${total} 个文件...`);

                } catch (error) {
                    processed++;
                    errorCount++;
                }
            }
        } catch (e) {
            console.error('Upload error:', e);
        }

        // 确保进度框一定会关闭（等待关闭完成）
        await this.forceHideProgress();
        this.isUploading = false;

        // Show summary (Requirements: 3.1, 3.2, 3.3)
        if (successCount > 0) {
            Toast.success(`成功添加 ${successCount} 张发票`);
        }
        if (duplicateCount > 0) {
            Toast.warning(`${duplicateCount} 张发票已存在，已跳过`);
        }
        if (errorCount > 0) {
            Toast.error(`${errorCount} 个文件处理失败（可能不是有效发票或无法识别）`);
        }

        // Show duplicate modal only when exactly one duplicate is found (Requirements: 3.4)
        if (duplicateCount === 1 && duplicateInfo) {
            // Use await to ensure proper modal timing (Requirement 1.1)
            await this.showDuplicateWarning(duplicateInfo.newInvoice, duplicateInfo.existingInvoice);
        }

        // Refresh invoice list
        await App.loadInvoices();
    },

    progressAllowed: false,  // 是否允许显示进度框
    progressShowing: false,   // 进度框当前是否显示

    showProgress(percent, text) {
        // 只有在允许显示时才显示
        if (!this.progressAllowed) return;

        DOM.uploadProgressBar.style.width = `${percent}%`;
        DOM.uploadProgressText.textContent = text;

        if (!this.progressShowing) {
            this.progressShowing = true;
            this.modalInstance.show();
        }
    },

    hideProgress() {
        this.progressAllowed = false;
        this.progressShowing = false;
        try {
            this.modalInstance.hide();
        } catch (e) {
            console.error('Hide progress error:', e);
        }
        DOM.uploadProgressBar.style.width = '0%';
    },

    async forceHideProgress() {
        // 禁止再显示进度框
        this.progressAllowed = false;
        this.progressShowing = false;

        const modalEl = DOM.uploadProgressModal;

        // 使用 Promise 等待模态框关闭动画完成
        await new Promise(resolve => {
            const onHidden = () => {
                modalEl.removeEventListener('hidden.bs.modal', onHidden);
                resolve();
            };

            // 如果模态框正在显示，等待它关闭
            if (modalEl && modalEl.classList.contains('show')) {
                modalEl.addEventListener('hidden.bs.modal', onHidden);
                try {
                    this.modalInstance.hide();
                } catch (e) { }

                // 设置超时，防止事件没有触发
                setTimeout(() => {
                    modalEl.removeEventListener('hidden.bs.modal', onHidden);
                    resolve();
                }, 500);
            } else {
                resolve();
            }
        });

        // 直接操作 DOM 确保关闭
        if (modalEl) {
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
            modalEl.setAttribute('aria-hidden', 'true');
        }

        // 移除所有 backdrop
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());

        // 恢复 body 滚动
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        DOM.uploadProgressBar.style.width = '0%';

        // 额外等待确保 DOM 完全更新
        await new Promise(resolve => setTimeout(resolve, 100));
    },

    // 开始显示进度（在上传开始时调用）
    startProgress() {
        this.progressAllowed = true;
        this.progressShowing = false;
    },

    /**
     * Safely show a modal after ensuring the progress modal is fully closed.
     * Uses Promise-based waiting with proper timeout handling.
     * Requirements: 1.1, 1.2, 1.3
     * @param {bootstrap.Modal} modalInstance - The Bootstrap modal instance to show
     * @param {number} minDelay - Minimum delay in ms between modal transitions (default: 300ms)
     * @returns {Promise<void>}
     */
    async safeShowModal(modalInstance, minDelay = 300) {
        // First, ensure progress modal is fully closed
        await this.forceHideProgress();

        // Wait for minimum delay to ensure proper animation completion (Requirement 1.3)
        await new Promise(resolve => setTimeout(resolve, minDelay));

        // Double-check that all backdrop elements are removed (Requirement 1.2)
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());

        // Restore body state
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        // Now show the new modal
        if (modalInstance) {
            modalInstance.show();
        }
    },

    /**
     * Show duplicate warning modal after ensuring progress modal is fully closed.
     * Requirements: 1.1, 1.2
     * @param {Object} newInvoice - The new invoice data
     * @param {Object} existingInvoice - The existing invoice data
     * @returns {Promise<void>}
     */
    async showDuplicateWarning(newInvoice, existingInvoice) {
        // 确保进度框已完全关闭
        await this.forceHideProgress();

        // 额外等待确保模态框动画完成
        await new Promise(resolve => setTimeout(resolve, 300));

        // Populate new invoice data
        DOM.newInvoiceNumber.textContent = newInvoice.invoice_number || '-';
        DOM.newInvoiceDate.textContent = newInvoice.invoice_date || '-';
        DOM.newItemName.textContent = newInvoice.item_name || '-';
        DOM.newAmount.textContent = Utils.formatCurrency(newInvoice.amount);
        DOM.newRemark.textContent = newInvoice.remark || '-';

        // Populate existing invoice data
        DOM.existingInvoiceNumber.textContent = existingInvoice.invoice_number || '-';
        DOM.existingInvoiceDate.textContent = existingInvoice.invoice_date || '-';
        DOM.existingItemName.textContent = existingInvoice.item_name || '-';
        DOM.existingAmount.textContent = Utils.formatCurrency(existingInvoice.amount);
        DOM.existingRemark.textContent = existingInvoice.remark || '-';

        // 显示上传人和上传时间
        const existingUploadedBy = document.getElementById('existingUploadedBy');
        const existingScanTime = document.getElementById('existingScanTime');
        if (existingUploadedBy) {
            existingUploadedBy.textContent = existingInvoice.uploaded_by || '-';
        }
        if (existingScanTime) {
            existingScanTime.textContent = existingInvoice.scan_time
                ? Utils.formatDateTime(existingInvoice.scan_time)
                : '-';
        }

        // 再次确保清理所有 backdrop
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        // 显示重复发票弹窗
        const duplicateModalInstance = new bootstrap.Modal(DOM.duplicateModal);
        duplicateModalInstance.show();
    }
};

// ============================================
// Modal Dialogs (Task 6.6)
// ============================================
const Modals = {
    detailModalInstance: null,
    deleteModalInstance: null,
    editModalInstance: null,
    pdfPreviewModalInstance: null,

    init() {
        this.detailModalInstance = new bootstrap.Modal(DOM.detailModal);
        this.deleteModalInstance = new bootstrap.Modal(DOM.deleteModal);
        this.editModalInstance = new bootstrap.Modal(DOM.editModal);
        this.pdfPreviewModalInstance = new bootstrap.Modal(DOM.pdfPreviewModal);
    },

    async showDetail(invoice) {
        AppState.currentInvoice = invoice;

        DOM.detailInvoiceNumber.textContent = invoice.invoice_number || '-';
        DOM.detailInvoiceDate.textContent = invoice.invoice_date || '-';
        DOM.detailItemName.textContent = invoice.item_name || '-';
        DOM.detailAmount.textContent = Utils.formatCurrency(invoice.amount);
        DOM.detailReimbursementPerson.textContent = invoice.reimbursement_person_name || '-';
        DOM.detailRemark.textContent = invoice.remark || '-';
        DOM.detailUploadedBy.textContent = invoice.uploaded_by || '-';
        DOM.detailScanTime.textContent = Utils.formatDateTime(invoice.scan_time);

        // 显示文件名（只取最后一部分）
        const filePath = invoice.file_path || '-';
        const fileName = filePath.split(/[/\\]/).pop();
        DOM.detailFilePath.textContent = fileName;
        DOM.detailFilePath.title = filePath;

        // Load vouchers for this invoice
        await VoucherGallery.loadVouchers(invoice.invoice_number);

        this.detailModalInstance.show();
    },

    previewPdf() {
        if (!AppState.currentInvoice) return;

        const url = API.getPdfUrl(AppState.currentInvoice.invoice_number, true);
        DOM.pdfPreviewFrame.src = url;
        this.pdfPreviewModalInstance.show();
    },

    showDeleteConfirm(invoice) {
        AppState.currentInvoice = invoice;

        DOM.deleteInvoiceNumber.textContent = invoice.invoice_number || '-';
        DOM.deleteItemName.textContent = invoice.item_name || '-';
        DOM.deleteAmount.textContent = Utils.formatCurrency(invoice.amount);

        this.deleteModalInstance.show();
    },

    showEdit(invoice) {
        AppState.currentInvoice = invoice;
        DOM.editError.classList.add('d-none');

        DOM.editInvoiceNumber.value = invoice.invoice_number || '';
        DOM.editInvoiceDate.value = invoice.invoice_date || '';
        DOM.editItemName.value = invoice.item_name || '';
        DOM.editAmount.value = parseFloat(invoice.amount) || 0;
        DOM.editRemark.value = invoice.remark || '';

        this.editModalInstance.show();
    },

    async confirmEdit() {
        if (!AppState.currentInvoice) return;

        const data = {
            invoice_date: DOM.editInvoiceDate.value.trim(),
            item_name: DOM.editItemName.value.trim(),
            amount: parseFloat(DOM.editAmount.value) || 0,
            remark: DOM.editRemark.value.trim()
        };

        // 验证
        if (!data.invoice_date) {
            DOM.editError.textContent = '开票日期不能为空';
            DOM.editError.classList.remove('d-none');
            return;
        }
        if (data.amount <= 0) {
            DOM.editError.textContent = '金额必须大于0';
            DOM.editError.classList.remove('d-none');
            return;
        }

        try {
            const result = await API.updateInvoice(AppState.currentInvoice.invoice_number, data);

            if (result.success) {
                this.editModalInstance.hide();
                Toast.success('修改成功');
                await App.loadInvoices();
            } else {
                DOM.editError.textContent = result.message || '修改失败';
                DOM.editError.classList.remove('d-none');
            }
        } catch (error) {
            DOM.editError.textContent = '修改失败: ' + error.message;
            DOM.editError.classList.remove('d-none');
        }
    },

    async confirmDelete() {
        if (!AppState.currentInvoice) return;

        try {
            const result = await API.deleteInvoice(AppState.currentInvoice.invoice_number);

            this.deleteModalInstance.hide();

            if (result.success) {
                Toast.success('发票删除成功');
                await App.loadInvoices();
            } else {
                Toast.error(result.message || '删除失败');
            }
        } catch (error) {
            Toast.error('删除失败: ' + error.message);
        }
    },

    downloadPdf() {
        if (!AppState.currentInvoice) return;

        const url = API.getPdfUrl(AppState.currentInvoice.invoice_number);
        window.open(url, '_blank');
    }
};

// ============================================
// Export Functionality (Task 6.8)
// ============================================
const Export = {
    download() {
        const url = API.getExportUrl();
        window.location.href = url;
    },

    downloadDocx(invoiceNumber) {
        const url = API.getDocxExportUrl(invoiceNumber);
        window.location.href = url;
    },

    async downloadDocxBatch() {
        const selectedInvoices = Array.from(AppState.selectedInvoices);
        if (selectedInvoices.length === 0) {
            Toast.warning('请先选择要导出的发票');
            return;
        }

        try {
            Toast.show('正在生成文档，请稍候...', 'info');
            const blob = await API.exportDocxBatch(selectedInvoices);

            // 创建下载链接
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
            a.download = `发票批量导出_${timestamp}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            Toast.success(`成功导出 ${selectedInvoices.length} 张发票`);
        } catch (error) {
            Toast.error('批量导出失败: ' + error.message);
        }
    }
};

// ============================================
// Voucher Gallery Functionality
// ============================================
const VoucherGallery = {
    vouchers: [],
    currentIndex: 0,
    zoomLevel: 1,
    lightboxModalInstance: null,
    addVoucherModalInstance: null,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    imageOffset: { x: 0, y: 0 },

    init() {
        if (DOM.voucherLightboxModal) {
            this.lightboxModalInstance = new bootstrap.Modal(DOM.voucherLightboxModal);
        }
        if (DOM.addVoucherModal) {
            this.addVoucherModalInstance = new bootstrap.Modal(DOM.addVoucherModal);
        }
        this.bindLightboxEvents();
    },

    bindLightboxEvents() {
        // Zoom controls
        if (DOM.zoomInBtn) {
            DOM.zoomInBtn.addEventListener('click', () => this.zoom(0.25));
        }
        if (DOM.zoomOutBtn) {
            DOM.zoomOutBtn.addEventListener('click', () => this.zoom(-0.25));
        }
        if (DOM.zoomResetBtn) {
            DOM.zoomResetBtn.addEventListener('click', () => this.resetZoom());
        }

        // Navigation
        if (DOM.prevVoucherBtn) {
            DOM.prevVoucherBtn.addEventListener('click', () => this.navigate(-1));
        }
        if (DOM.nextVoucherBtn) {
            DOM.nextVoucherBtn.addEventListener('click', () => this.navigate(1));
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.lightboxModalInstance || !DOM.voucherLightboxModal.classList.contains('show')) return;

            switch (e.key) {
                case 'ArrowLeft':
                    this.navigate(-1);
                    break;
                case 'ArrowRight':
                    this.navigate(1);
                    break;
                case '+':
                case '=':
                    this.zoom(0.25);
                    break;
                case '-':
                    this.zoom(-0.25);
                    break;
                case '0':
                    this.resetZoom();
                    break;
            }
        });

        // Mouse wheel zoom
        if (DOM.voucherImageContainer) {
            DOM.voucherImageContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                this.zoom(delta);
            });

            // Pan/drag functionality
            DOM.voucherImageContainer.addEventListener('mousedown', (e) => this.startDrag(e));
            DOM.voucherImageContainer.addEventListener('mousemove', (e) => this.drag(e));
            DOM.voucherImageContainer.addEventListener('mouseup', () => this.endDrag());
            DOM.voucherImageContainer.addEventListener('mouseleave', () => this.endDrag());
        }
    },

    startDrag(e) {
        if (this.zoomLevel <= 1) return;
        this.isDragging = true;
        this.dragStart = { x: e.clientX - this.imageOffset.x, y: e.clientY - this.imageOffset.y };
        DOM.voucherImageContainer.style.cursor = 'grabbing';
    },

    drag(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.imageOffset = {
            x: e.clientX - this.dragStart.x,
            y: e.clientY - this.dragStart.y
        };
        this.updateImageTransform();
    },

    endDrag() {
        this.isDragging = false;
        if (DOM.voucherImageContainer) {
            DOM.voucherImageContainer.style.cursor = this.zoomLevel > 1 ? 'grab' : 'default';
        }
    },

    async loadVouchers(invoiceNumber) {
        try {
            const data = await API.getVouchers(invoiceNumber);
            this.vouchers = data.vouchers || [];
            this.renderGallery();
            return this.vouchers.length;
        } catch (error) {
            console.error('Failed to load vouchers:', error);
            this.vouchers = [];
            this.renderGallery();
            return 0;
        }
    },

    renderGallery() {
        if (!DOM.voucherGallery) return;

        DOM.voucherGallery.innerHTML = '';

        if (this.vouchers.length === 0) {
            if (DOM.noVouchersMessage) DOM.noVouchersMessage.classList.remove('d-none');
            if (DOM.detailVoucherCount) DOM.detailVoucherCount.textContent = '0';
            return;
        }

        if (DOM.noVouchersMessage) DOM.noVouchersMessage.classList.add('d-none');
        if (DOM.detailVoucherCount) DOM.detailVoucherCount.textContent = this.vouchers.length;

        this.vouchers.forEach((voucher, index) => {
            const thumbnailDiv = document.createElement('div');
            thumbnailDiv.className = 'voucher-thumbnail-wrapper position-relative';
            thumbnailDiv.innerHTML = `
                <img src="${API.getVoucherImageUrl(voucher.id)}" 
                     alt="${Utils.escapeHtml(voucher.original_filename)}"
                     class="voucher-thumbnail rounded cursor-pointer"
                     data-voucher-index="${index}"
                     title="${Utils.escapeHtml(voucher.original_filename)}">
                <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 voucher-delete-btn" 
                        data-voucher-id="${voucher.id}" title="删除凭证">
                    <i class="bi bi-x"></i>
                </button>
            `;

            // Click to open lightbox
            thumbnailDiv.querySelector('img').addEventListener('click', () => {
                this.openLightbox(index);
            });

            // Delete button
            thumbnailDiv.querySelector('.voucher-delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteVoucher(voucher.id);
            });

            DOM.voucherGallery.appendChild(thumbnailDiv);
        });
    },

    openLightbox(index) {
        if (!this.lightboxModalInstance || this.vouchers.length === 0) return;

        this.currentIndex = index;
        this.resetZoom();
        this.updateLightboxImage();
        this.lightboxModalInstance.show();
    },

    updateLightboxImage() {
        if (!DOM.voucherLightboxImage || this.vouchers.length === 0) return;

        const voucher = this.vouchers[this.currentIndex];
        DOM.voucherLightboxImage.src = API.getVoucherImageUrl(voucher.id);

        if (DOM.voucherLightboxIndex) {
            DOM.voucherLightboxIndex.textContent = `(${this.currentIndex + 1}/${this.vouchers.length})`;
        }

        // Update navigation button visibility
        if (DOM.prevVoucherBtn) {
            DOM.prevVoucherBtn.style.display = this.vouchers.length > 1 ? 'block' : 'none';
        }
        if (DOM.nextVoucherBtn) {
            DOM.nextVoucherBtn.style.display = this.vouchers.length > 1 ? 'block' : 'none';
        }
    },

    navigate(direction) {
        if (this.vouchers.length <= 1) return;

        this.currentIndex += direction;
        if (this.currentIndex < 0) this.currentIndex = this.vouchers.length - 1;
        if (this.currentIndex >= this.vouchers.length) this.currentIndex = 0;

        this.resetZoom();
        this.updateLightboxImage();
    },

    zoom(delta) {
        this.zoomLevel = Math.max(0.5, Math.min(4, this.zoomLevel + delta));
        this.updateImageTransform();

        if (DOM.voucherImageContainer) {
            DOM.voucherImageContainer.style.cursor = this.zoomLevel > 1 ? 'grab' : 'default';
        }
    },

    resetZoom() {
        this.zoomLevel = 1;
        this.imageOffset = { x: 0, y: 0 };
        this.updateImageTransform();

        if (DOM.voucherImageContainer) {
            DOM.voucherImageContainer.style.cursor = 'default';
        }
    },

    updateImageTransform() {
        if (!DOM.voucherLightboxImage) return;
        DOM.voucherLightboxImage.style.transform =
            `translate(${this.imageOffset.x}px, ${this.imageOffset.y}px) scale(${this.zoomLevel})`;
    },

    async deleteVoucher(voucherId) {
        if (!confirm('确定要删除这张凭证吗？')) return;

        try {
            const result = await API.deleteVoucher(voucherId);
            if (result.success) {
                Toast.success('凭证删除成功');
                // Reload vouchers
                if (AppState.currentInvoice) {
                    await this.loadVouchers(AppState.currentInvoice.invoice_number);
                }
                // Update invoice list to reflect new voucher count
                await App.loadInvoices();
            } else {
                Toast.error(result.message || '删除失败');
            }
        } catch (error) {
            Toast.error('删除失败: ' + error.message);
        }
    },

    showAddVoucherModal() {
        if (!this.addVoucherModalInstance) return;

        // Reset form
        if (DOM.addVoucherForm) DOM.addVoucherForm.reset();
        if (DOM.newVoucherPreviewContainer) DOM.newVoucherPreviewContainer.innerHTML = '';
        if (DOM.addVoucherError) DOM.addVoucherError.classList.add('d-none');

        this.addVoucherModalInstance.show();
    },

    hideAddVoucherModal() {
        if (this.addVoucherModalInstance) {
            this.addVoucherModalInstance.hide();
        }
    },

    updateNewVoucherPreview() {
        if (!DOM.newVoucherPreviewContainer || !DOM.newVoucherInput) return;

        DOM.newVoucherPreviewContainer.innerHTML = '';
        const files = Array.from(DOM.newVoucherInput.files);

        files.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewDiv = document.createElement('div');
                previewDiv.className = 'position-relative';
                previewDiv.innerHTML = `
                    <img src="${e.target.result}" alt="${Utils.escapeHtml(file.name)}" 
                         class="rounded" style="width: 60px; height: 60px; object-fit: cover;">
                    <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-secondary" 
                          style="font-size: 0.6rem;">${index + 1}</span>
                `;
                DOM.newVoucherPreviewContainer.appendChild(previewDiv);
            };
            reader.readAsDataURL(file);
        });
    },

    async uploadNewVouchers() {
        if (!DOM.newVoucherInput || !DOM.newVoucherInput.files.length) {
            if (DOM.addVoucherError) {
                DOM.addVoucherError.textContent = '请选择凭证图片';
                DOM.addVoucherError.classList.remove('d-none');
            }
            return;
        }

        if (!AppState.currentInvoice) return;

        const files = Array.from(DOM.newVoucherInput.files);
        const invoiceNumber = AppState.currentInvoice.invoice_number;

        this.hideAddVoucherModal();

        let successCount = 0;
        let errorCount = 0;

        for (const file of files) {
            try {
                const result = await API.uploadVoucher(invoiceNumber, file);
                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (e) {
                errorCount++;
            }
        }

        if (successCount > 0) {
            Toast.success(`成功上传 ${successCount} 张凭证`);
        }
        if (errorCount > 0) {
            Toast.error(`${errorCount} 张凭证上传失败`);
        }

        // Reload vouchers and invoice list
        await this.loadVouchers(invoiceNumber);
        await App.loadInvoices();
    }
};


// ============================================
// Reimbursement Person Management
// ============================================
const ReimbursementPerson = {
    persons: [],

    async loadPersons() {
        try {
            const data = await API.getReimbursementPersons();
            this.persons = data.persons || [];
            this.populateSelect();
            return this.persons;
        } catch (error) {
            console.error('Failed to load reimbursement persons:', error);
            this.persons = [];
            return [];
        }
    },

    populateSelect() {
        if (!DOM.reimbursementPersonSelect) return;

        // Clear existing options except the first placeholder
        DOM.reimbursementPersonSelect.innerHTML = '<option value="">-- 选择报销人 --</option>';

        // Add person options
        this.persons.forEach(person => {
            const option = document.createElement('option');
            option.value = person.id;
            option.textContent = person.name;
            DOM.reimbursementPersonSelect.appendChild(option);
        });
    },

    showNewPersonInput() {
        if (DOM.newPersonInputGroup) {
            DOM.newPersonInputGroup.classList.remove('d-none');
        }
        if (DOM.newPersonNameInput) {
            DOM.newPersonNameInput.value = '';
            DOM.newPersonNameInput.focus();
        }
    },

    hideNewPersonInput() {
        if (DOM.newPersonInputGroup) {
            DOM.newPersonInputGroup.classList.add('d-none');
        }
        if (DOM.newPersonNameInput) {
            DOM.newPersonNameInput.value = '';
        }
    },

    async createNewPerson() {
        if (!DOM.newPersonNameInput) return null;

        const name = DOM.newPersonNameInput.value.trim();
        if (!name) {
            Toast.warning('请输入报销人姓名');
            return null;
        }

        try {
            const result = await API.createReimbursementPerson(name);
            if (result.success) {
                Toast.success('报销人添加成功');
                // Reload persons and select the new one
                await this.loadPersons();
                if (DOM.reimbursementPersonSelect && result.person) {
                    DOM.reimbursementPersonSelect.value = result.person.id;
                }
                this.hideNewPersonInput();
                return result.person;
            } else {
                Toast.error(result.message || '添加报销人失败');
                return null;
            }
        } catch (error) {
            Toast.error('添加报销人失败: ' + error.message);
            return null;
        }
    },

    getSelectedPersonId() {
        if (!DOM.reimbursementPersonSelect) return null;
        const value = DOM.reimbursementPersonSelect.value;
        return value ? parseInt(value, 10) : null;
    },

    getSelectedPersonName() {
        if (!DOM.reimbursementPersonSelect) return null;
        const selectedOption = DOM.reimbursementPersonSelect.options[DOM.reimbursementPersonSelect.selectedIndex];
        return selectedOption && selectedOption.value ? selectedOption.textContent : null;
    },

    reset() {
        if (DOM.reimbursementPersonSelect) {
            DOM.reimbursementPersonSelect.value = '';
        }
        this.hideNewPersonInput();
    }
};

// ============================================
// Authentication
// ============================================
const Auth = {
    loginModalInstance: null,

    init() {
        this.loginModalInstance = new bootstrap.Modal(DOM.loginModal);
    },

    showLoginModal() {
        DOM.loginError.classList.add('d-none');
        DOM.loginUsername.value = '';
        DOM.loginPassword.value = '';
        this.loginModalInstance.show();
    },

    hideLoginModal() {
        this.loginModalInstance.hide();
    },

    async checkAuth() {
        try {
            const data = await API.checkAuth();
            if (data.logged_in) {
                AppState.currentUser = data.user;
                DOM.currentUserName.textContent = data.user.display_name;
                // 显示/隐藏管理员功能
                const adminBtn = document.getElementById('userManagementBtn');
                if (adminBtn) {
                    adminBtn.style.display = data.user.is_admin ? 'inline-block' : 'none';
                }
                return true;
            }
        } catch (e) {
            console.error('Auth check failed:', e);
        }
        return false;
    },

    async login(username, password) {
        try {
            const result = await API.login(username, password);
            if (result.success) {
                AppState.currentUser = result.user;
                DOM.currentUserName.textContent = result.user.display_name;
                // 显示/隐藏管理员功能
                const adminBtn = document.getElementById('userManagementBtn');
                if (adminBtn) {
                    adminBtn.style.display = result.user.is_admin ? 'inline-block' : 'none';
                }
                this.hideLoginModal();
                Toast.success('登录成功');
                // 加载筛选数据
                await PersonFilter.loadPersons();
                await PersonFilter.loadUploaders();
                await App.loadInvoices();
                return true;
            } else {
                DOM.loginError.textContent = result.message;
                DOM.loginError.classList.remove('d-none');
                return false;
            }
        } catch (e) {
            DOM.loginError.textContent = '登录失败，请重试';
            DOM.loginError.classList.remove('d-none');
            return false;
        }
    },

    async logout() {
        try {
            await API.logout();
            AppState.currentUser = null;
            DOM.currentUserName.textContent = '未登录';
            Toast.success('已退出登录');
            this.showLoginModal();
        } catch (e) {
            Toast.error('退出失败');
        }
    }
};

// ============================================
// User Management (Admin Only)
// ============================================
const UserManagement = {
    modalInstance: null,
    users: [],
    editingUserId: null,

    init() {
        const modal = document.getElementById('userManagementModal');
        if (modal) {
            this.modalInstance = new bootstrap.Modal(modal);
        }
    },

    async showModal() {
        if (!AppState.currentUser?.is_admin) {
            Toast.error('需要管理员权限');
            return;
        }
        await this.loadUsers();
        if (this.modalInstance) {
            this.modalInstance.show();
        }
    },

    hideModal() {
        if (this.modalInstance) {
            this.modalInstance.hide();
        }
    },

    async loadUsers() {
        try {
            const data = await API.getAllUsers();
            this.users = data.users || [];
            this.renderUserList();
        } catch (error) {
            Toast.error(error.message);
        }
    },

    renderUserList() {
        const tbody = document.getElementById('userListBody');
        if (!tbody) return;

        if (this.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">暂无用户</td></tr>';
            return;
        }

        tbody.innerHTML = this.users.map(user => `
            <tr>
                <td>${Utils.escapeHtml(user.username)}</td>
                <td>${Utils.escapeHtml(user.display_name)}</td>
                <td>${user.is_admin ? '<span class="badge bg-primary">管理员</span>' : '<span class="badge bg-secondary">普通用户</span>'}</td>
                <td><small class="text-muted">${new Date(user.created_at).toLocaleString('zh-CN')}</small></td>
                <td>
                    <button class="btn btn-sm btn-outline-warning me-1" onclick="UserManagement.showEditForm(${user.id})" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="UserManagement.deleteUser(${user.id})" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    showAddForm() {
        this.editingUserId = null;
        document.getElementById('userFormTitle').textContent = '添加用户';
        document.getElementById('userFormUsername').value = '';
        document.getElementById('userFormUsername').disabled = false;
        document.getElementById('userFormDisplayName').value = '';
        document.getElementById('userFormPassword').value = '';
        document.getElementById('userFormPassword').required = true;
        document.getElementById('userFormPasswordHint').textContent = '密码长度至少6位';
        document.getElementById('userFormIsAdmin').checked = false;
        document.getElementById('userFormError').classList.add('d-none');
        document.getElementById('userListSection').classList.add('d-none');
        document.getElementById('userFormSection').classList.remove('d-none');
    },

    showEditForm(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;

        this.editingUserId = userId;
        document.getElementById('userFormTitle').textContent = '编辑用户';
        document.getElementById('userFormUsername').value = user.username;
        document.getElementById('userFormUsername').disabled = true;
        document.getElementById('userFormDisplayName').value = user.display_name;
        document.getElementById('userFormPassword').value = '';
        document.getElementById('userFormPassword').required = false;
        document.getElementById('userFormPasswordHint').textContent = '留空表示不修改密码';
        document.getElementById('userFormIsAdmin').checked = user.is_admin;
        document.getElementById('userFormError').classList.add('d-none');
        document.getElementById('userListSection').classList.add('d-none');
        document.getElementById('userFormSection').classList.remove('d-none');
    },

    cancelForm() {
        document.getElementById('userFormSection').classList.add('d-none');
        document.getElementById('userListSection').classList.remove('d-none');
    },

    async submitForm() {
        const username = document.getElementById('userFormUsername').value.trim();
        const displayName = document.getElementById('userFormDisplayName').value.trim();
        const password = document.getElementById('userFormPassword').value;
        const isAdmin = document.getElementById('userFormIsAdmin').checked;
        const errorEl = document.getElementById('userFormError');

        if (!displayName) {
            errorEl.textContent = '显示名称不能为空';
            errorEl.classList.remove('d-none');
            return;
        }

        try {
            let result;
            if (this.editingUserId) {
                // 编辑用户
                const updateData = { display_name: displayName, is_admin: isAdmin };
                if (password) updateData.password = password;
                result = await API.updateUser(this.editingUserId, updateData);
            } else {
                // 添加用户
                if (!username) {
                    errorEl.textContent = '用户名不能为空';
                    errorEl.classList.remove('d-none');
                    return;
                }
                if (!password || password.length < 6) {
                    errorEl.textContent = '密码长度至少6位';
                    errorEl.classList.remove('d-none');
                    return;
                }
                result = await API.createUser({ username, password, display_name: displayName, is_admin: isAdmin });
            }

            if (result.success) {
                Toast.success(result.message);
                this.cancelForm();
                await this.loadUsers();
            } else {
                errorEl.textContent = result.message;
                errorEl.classList.remove('d-none');
            }
        } catch (error) {
            errorEl.textContent = '操作失败: ' + error.message;
            errorEl.classList.remove('d-none');
        }
    },

    async deleteUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;

        if (!confirm(`确定要删除用户 "${user.display_name}" 吗？`)) return;

        try {
            const result = await API.deleteUser(userId);
            if (result.success) {
                Toast.success(result.message);
                await this.loadUsers();
            } else {
                Toast.error(result.message);
            }
        } catch (error) {
            Toast.error('删除失败: ' + error.message);
        }
    }
};

// ============================================
// Main Application
// ============================================
const App = {
    async init() {
        // Initialize modals
        Auth.init();
        UserManagement.init();
        Upload.init();
        Modals.init();
        VoucherGallery.init();

        // Check authentication first
        const isLoggedIn = await Auth.checkAuth();
        if (!isLoggedIn) {
            Auth.showLoginModal();
        }

        // Bind event listeners
        this.bindEvents();

        // Load initial data if logged in
        if (isLoggedIn) {
            // 加载筛选下拉框数据
            await PersonFilter.loadPersons();
            await PersonFilter.loadUploaders();
            await this.loadInvoices();
        }

        console.log('Invoice Web App initialized');
    },

    bindEvents() {
        // Upload buttons - show upload modal
        DOM.uploadBtn.addEventListener('click', () => Upload.showUploadModal());
        DOM.uploadBtnEmpty.addEventListener('click', () => Upload.showUploadModal());

        // File input change (for legacy/fallback)
        DOM.fileInput.addEventListener('change', (e) => {
            Upload.handleFiles(e.target.files);
            e.target.value = ''; // Reset for same file selection
        });

        // Add person group button
        const addPersonGroupBtn = document.getElementById('addPersonGroupBtn');
        if (addPersonGroupBtn) {
            addPersonGroupBtn.addEventListener('click', () => Upload.addPersonGroup());
        }

        // Upload invoice form submit
        if (DOM.uploadInvoiceForm) {
            DOM.uploadInvoiceForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await Upload.handleUploadWithVouchers();
            });
        }

        // Export button
        DOM.exportBtn.addEventListener('click', () => Export.download());

        // Batch export DOCX button
        const batchExportBtn = document.getElementById('batchExportDocxBtn');
        if (batchExportBtn) {
            batchExportBtn.addEventListener('click', () => Export.downloadDocxBatch());
        }

        // Select all checkbox
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb) {
            selectAllCb.addEventListener('change', (e) => {
                InvoiceTable.toggleSelectAll(e.target.checked);
            });
        }

        // Individual invoice checkbox (event delegation)
        DOM.invoiceTableBody.addEventListener('change', (e) => {
            if (e.target.classList.contains('invoice-checkbox')) {
                const invoiceNumber = e.target.dataset.invoiceNumber;
                InvoiceTable.toggleInvoiceSelection(invoiceNumber, e.target.checked);
            }
        });

        // Search input with debounce
        const debouncedSearch = Utils.debounce((query) => Search.execute(query), 300);
        DOM.searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

        // Clear search button
        DOM.clearSearchBtn.addEventListener('click', () => Search.clear());

        // Sort column headers
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.sort;
                InvoiceTable.handleSort(column);
            });
        });

        // Table row actions (event delegation)
        DOM.invoiceTableBody.addEventListener('click', async (e) => {
            const row = e.target.closest('tr');
            if (!row) return;

            const invoiceNumber = row.dataset.invoiceNumber;
            const invoice = AppState.invoices.find(inv => inv.invoice_number === invoiceNumber);

            if (!invoice) return;

            // View button clicked
            if (e.target.closest('.view-btn')) {
                Modals.showDetail(invoice);
                return;
            }

            // Edit button clicked
            if (e.target.closest('.edit-btn')) {
                Modals.showEdit(invoice);
                return;
            }

            // Delete button clicked
            if (e.target.closest('.delete-btn')) {
                Modals.showDeleteConfirm(invoice);
                return;
            }

            // Export DOCX button clicked
            if (e.target.closest('.export-docx-btn')) {
                Export.downloadDocx(invoice.invoice_number);
                return;
            }

            // Signature button clicked (admin only)
            if (e.target.closest('.signature-btn')) {
                SignatureManager.showModal(invoice.invoice_number);
                return;
            }

            // Reimbursement status badge clicked (admin only)
            if (e.target.closest('.reimbursement-status-badge')) {
                const badge = e.target.closest('.reimbursement-status-badge');
                const currentStatus = badge.dataset.currentStatus;

                // 显示状态选择弹窗
                ReimbursementStatusManager.showStatusModal(invoiceNumber, currentStatus);
                return;
            }

            // Row clicked (not on buttons) - show detail
            if (!e.target.closest('button') && !e.target.closest('.reimbursement-status-badge')) {
                Modals.showDetail(invoice);
            }
        });

        // Confirm delete button
        DOM.confirmDeleteBtn.addEventListener('click', () => Modals.confirmDelete());

        // Download PDF button
        DOM.downloadPdfBtn.addEventListener('click', () => Modals.downloadPdf());

        // Preview PDF button
        DOM.previewPdfBtn.addEventListener('click', () => Modals.previewPdf());

        // Edit form submit
        DOM.editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await Modals.confirmEdit();
        });

        // Login form
        DOM.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = DOM.loginUsername.value.trim();
            const password = DOM.loginPassword.value;
            await Auth.login(username, password);
        });

        // Logout button
        DOM.logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            Auth.logout();
        });

        // User management button (admin only)
        const userManagementBtn = document.getElementById('userManagementBtn');
        if (userManagementBtn) {
            userManagementBtn.addEventListener('click', (e) => {
                e.preventDefault();
                UserManagement.showModal();
            });
        }

        // Date filter
        if (DOM.applyDateFilterBtn) {
            DOM.applyDateFilterBtn.addEventListener('click', () => DateFilter.apply());
        }
        if (DOM.clearDateFilterBtn) {
            DOM.clearDateFilterBtn.addEventListener('click', () => DateFilter.clear());
        }

        // Person/Uploader filter
        const personFilterSelect = document.getElementById('personFilterSelect');
        if (personFilterSelect) {
            personFilterSelect.addEventListener('change', () => PersonFilter.applyPersonFilter());
        }
        const uploaderFilterSelect = document.getElementById('uploaderFilterSelect');
        if (uploaderFilterSelect) {
            uploaderFilterSelect.addEventListener('change', () => PersonFilter.applyUploaderFilter());
        }
        const clearPersonFilterBtn = document.getElementById('clearPersonFilterBtn');
        if (clearPersonFilterBtn) {
            clearPersonFilterBtn.addEventListener('click', () => PersonFilter.clearFilters());
        }

        // Record Type filter (Requirements: 13.4, 13.5)
        const recordTypeRadios = document.querySelectorAll('input[name="adminRecordTypeFilter"]');
        recordTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => RecordTypeFilter.applyFilter());
        });

        // Add voucher button in detail modal
        if (DOM.addVoucherBtn) {
            DOM.addVoucherBtn.addEventListener('click', () => VoucherGallery.showAddVoucherModal());
        }

        // Export DOCX button
        if (DOM.exportDocxBtn) {
            DOM.exportDocxBtn.addEventListener('click', () => {
                if (AppState.currentInvoice) {
                    Export.downloadDocx(AppState.currentInvoice.invoice_number);
                }
            });
        }

        // New voucher input preview
        if (DOM.newVoucherInput) {
            DOM.newVoucherInput.addEventListener('change', () => VoucherGallery.updateNewVoucherPreview());
        }

        // Add voucher form submit
        if (DOM.addVoucherForm) {
            DOM.addVoucherForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await VoucherGallery.uploadNewVouchers();
            });
        }

        // Reimbursement person - show new person input
        if (DOM.addNewPersonBtn) {
            DOM.addNewPersonBtn.addEventListener('click', () => ReimbursementPerson.showNewPersonInput());
        }

        // Reimbursement person - confirm new person
        if (DOM.confirmNewPersonBtn) {
            DOM.confirmNewPersonBtn.addEventListener('click', async () => {
                await ReimbursementPerson.createNewPerson();
            });
        }

        // Reimbursement person - cancel new person
        if (DOM.cancelNewPersonBtn) {
            DOM.cancelNewPersonBtn.addEventListener('click', () => ReimbursementPerson.hideNewPersonInput());
        }

        // Reimbursement person - enter key in new person input
        if (DOM.newPersonNameInput) {
            DOM.newPersonNameInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    await ReimbursementPerson.createNewPerson();
                }
            });
        }

        // Status tabs
        const statusTabs = document.getElementById('statusTabs');
        if (statusTabs) {
            statusTabs.addEventListener('click', async (e) => {
                const tab = e.target.closest('.nav-link');
                if (!tab) return;

                // Update active state
                statusTabs.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update filter and reload
                AppState.reimbursementStatusFilter = tab.dataset.status || '';

                await this.loadInvoices();
            });
        }
    },

    updateStatusCounts(invoices) {
        const allCount = invoices.length;
        const pendingCount = invoices.filter(inv => (inv.reimbursement_status || '未报销') === '未报销').length;
        const completedCount = invoices.filter(inv => inv.reimbursement_status === '已报销').length;

        const countAll = document.getElementById('countAll');
        const countPending = document.getElementById('countPending');
        const countCompleted = document.getElementById('countCompleted');

        if (countAll) countAll.textContent = allCount;
        if (countPending) countPending.textContent = pendingCount;
        if (countCompleted) countCompleted.textContent = completedCount;
    },

    async loadInvoices() {
        try {
            const { startDate, endDate } = AppState.dateFilter;

            // First get all invoices for counting (without status filter)
            const allData = await API.getInvoices(
                AppState.searchQuery,
                startDate,
                endDate,
                AppState.personFilter,
                AppState.uploaderFilter,
                '', // No status filter for counting
                AppState.recordTypeFilter
            );

            // Update status counts
            this.updateStatusCounts(allData.invoices);

            // Then get filtered invoices
            const data = await API.getInvoices(
                AppState.searchQuery,
                startDate,
                endDate,
                AppState.personFilter,
                AppState.uploaderFilter,
                AppState.reimbursementStatusFilter,
                AppState.recordTypeFilter
            );

            InvoiceTable.render(data.invoices);
            Statistics.update(
                data.total_count,
                data.total_amount,
                data.invoice_count,
                data.manual_count,
                data.invoice_amount,
                data.manual_amount
            );
        } catch (error) {
            if (error.message !== '需要登录') {
                Toast.error('加载发票列表失败: ' + error.message);
            }
            InvoiceTable.render([]);
            Statistics.update(0, 0, 0, 0, '0', '0');
        }
    }
};

// ============================================
// Signature Management (Admin Only)
// ============================================
const SignatureManager = {
    modalInstance: null,
    currentInvoiceNumber: null,
    currentSignature: null,
    signatureFile: null,
    templates: [],
    selectedTemplateId: null,

    init() {
        const modal = document.getElementById('signatureModal');
        if (modal) {
            this.modalInstance = new bootstrap.Modal(modal);
        }

        // Bind events
        const fileInput = document.getElementById('signatureFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        const saveBtn = document.getElementById('saveSignatureBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSignature());
        }

        const exportBtn = document.getElementById('exportSignedPdfBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportSignedPdf());
        }

        const deleteBtn = document.getElementById('deleteSignatureBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteSignature());
        }

        // Template events
        const templateSelect = document.getElementById('signatureTemplateSelect');
        if (templateSelect) {
            templateSelect.addEventListener('change', (e) => this.handleTemplateSelect(e));
        }

        const uploadTemplateBtn = document.getElementById('uploadTemplateBtn');
        if (uploadTemplateBtn) {
            uploadTemplateBtn.addEventListener('click', () => this.uploadTemplate());
        }

        const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
        if (deleteTemplateBtn) {
            deleteTemplateBtn.addEventListener('click', () => this.deleteTemplate());
        }

        // Position input change events for live preview update
        ['signatureX', 'signatureY', 'signatureWidth', 'signatureHeight'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', () => this.updatePreviewPosition());
            }
        });

        // Initialize drag functionality
        this.initDrag();
    },

    // PDF coordinate system: use actual PDF coordinates directly
    // The preview container shows the PDF at a certain scale, we need to convert
    // between screen pixels and PDF points
    pdfScale: 1,
    pdfWidth: 595,  // Will be updated with actual PDF dimensions
    pdfHeight: 842, // Will be updated with actual PDF dimensions

    // PDF viewer toolbar height estimation (browser's built-in PDF viewer)
    pdfViewerToolbarHeight: 40,
    // PDF viewer horizontal padding
    pdfViewerPadding: 10,

    initDrag() {
        const overlay = document.getElementById('signatureOverlay');
        const container = document.getElementById('signaturePdfContainer');
        if (!overlay || !container) return;

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        overlay.addEventListener('mousedown', (e) => {
            if (e.target.closest('.badge')) return; // Don't drag when clicking badge
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = overlay.offsetLeft;
            startTop = overlay.offsetTop;
            overlay.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const containerWidth = container.clientWidth || 600;
            const containerHeight = container.clientHeight || 500;

            const newLeft = Math.max(0, Math.min(containerWidth - overlay.offsetWidth, startLeft + dx));
            const newTop = Math.max(0, Math.min(containerHeight - overlay.offsetHeight, startTop + dy));

            overlay.style.left = newLeft + 'px';
            overlay.style.top = newTop + 'px';

            // Calculate PDF coordinates considering the PDF viewer's toolbar and padding
            // The actual PDF display area is smaller than the container
            const effectiveWidth = containerWidth - (this.pdfViewerPadding * 2);
            const effectiveHeight = containerHeight - this.pdfViewerToolbarHeight;

            // Adjust position relative to the PDF display area
            const adjustedLeft = Math.max(0, newLeft - this.pdfViewerPadding);
            const adjustedTop = Math.max(0, newTop - this.pdfViewerToolbarHeight);

            // Scale to PDF coordinates
            const scaleX = this.pdfWidth / effectiveWidth;
            const scaleY = this.pdfHeight / effectiveHeight;

            const pdfX = Math.max(0, Math.min(this.pdfWidth, adjustedLeft * scaleX));
            const pdfY = Math.max(0, Math.min(this.pdfHeight, adjustedTop * scaleY));

            document.getElementById('signatureX').value = Math.round(pdfX);
            document.getElementById('signatureY').value = Math.round(pdfY);
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                overlay.style.cursor = 'move';
            }
        });
    },

    updatePreviewPosition() {
        const overlay = document.getElementById('signatureOverlay');
        if (!overlay || overlay.classList.contains('d-none')) return;

        const x = parseFloat(document.getElementById('signatureX').value) || 100;
        const y = parseFloat(document.getElementById('signatureY').value) || 100;
        const width = parseFloat(document.getElementById('signatureWidth').value) || 100;
        const height = parseFloat(document.getElementById('signatureHeight').value) || 100;

        // Convert PDF coordinates to screen pixels
        const container = document.getElementById('signaturePdfContainer');
        const containerWidth = container ? container.clientWidth : 600;
        const containerHeight = container ? container.clientHeight : 500;

        // Calculate effective display area (accounting for PDF viewer toolbar and padding)
        const effectiveWidth = containerWidth - (this.pdfViewerPadding * 2);
        const effectiveHeight = containerHeight - this.pdfViewerToolbarHeight;

        // Scale from PDF coordinates to screen pixels
        const scaleX = effectiveWidth / this.pdfWidth;
        const scaleY = effectiveHeight / this.pdfHeight;

        // Position with offset for toolbar and padding
        overlay.style.left = (x * scaleX + this.pdfViewerPadding) + 'px';
        overlay.style.top = (y * scaleY + this.pdfViewerToolbarHeight) + 'px';
        overlay.style.width = (width * scaleX) + 'px';
        overlay.style.height = (height * scaleY) + 'px';
    },

    async showModal(invoiceNumber) {
        if (!AppState.currentUser?.is_admin) {
            Toast.error('需要管理员权限');
            return;
        }

        this.currentInvoiceNumber = invoiceNumber;
        this.signatureFile = null;
        this.selectedTemplateId = null;

        // Reset file input
        const fileInput = document.getElementById('signatureFileInput');
        if (fileInput) fileInput.value = '';

        // Reset template select
        const templateSelect = document.getElementById('signatureTemplateSelect');
        if (templateSelect) templateSelect.value = '';

        // Load PDF preview
        const pdfFrame = document.getElementById('signaturePdfFrame');
        if (pdfFrame) {
            pdfFrame.src = API.getPdfUrl(invoiceNumber, true);
        }

        // Get actual PDF dimensions
        try {
            const dimData = await API.getPdfDimensions(invoiceNumber);
            if (dimData.success) {
                this.pdfWidth = dimData.width;
                this.pdfHeight = dimData.height;
                console.log(`PDF dimensions: ${this.pdfWidth} x ${this.pdfHeight}`);

                // Update dimensions display
                const dimInfo = document.getElementById('pdfDimensionsInfo');
                if (dimInfo) {
                    dimInfo.textContent = `${Math.round(this.pdfWidth)} x ${Math.round(this.pdfHeight)} 点`;
                }
            }
        } catch (error) {
            console.error('Failed to get PDF dimensions:', error);
            // Keep default values
        }

        // Load templates and existing signature
        await this.loadTemplates();
        await this.loadSignature();

        if (this.modalInstance) {
            this.modalInstance.show();
        }
    },

    async loadTemplates() {
        try {
            const data = await API.getSignatureTemplates();
            this.templates = data.templates || [];
            this.renderTemplateSelect();
        } catch (error) {
            console.error('Failed to load templates:', error);
            this.templates = [];
        }
    },

    renderTemplateSelect() {
        const select = document.getElementById('signatureTemplateSelect');
        if (!select) return;

        select.innerHTML = '<option value="">-- 选择签章模板 --</option>';
        this.templates.forEach(t => {
            const option = document.createElement('option');
            option.value = t.id;
            option.textContent = t.name;
            select.appendChild(option);
        });
    },

    handleTemplateSelect(e) {
        this.selectedTemplateId = e.target.value ? parseInt(e.target.value) : null;

        // Clear file input when template is selected
        if (this.selectedTemplateId) {
            this.signatureFile = null;
            const fileInput = document.getElementById('signatureFileInput');
            if (fileInput) fileInput.value = '';

            // Show template preview
            this.showSignaturePreview(API.getSignatureTemplateImageUrl(this.selectedTemplateId));
        } else {
            this.hideSignaturePreview();
        }
    },

    showSignaturePreview(imageUrl) {
        const overlay = document.getElementById('signatureOverlay');
        const previewImg = document.getElementById('signaturePreviewImg');
        if (!overlay || !previewImg) return;

        previewImg.src = imageUrl;
        previewImg.onload = () => {
            overlay.classList.remove('d-none');
            this.updatePreviewPosition();
        };
        previewImg.onerror = () => {
            console.error('Failed to load signature image');
            overlay.classList.add('d-none');
        };
    },

    hideSignaturePreview() {
        const overlay = document.getElementById('signatureOverlay');
        if (overlay) {
            overlay.classList.add('d-none');
        }
    },

    async uploadTemplate() {
        const fileInput = document.getElementById('signatureFileInput');
        if (!fileInput || !fileInput.files.length) {
            Toast.warning('请先选择签章图片');
            return;
        }

        const file = fileInput.files[0];
        const name = prompt('请输入签章名称:', file.name.split('.')[0]);
        if (!name) return;

        try {
            const result = await API.uploadSignatureTemplate(file, name);
            if (result.success) {
                Toast.success('签章模板上传成功');
                await this.loadTemplates();

                // Clear file input and preview
                fileInput.value = '';
                this.signatureFile = null;
                this.hideSignaturePreview();

                // Select the new template
                const templateSelect = document.getElementById('signatureTemplateSelect');
                if (templateSelect && result.template) {
                    templateSelect.value = result.template.id;
                    this.selectedTemplateId = result.template.id;
                    // Show the new template preview
                    this.showSignaturePreview(API.getSignatureTemplateImageUrl(result.template.id));
                }
            } else {
                Toast.error(result.message || '上传失败');
            }
        } catch (error) {
            Toast.error('上传签章模板失败: ' + error.message);
        }
    },

    async deleteTemplate() {
        if (!this.selectedTemplateId) {
            Toast.warning('请先选择要删除的签章模板');
            return;
        }

        if (!confirm('确定要删除此签章模板吗？')) return;

        try {
            const result = await API.deleteSignatureTemplate(this.selectedTemplateId);
            if (result.success) {
                Toast.success('签章模板已删除');
                this.selectedTemplateId = null;
                await this.loadTemplates();
            } else {
                Toast.error(result.message || '删除失败');
            }
        } catch (error) {
            Toast.error('删除签章模板失败: ' + error.message);
        }
    },

    async loadSignature() {
        try {
            const data = await API.getSignature(this.currentInvoiceNumber);
            this.currentSignature = data.has_signature ? data.signature : null;

            const infoEl = document.getElementById('currentSignatureInfo');
            const filenameEl = document.getElementById('currentSignatureFilename');

            if (this.currentSignature) {
                if (infoEl) infoEl.classList.remove('d-none');
                if (filenameEl) filenameEl.textContent = this.currentSignature.original_filename;

                // Set position values
                document.getElementById('signatureX').value = this.currentSignature.position_x || 400;
                document.getElementById('signatureY').value = this.currentSignature.position_y || 200;
                document.getElementById('signatureWidth').value = this.currentSignature.width || 100;
                document.getElementById('signatureHeight').value = this.currentSignature.height || 100;
                document.getElementById('signaturePage').value = this.currentSignature.page_number || 0;

                // Show existing signature preview
                this.showSignaturePreview(API.getSignatureImageUrl(this.currentInvoiceNumber));
            } else {
                if (infoEl) infoEl.classList.add('d-none');
                // Reset to defaults - use reasonable position based on actual PDF dimensions
                // Place signature at bottom-right area of the PDF
                const defaultX = Math.max(50, this.pdfWidth - 100);
                const defaultY = Math.max(50, this.pdfHeight - 100);
                document.getElementById('signatureX').value = Math.round(defaultX);
                document.getElementById('signatureY').value = Math.round(defaultY);
                document.getElementById('signatureWidth').value = 50;
                document.getElementById('signatureHeight').value = 50;
                document.getElementById('signaturePage').value = 0;

                // Hide preview
                this.hideSignaturePreview();
            }
        } catch (error) {
            console.error('Failed to load signature:', error);
            this.currentSignature = null;
            this.hideSignaturePreview();
        }
    },

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        if (!['png', 'jpg', 'jpeg'].includes(ext)) {
            Toast.error('仅支持PNG、JPG格式图片');
            e.target.value = '';
            return;
        }

        this.signatureFile = file;
        this.selectedTemplateId = null;
        const templateSelect = document.getElementById('signatureTemplateSelect');
        if (templateSelect) templateSelect.value = '';

        // Set default size to 50x50 for new uploads
        if (!this.currentSignature) {
            document.getElementById('signatureWidth').value = 50;
            document.getElementById('signatureHeight').value = 50;
        }

        // Show file preview
        const reader = new FileReader();
        reader.onload = (event) => {
            this.showSignaturePreview(event.target.result);
        };
        reader.readAsDataURL(file);

        Toast.success(`已选择签章文件: ${file.name}`);
    },

    async saveSignature() {
        if (!this.currentInvoiceNumber) return;

        const positionX = parseFloat(document.getElementById('signatureX').value) || 400;
        const positionY = parseFloat(document.getElementById('signatureY').value) || 700;
        const width = parseFloat(document.getElementById('signatureWidth').value) || 100;
        const height = parseFloat(document.getElementById('signatureHeight').value) || 100;
        const pageNumber = parseInt(document.getElementById('signaturePage').value) || 0;

        try {
            let result;
            if (this.selectedTemplateId) {
                // Apply template
                result = await API.applySignatureTemplate(
                    this.currentInvoiceNumber,
                    this.selectedTemplateId,
                    positionX, positionY, width, height, pageNumber
                );
            } else if (this.signatureFile) {
                // Upload new signature
                result = await API.uploadSignature(
                    this.currentInvoiceNumber,
                    this.signatureFile,
                    positionX, positionY, width, height, pageNumber
                );
            } else if (this.currentSignature) {
                // Update position only
                result = await API.updateSignaturePosition(
                    this.currentInvoiceNumber,
                    positionX, positionY, width, height, pageNumber
                );
            } else {
                Toast.warning('请先选择签章模板或上传签章图片');
                return;
            }

            if (result.success) {
                Toast.success(result.message || '签章保存成功');
                await this.loadSignature();
                this.signatureFile = null;
                this.selectedTemplateId = null;
                const fileInput = document.getElementById('signatureFileInput');
                if (fileInput) fileInput.value = '';
                const templateSelect = document.getElementById('signatureTemplateSelect');
                if (templateSelect) templateSelect.value = '';
            } else {
                Toast.error(result.message || '保存失败');
            }
        } catch (error) {
            Toast.error('保存签章失败: ' + error.message);
        }
    },

    exportSignedPdf() {
        if (!this.currentInvoiceNumber || !this.currentSignature) {
            Toast.warning('请先保存签章');
            return;
        }

        window.open(API.getSignedPdfUrl(this.currentInvoiceNumber), '_blank');
    },

    async deleteSignature() {
        if (!this.currentInvoiceNumber || !this.currentSignature) {
            Toast.warning('没有可删除的签章');
            return;
        }

        if (!confirm('确定要删除此签章吗？')) return;

        try {
            const result = await API.deleteSignature(this.currentInvoiceNumber);
            if (result.success) {
                Toast.success('签章已删除');
                this.currentSignature = null;
                await this.loadSignature();
            } else {
                Toast.error(result.message || '删除失败');
            }
        } catch (error) {
            Toast.error('删除签章失败: ' + error.message);
        }
    }
};

// ============================================
// Reimbursement Status Manager
// ============================================
const ReimbursementStatusManager = {
    currentInvoiceNumber: null,
    modalInstance: null,

    init() {
        // Create modal if not exists
        if (!document.getElementById('reimbursementStatusModal')) {
            this.createModal();
        }
        const modal = document.getElementById('reimbursementStatusModal');
        if (modal) {
            this.modalInstance = new bootstrap.Modal(modal);
        }
    },

    createModal() {
        const modalHtml = `
            <div class="modal fade" id="reimbursementStatusModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-sm modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white py-2">
                            <h6 class="modal-title"><i class="bi bi-check2-square me-2"></i>更新报销状态</h6>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="d-grid gap-2">
                                <button type="button" class="btn btn-outline-warning status-option" data-status="未报销">
                                    <i class="bi bi-clock me-2"></i>未报销
                                </button>
                                <button type="button" class="btn btn-outline-success status-option" data-status="已报销">
                                    <i class="bi bi-check-circle me-2"></i>已报销
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Bind click events
        document.querySelectorAll('#reimbursementStatusModal .status-option').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newStatus = btn.dataset.status;
                await this.updateStatus(newStatus);
            });
        });
    },

    showStatusModal(invoiceNumber, currentStatus) {
        this.currentInvoiceNumber = invoiceNumber;

        if (!this.modalInstance) {
            this.init();
        }

        // Highlight current status
        document.querySelectorAll('#reimbursementStatusModal .status-option').forEach(btn => {
            const status = btn.dataset.status;
            if (status === currentStatus) {
                btn.classList.remove('btn-outline-warning', 'btn-outline-success');
                btn.classList.add(status === '已报销' ? 'btn-success' : 'btn-warning');
            } else {
                btn.classList.remove('btn-warning', 'btn-success');
                btn.classList.add(status === '已报销' ? 'btn-outline-success' : 'btn-outline-warning');
            }
        });

        this.modalInstance.show();
    },

    async updateStatus(newStatus) {
        if (!this.currentInvoiceNumber) return;

        try {
            const result = await API.updateReimbursementStatus(this.currentInvoiceNumber, newStatus);
            if (result.success) {
                Toast.success(`报销状态已更新为"${newStatus}"`);

                // 先关闭modal
                if (this.modalInstance) {
                    this.modalInstance.hide();
                }

                // 立即更新表格中对应行的状态显示（不等待API刷新）
                const badge = document.querySelector(
                    `.reimbursement-status-badge[data-invoice-number="${this.currentInvoiceNumber}"]`
                );
                if (badge) {
                    badge.textContent = newStatus;
                    badge.dataset.currentStatus = newStatus;
                    badge.classList.remove('bg-success', 'bg-warning', 'text-dark');
                    if (newStatus === '已报销') {
                        badge.classList.add('bg-success');
                    } else {
                        badge.classList.add('bg-warning', 'text-dark');
                    }
                }

                // 更新本地数据
                const invoiceIndex = AppState.invoices.findIndex(
                    inv => inv.invoice_number === this.currentInvoiceNumber
                );
                if (invoiceIndex !== -1) {
                    AppState.invoices[invoiceIndex].reimbursement_status = newStatus;
                }

                // 更新状态计数
                App.updateStatusCounts(AppState.invoices);
            } else {
                Toast.error(result.message || '更新失败');
            }
        } catch (error) {
            console.error('更新报销状态失败:', error);
            Toast.error('更新报销状态失败: ' + error.message);
        }
    }
};

// ============================================
// Initialize on DOM Ready
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
    SignatureManager.init();
    ReimbursementStatusManager.init();
});
