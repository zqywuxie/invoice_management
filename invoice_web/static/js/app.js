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
    , focusInvoice: ''
    , urlStateInitialized: false
};

AppState.pagination = {
    page: 1,
    pageSize: 20,
    totalPages: 1,
    totalCount: 0
};

AppState.requestState = {
    seq: 0,
    active: 0
};

AppState.navigationState = {
    focusInvoiceHandled: false
};

// ============================================
// API Service
// ============================================
const API = {
    baseUrl: '/api',

    async parseJsonResponse(response, fallbackMessage = '接口返回了非 JSON 响应') {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return response.json();
        }
        const text = await response.text();
        const snippet = text ? text.slice(0, 200) : '';
        throw new Error(`${fallbackMessage}${snippet ? `: ${snippet}` : ''}`);
    },

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

    async getInvoices(search = '', startDate = '', endDate = '', reimbursementPersonId = '', uploadedBy = '', reimbursementStatus = '', recordType = '', page = 1, pageSize = 20) {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (reimbursementPersonId) params.append('reimbursement_person_id', reimbursementPersonId);
        if (uploadedBy) params.append('uploaded_by', uploadedBy);
        if (reimbursementStatus) params.append('reimbursement_status', reimbursementStatus);
        if (recordType) params.append('record_type', recordType);
        params.append('page', String(page));
        params.append('page_size', String(pageSize));
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

    async getInvoiceContracts(invoiceNumber, limit = 20) {
        const response = await fetch(`${this.baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}/contracts?limit=${limit}`);
        const data = await this.parseJsonResponse(response, '获取关联合同失败');
        if (!response.ok) {
            throw new Error(data.message || '获取关联合同失败');
        }
        return data;
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

    async getUserPreference(prefKey) {
        const response = await fetch(`${this.baseUrl}/user/preferences/${encodeURIComponent(prefKey)}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to get user preference');
        }
        return data;
    },

    async setUserPreference(prefKey, value) {
        const response = await fetch(`${this.baseUrl}/user/preferences/${encodeURIComponent(prefKey)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to save user preference');
        }
        return data;
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
        if (!response.ok) throw new Error('获取 PDF 尺寸失败');
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
    },

    async getContracts(search = '', limit = 200) {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        params.append('limit', String(limit));
        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`${this.baseUrl}/contracts${query}`);
        const data = await this.parseJsonResponse(response, '获取合同列表失败');
        if (!response.ok) {
            throw new Error(data.message || '获取合同列表失败');
        }
        return data;
    },

    async createContract(invoiceNumbers, file, contractTags = '', contractTitle = '') {
        const formData = new FormData();
        formData.append('invoice_numbers', invoiceNumbers);
        formData.append('contract_tags', contractTags);
        formData.append('contract_title', contractTitle);
        formData.append('file', file);
        const response = await fetch(`${this.baseUrl}/contracts`, {
            method: 'POST',
            body: formData
        });
        return this.parseJsonResponse(response, '上传合同失败');
    },

    async deleteContract(contractId) {
        const response = await fetch(`${this.baseUrl}/contracts/${contractId}`, {
            method: 'DELETE'
        });
        return this.parseJsonResponse(response, '删除合同失败');
    },

    async getContractDetail(contractId) {
        const response = await fetch(`${this.baseUrl}/contracts/${contractId}`);
        return this.parseJsonResponse(response, '获取合同详情失败');
    },

    async updateContract(contractId, payload) {
        const response = await fetch(`${this.baseUrl}/contracts/${contractId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return this.parseJsonResponse(response, '更新合同失败');
    },

    getContractDownloadUrl(contractId, preview = false) {
        const url = `${this.baseUrl}/contracts/${contractId}/download`;
        return preview ? `${url}?preview=true` : url;
    },

    async getContractLinks(contractId) {
        const response = await fetch(`${this.baseUrl}/contracts/${contractId}/links`);
        const data = await this.parseJsonResponse(response, '获取配对信息失败');
        if (!response.ok) {
            throw new Error(data.message || '获取配对信息失败');
        }
        return data;
    },

    async updateContractLinks(contractId, invoiceNumbers) {
        const response = await fetch(`${this.baseUrl}/contracts/${contractId}/links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice_numbers: invoiceNumbers })
        });
        return this.parseJsonResponse(response, '配对失败');
    }
};

API.validateContractInvoices = async function(invoiceNumbers) {
    const response = await fetch(`${this.baseUrl}/contracts/validate-invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_numbers: invoiceNumbers })
    });
    const data = await this.parseJsonResponse(response, '校验发票编号失败');
    if (!response.ok) {
        throw new Error(data.message || '校验发票编号失败');
    }
    return data;
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
    activeFilterBar: document.getElementById('activeFilterBar'),
    activeFilterText: document.getElementById('activeFilterText'),
    clearAllFiltersBtn: document.getElementById('clearAllFiltersBtn'),
    paginationInfo: document.getElementById('paginationInfo'),
    paginationPageSize: document.getElementById('paginationPageSize'),
    paginationPrevBtn: document.getElementById('paginationPrevBtn'),
    paginationNextBtn: document.getElementById('paginationNextBtn'),
    selectionBar: document.getElementById('selectionBar'),
    selectionSummary: document.getElementById('selectionSummary'),
    clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    quickBatchExportBtn: document.getElementById('quickBatchExportBtn'),
    tableLoadingMask: document.getElementById('tableLoadingMask'),
    columnSettingsBtn: document.getElementById('columnSettingsBtn'),
    columnVisibilityMenu: document.getElementById('columnVisibilityMenu'),
    showAllColumnsBtn: document.getElementById('showAllColumnsBtn'),
    resetColumnsBtn: document.getElementById('resetColumnsBtn'),
    exportColumnLayoutBtn: document.getElementById('exportColumnLayoutBtn'),
    importColumnLayoutBtn: document.getElementById('importColumnLayoutBtn'),
    importColumnLayoutInput: document.getElementById('importColumnLayoutInput'),

    // Search
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),

    // Buttons
    uploadBtn: document.getElementById('uploadBtn'),
    contractManageBtn: document.getElementById('contractManageBtn'),
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
    detailRelatedContracts: document.getElementById('detailRelatedContracts'),
    detailRelatedContractsCount: document.getElementById('detailRelatedContractsCount'),
    openInvoiceContractsPanelBtn: document.getElementById('openInvoiceContractsPanelBtn'),
    openInvoiceContractsBtn: document.getElementById('openInvoiceContractsBtn'),
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
    addVoucherError: document.getElementById('addVoucherError'),

    // Contract Management Modal
    contractManagementModal: document.getElementById('contractManagementModal'),
    contractTotalCount: document.getElementById('contractTotalCount'),
    contractPairedCount: document.getElementById('contractPairedCount'),
    contractUnpairedCount: document.getElementById('contractUnpairedCount'),
    contractMissingCount: document.getElementById('contractMissingCount'),
    contractSummaryHint: document.getElementById('contractSummaryHint'),
    contractTitleInput: document.getElementById('contractTitleInput'),
    contractInvoiceNumbersInput: document.getElementById('contractInvoiceNumbersInput'),
    contractFileInput: document.getElementById('contractFileInput'),
    uploadContractBtn: document.getElementById('uploadContractBtn'),
    openContractUploadBtn: document.getElementById('openContractUploadBtn'),
    contractSearchInput: document.getElementById('contractSearchInput'),
    refreshContractsBtn: document.getElementById('refreshContractsBtn'),
    clearContractFiltersBtn: document.getElementById('clearContractFiltersBtn'),
    contractResultSummary: document.getElementById('contractResultSummary'),
    contractTableBody: document.getElementById('contractTableBody'),
    contractDraftSummary: document.getElementById('contractDraftSummary'),
    contractDraftCountBadge: document.getElementById('contractDraftCountBadge'),
    contractDraftInvoiceList: document.getElementById('contractDraftInvoiceList'),
    contractPairModal: document.getElementById('contractPairModal'),
    contractPairMeta: document.getElementById('contractPairMeta'),
    contractPairCandidates: document.getElementById('contractPairCandidates'),
    contractPairCandidateChips: document.getElementById('contractPairCandidateChips'),
    contractPairUseCandidatesBtn: document.getElementById('contractPairUseCandidatesBtn'),
    contractPairClearBtn: document.getElementById('contractPairClearBtn'),
    contractPairInvoiceNumbersInput: document.getElementById('contractPairInvoiceNumbersInput'),
    contractPairSaveBtn: document.getElementById('contractPairSaveBtn'),
    contractPairValidationBadge: document.getElementById('contractPairValidationBadge'),
    contractPairValidationSummary: document.getElementById('contractPairValidationSummary'),
    contractPairValidationList: document.getElementById('contractPairValidationList'),
    contractTagsInput: document.getElementById('contractTagsInput'),
    contractTagEntryInput: document.getElementById('contractTagEntryInput'),
    contractTagList: document.getElementById('contractTagList'),
    contractTagInput: document.getElementById('contractTagInput'),
    contractDropZone: document.getElementById('contractDropZone'),
    contractFileInfo: document.getElementById('contractFileInfo'),
    contractFileName: document.getElementById('contractFileName'),
    contractFileMeta: document.getElementById('contractFileMeta'),
    contractFileClearBtn: document.getElementById('contractFileClearBtn'),
    resetContractFormBtn: document.getElementById('resetContractFormBtn'),
    contractDetailModal: document.getElementById('contractDetailModal'),
    contractDetailTitle: document.getElementById('contractDetailTitle'),
    contractDetailStatus: document.getElementById('contractDetailStatus'),
    contractDetailTags: document.getElementById('contractDetailTags'),
    contractDetailCandidates: document.getElementById('contractDetailCandidates'),
    contractDetailLinked: document.getElementById('contractDetailLinked'),
    contractDetailMissing: document.getElementById('contractDetailMissing'),
    contractDetailFilename: document.getElementById('contractDetailFilename'),
    contractDetailUploadTime: document.getElementById('contractDetailUploadTime'),
    contractDetailFileSize: document.getElementById('contractDetailFileSize'),
    contractDetailCandidateList: document.getElementById('contractDetailCandidateList'),
    contractDetailLinkedList: document.getElementById('contractDetailLinkedList'),
    contractDetailPreview: document.getElementById('contractDetailPreview'),
    contractDetailDownloadBtn: document.getElementById('contractDetailDownloadBtn'),
    contractDetailEditBtn: document.getElementById('contractDetailEditBtn'),
    contractDetailPairBtn: document.getElementById('contractDetailPairBtn'),
    contractEditModal: document.getElementById('contractEditModal'),
    contractEditTitleInput: document.getElementById('contractEditTitleInput'),
    contractEditTagsInput: document.getElementById('contractEditTagsInput'),
    contractEditInvoiceNumbersInput: document.getElementById('contractEditInvoiceNumbersInput'),
    contractEditSaveBtn: document.getElementById('contractEditSaveBtn'),
    contractEditError: document.getElementById('contractEditError'),
    contractTagFilterList: document.getElementById('contractTagFilterList'),
    contractPairFilter: document.getElementById('contractPairFilter'),
    contractSortSelect: document.getElementById('contractSortSelect'),
    contractMissingOnlyToggle: document.getElementById('contractMissingOnlyToggle')
};

const PageContext = {
    id: document.body?.dataset?.page || ''
};

const isInvoicePage = PageContext.id === 'admin-invoices';
const isContractPage = PageContext.id === 'admin-contracts';
const isUscoaPage = PageContext.id === 'admin-uscoa';


// ============================================
// Utility Functions
// ============================================
const Utils = {
    formatCurrency(amount) {
        const num = parseFloat(amount) || 0;
        return `楼${num.toFixed(2)}`;
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

    formatFileSize(bytes) {
        const size = Number(bytes || 0);
        if (size <= 0) return '0 B';
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
    },

    buildAdminUrl(pathname, params = {}) {
        const url = new URL(pathname, window.location.origin);
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                return;
            }
            url.searchParams.set(key, String(value));
        });
        return `${url.pathname}${url.search}`;
    },

    buildInvoiceWorkspaceUrl(invoiceNumber, extraParams = {}) {
        return this.buildAdminUrl('/admin', {
            search: invoiceNumber || '',
            focus_invoice: invoiceNumber || '',
            ...extraParams
        });
    },

    buildContractWorkspaceUrl(invoiceNumber, extraParams = {}) {
        return this.buildAdminUrl('/admin/contracts', {
            search: invoiceNumber || '',
            focus_invoice: invoiceNumber || '',
            ...extraParams
        });
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

        // 娓呴櫎涓嶅瓨鍦ㄧ殑鍙戠エ閫夋嫨
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
        ColumnSettings.applyToTable();

        // Update sort indicators
        this.updateSortIndicators();
        this.updateSelectionRowHighlight();
        this.updateSelectAllCheckbox();
        this.updateBatchExportButton();
    },

    createRow(invoice) {
        const voucherCount = invoice.voucher_count || 0;
        const voucherBadge = voucherCount > 0
            ? `<span class="badge bg-success voucher-badge">${voucherCount}</span>`
            : `<span class="badge bg-secondary voucher-badge">0</span>`;
        const isChecked = AppState.selectedInvoices.has(invoice.invoice_number);
        const isFocused = AppState.focusInvoice && invoice.invoice_number === AppState.focusInvoice;
        const rowClassName = [isChecked ? 'row-selected' : '', isFocused ? 'invoice-focus-row' : '']
            .filter(Boolean)
            .join(' ');

        const reimbursementStatus = invoice.reimbursement_status || '未报销';
        const isReimbursed = reimbursementStatus === '已报销';
        const statusBadgeClass = isReimbursed ? 'bg-success' : 'bg-warning text-dark';
        const isAdmin = AppState.currentUser?.is_admin;
        const recordType = invoice.record_type || 'invoice';
        const displayStatusCell = isAdmin
            ? `<span class="badge ${statusBadgeClass} reimbursement-status-badge"
                     style="cursor: pointer;"
                     data-invoice-number="${Utils.escapeHtml(invoice.invoice_number)}"
                     data-current-status="${Utils.escapeHtml(reimbursementStatus)}"
                     title="点击修改报销状态">${Utils.escapeHtml(reimbursementStatus)}</span>`
            : `<span class="badge ${statusBadgeClass}">${Utils.escapeHtml(reimbursementStatus)}</span>`;
        const displayRecordTypeBadge = recordType === 'manual'
            ? '<span class="badge badge-manual"><i class="bi bi-pencil-square me-1"></i>无票报销</span>'
            : '<span class="badge badge-invoice"><i class="bi bi-file-earmark-pdf me-1"></i>发票记录</span>';

        return `
            <tr data-invoice-number="${Utils.escapeHtml(invoice.invoice_number)}" class="${rowClassName}">
                <td class="text-center">
                    <input type="checkbox" class="form-check-input invoice-checkbox" 
                           data-invoice-number="${Utils.escapeHtml(invoice.invoice_number)}"
                           ${isChecked ? 'checked' : ''}>
                </td>
                <td class="col-invoice_number">${Utils.escapeHtml(invoice.invoice_number)}</td>
                <td class="col-invoice_date">${Utils.escapeHtml(invoice.invoice_date)}</td>
                <td class="col-item_name">${Utils.escapeHtml(invoice.item_name)}</td>
                <td class="text-end amount-cell col-amount">${Utils.formatCurrency(invoice.amount)}</td>
                <td class="col-reimbursement_person_name">${Utils.escapeHtml(invoice.reimbursement_person_name || '-')}</td>
                <td class="col-remark">${Utils.escapeHtml(invoice.remark || '-')}</td>
                <td class="col-uploaded_by">${Utils.escapeHtml(invoice.uploaded_by || '-')}</td>
                <td class="col-scan_time"><small class="text-muted">${Utils.escapeHtml(invoice.time_ago || '-')}</small></td>
                <td class="text-center col-reimbursement_status">${displayStatusCell}</td>
                <td class="text-center col-record_type">${displayRecordTypeBadge}</td>
                <td class="text-center col-voucher">${voucherBadge}</td>
                <td class="text-center actions-cell col-actions">
                    <button class="btn btn-sm btn-outline-primary me-1 view-btn" title="查看详情">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary me-1 contract-search-btn" title="查找关联合同">
                        <i class="bi bi-file-earmark-lock2"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success me-1 export-docx-btn" title="导出 DOCX">
                        <i class="bi bi-file-earmark-word"></i>
                    </button>
                    ${isAdmin ? `<button class="btn btn-sm btn-outline-info me-1 signature-btn" title="签章管理">
                        <i class="bi bi-pen"></i>
                    </button>` : ''}
                    <button class="btn btn-sm btn-outline-warning me-1 edit-btn" title="编辑">
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
        this.updateSelectionRowHighlight();
        this.updateSelectAllCheckbox();
        this.updateBatchExportButton();
    },

    updateCheckboxes() {
        document.querySelectorAll('.invoice-checkbox').forEach(cb => {
            cb.checked = AppState.selectedInvoices.has(cb.dataset.invoiceNumber);
        });
        this.updateSelectionRowHighlight();
        this.updateSelectAllCheckbox();
    },

    updateSelectionRowHighlight() {
        document.querySelectorAll('#invoiceTableBody tr').forEach(row => {
            const invoiceNumber = row.dataset.invoiceNumber;
            row.classList.toggle('row-selected', AppState.selectedInvoices.has(invoiceNumber));
        });
    },

    updateSelectAllCheckbox() {
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb && AppState.invoices.length > 0) {
            selectAllCb.checked = AppState.selectedInvoices.size === AppState.invoices.length;
            selectAllCb.indeterminate = AppState.selectedInvoices.size > 0 &&
                AppState.selectedInvoices.size < AppState.invoices.length;
        } else if (selectAllCb) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        }
    },

    updateBatchExportButton() {
        const batchDocxBtn = document.getElementById('batchExportDocxBtn');
        const exportExcelBtn = document.getElementById('exportBtn');
        const count = AppState.selectedInvoices.size;

        // 鏇存柊搴曢儴鎿嶄綔鏍忕殑瀵煎嚭鎸夐挳鏂囧瓧
        if (batchDocxBtn) {
            batchDocxBtn.innerHTML = count > 0
                ? `<i class="bi bi-file-earmark-word me-1"></i>导出DOCX (${count})`
                : `<i class="bi bi-file-earmark-word me-1"></i>导出DOCX`;
        }

        if (exportExcelBtn) {
            exportExcelBtn.innerHTML = count > 0
                ? `<i class="bi bi-file-earmark-excel me-1"></i>导出Excel (${count})`
                : `<i class="bi bi-file-earmark-excel me-1"></i>导出Excel`;
        }

        if (DOM.selectionSummary) {
            DOM.selectionSummary.textContent = `已选择 ${count} 项`;
        }

        if (DOM.selectionBar) {
            DOM.selectionBar.classList.toggle('d-none', count === 0);
        }
    },

    clearSelection() {
        AppState.selectedInvoices.clear();
        this.updateCheckboxes();
        this.updateBatchExportButton();
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
    async execute(query, options = {}) {
        AppState.searchQuery = query;
        if (options.resetFocus) {
            AppState.focusInvoice = '';
            AppState.navigationState.focusInvoiceHandled = false;
        }
        try {
            AppState.pagination.page = 1;
            await App.loadInvoices();
        } catch (error) {
            if (error.message !== '需要登录') {
                Toast.error('搜索失败: ' + error.message);
            }
        }
    },

    clear() {
        DOM.searchInput.value = '';
        this.execute('', { resetFocus: true });
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
        // 淇濈暀褰撳墠鏍囩椤电殑鐘舵€佺瓫閫?
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
// Column Visibility Settings
// ============================================
const ColumnSettings = {
    visibilityStorageKey: 'invoice_admin_column_visibility_v1',
    orderStorageKey: 'invoice_admin_column_order_v1',
    widthStorageKey: 'invoice_admin_column_width_v1',
    serverPreferenceKey: 'admin_column_layout',
    syncDebounceMs: 800,
    defaults: {
        invoice_number: true,
        invoice_date: true,
        item_name: true,
        amount: true,
        reimbursement_person_name: true,
        remark: true,
        uploaded_by: true,
        scan_time: true,
        reimbursement_status: true,
        record_type: true,
        voucher: true,
        actions: true
    },
    visibility: {},
    order: [],
    widths: {},
    draggingColumn: null,
    isResizing: false,
    headerInteractionsBound: false,
    syncTimer: null,

    init() {
        this.visibility = {
            ...this.defaults,
            ...this.loadVisibility()
        };
        this.order = this.loadOrder();
        this.widths = this.loadWidths();
        this.normalizeState();
        this.bindEvents();
        this.initHeaderInteractions();
        this.syncMenu();
        this.applyToTable();
        this.loadFromServer();
    },

    getColumns() {
        return Object.keys(this.defaults);
    },

    bindEvents() {
        if (DOM.columnVisibilityMenu) {
            DOM.columnVisibilityMenu.addEventListener('click', (e) => e.stopPropagation());
            DOM.columnVisibilityMenu.addEventListener('change', (e) => {
                const target = e.target;
                if (!(target instanceof HTMLInputElement) || !target.classList.contains('column-toggle')) return;
                const column = target.dataset.column;
                if (!column) return;

                const visibleCount = this.countVisibleColumns();
                if (!target.checked && visibleCount <= 1) {
                    target.checked = true;
                    Toast.warning('At least one column must stay visible');
                    return;
                }

                this.setColumn(column, target.checked);
            });
        }

        if (DOM.showAllColumnsBtn) {
            DOM.showAllColumnsBtn.addEventListener('click', () => this.showAll());
        }

        if (DOM.resetColumnsBtn) {
            DOM.resetColumnsBtn.addEventListener('click', () => this.reset());
        }

        if (DOM.exportColumnLayoutBtn) {
            DOM.exportColumnLayoutBtn.addEventListener('click', () => this.exportLayout());
        }

        if (DOM.importColumnLayoutBtn && DOM.importColumnLayoutInput) {
            DOM.importColumnLayoutBtn.addEventListener('click', () => DOM.importColumnLayoutInput.click());
            DOM.importColumnLayoutInput.addEventListener('change', async (e) => {
                const input = e.target;
                const file = input?.files?.[0];
                if (!file) return;
                await this.importLayout(file);
                input.value = '';
            });
        }
    },

    countVisibleColumns() {
        return Object.values(this.visibility).filter(Boolean).length;
    },

    setColumn(column, visible) {
        if (!(column in this.defaults)) return;
        this.visibility[column] = Boolean(visible);
        this.saveVisibility();
        this.syncMenu();
        this.applyToTable();
        this.scheduleSyncToServer();
    },

    showAll() {
        this.visibility = { ...this.defaults };
        this.saveVisibility();
        this.syncMenu();
        this.applyToTable();
        this.scheduleSyncToServer();
    },

    reset() {
        this.visibility = { ...this.defaults };
        this.order = this.getColumns();
        this.widths = {};
        localStorage.removeItem(this.visibilityStorageKey);
        localStorage.removeItem(this.orderStorageKey);
        localStorage.removeItem(this.widthStorageKey);
        this.syncMenu();
        this.applyToTable();
        this.scheduleSyncToServer();
    },

    applyToTable() {
        this.applyOrder();
        this.applyWidths();
        Object.entries(this.defaults).forEach(([column]) => {
            const isVisible = this.visibility[column] !== false;
            document.querySelectorAll(`.col-${column}`).forEach(el => {
                el.classList.toggle('d-none', !isVisible);
            });
        });
        this.initHeaderInteractions();
    },

    syncMenu() {
        if (!DOM.columnVisibilityMenu) return;
        DOM.columnVisibilityMenu.querySelectorAll('.column-toggle').forEach(input => {
            if (!(input instanceof HTMLInputElement)) return;
            const column = input.dataset.column;
            if (!column) return;
            input.checked = this.visibility[column] !== false;
        });
    },

    normalizeState() {
        Object.keys(this.defaults).forEach((key) => {
            if (typeof this.visibility[key] !== 'boolean') {
                this.visibility[key] = this.defaults[key];
            }
        });

        const seen = new Set();
        const ordered = [];
        this.order.forEach((key) => {
            if (!seen.has(key) && key in this.defaults) {
                seen.add(key);
                ordered.push(key);
            }
        });
        this.getColumns().forEach((key) => {
            if (!seen.has(key)) ordered.push(key);
        });
        this.order = ordered;

        const normalizedWidths = {};
        Object.entries(this.widths || {}).forEach(([key, value]) => {
            const width = Number(value);
            if ((key in this.defaults) && Number.isFinite(width) && width > 40) {
                normalizedWidths[key] = Math.round(width);
            }
        });
        this.widths = normalizedWidths;
    },

    extractColumnKey(element) {
        if (!element || !element.classList) return '';
        const className = Array.from(element.classList).find(cls => cls.startsWith('col-'));
        return className ? className.slice(4) : '';
    },

    applyOrder() {
        const headerRow = DOM.invoiceTable?.querySelector('thead tr');
        if (!headerRow) return;

        this.order.forEach((column) => {
            const header = headerRow.querySelector(`th.col-${column}`);
            if (header) headerRow.appendChild(header);
        });

        const rows = DOM.invoiceTableBody?.querySelectorAll('tr') || [];
        rows.forEach((row) => {
            this.order.forEach((column) => {
                const cell = row.querySelector(`td.col-${column}`);
                if (cell) row.appendChild(cell);
            });
        });
    },

    applyWidths() {
        this.getColumns().forEach((column) => {
            const width = this.widths[column];
            if (Number.isFinite(width)) {
                this.applyColumnWidth(column, width);
            } else {
                this.clearColumnWidth(column);
            }
        });
    },

    getMinWidth(column) {
        if (column === 'actions') return 180;
        if (column === 'item_name' || column === 'remark') return 140;
        return 90;
    },

    applyColumnWidth(column, width) {
        const bounded = Math.max(this.getMinWidth(column), Math.min(900, Math.round(width)));
        document.querySelectorAll(`th.col-${column}, td.col-${column}`).forEach((el) => {
            el.style.width = `${bounded}px`;
            el.style.minWidth = `${bounded}px`;
        });
    },

    clearColumnWidth(column) {
        document.querySelectorAll(`th.col-${column}, td.col-${column}`).forEach((el) => {
            el.style.width = '';
            el.style.minWidth = '';
        });
    },

    setColumnWidth(column, width, persist = true) {
        if (!(column in this.defaults)) return;
        const bounded = Math.max(this.getMinWidth(column), Math.min(900, Math.round(width)));
        this.widths[column] = bounded;
        this.applyColumnWidth(column, bounded);
        if (persist) {
            this.saveWidths();
            this.scheduleSyncToServer();
        }
    },

    reorderColumn(sourceColumn, targetColumn, dropRightSide) {
        if (sourceColumn === targetColumn) return;
        const sourceIdx = this.order.indexOf(sourceColumn);
        const targetIdx = this.order.indexOf(targetColumn);
        if (sourceIdx < 0 || targetIdx < 0) return;

        const next = [...this.order];
        next.splice(sourceIdx, 1);
        const insertionBase = next.indexOf(targetColumn);
        const insertAt = dropRightSide ? insertionBase + 1 : insertionBase;
        next.splice(insertAt, 0, sourceColumn);
        this.order = next;
        this.saveOrder();
        this.applyToTable();
        this.scheduleSyncToServer();
    },

    clearDragIndicators() {
        DOM.invoiceTable?.querySelectorAll('th.reorderable-col').forEach((th) => {
            th.classList.remove('drag-over-left', 'drag-over-right', 'dragging-col');
        });
    },

    initHeaderInteractions() {
        if (!DOM.invoiceTable || this.headerInteractionsBound) return;
        this.headerInteractionsBound = true;

        const headers = DOM.invoiceTable.querySelectorAll('thead th');
        headers.forEach((th) => {
            const column = this.extractColumnKey(th);
            if (!column) return;

            th.classList.add('reorderable-col');
            th.draggable = true;

            if (!th.querySelector('.col-resizer')) {
                const resizer = document.createElement('span');
                resizer.className = 'col-resizer';
                th.appendChild(resizer);

                resizer.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    this.isResizing = true;
                    th.classList.add('resizing-col');
                    const startX = event.clientX;
                    const startWidth = th.getBoundingClientRect().width;

                    const onMouseMove = (moveEvent) => {
                        const delta = moveEvent.clientX - startX;
                        this.setColumnWidth(column, startWidth + delta, false);
                    };

                    const onMouseUp = () => {
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                        th.classList.remove('resizing-col');
                        this.isResizing = false;
                        this.saveWidths();
                        this.scheduleSyncToServer();
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                });
            }

            th.addEventListener('dragstart', (event) => {
                if (this.isResizing) {
                    event.preventDefault();
                    return;
                }
                this.draggingColumn = column;
                th.classList.add('dragging-col');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', column);
                }
            });

            th.addEventListener('dragover', (event) => {
                event.preventDefault();
                if (!this.draggingColumn || this.draggingColumn === column) return;
                const rect = th.getBoundingClientRect();
                const dropRightSide = (event.clientX - rect.left) > rect.width / 2;
                this.clearDragIndicators();
                th.classList.add(dropRightSide ? 'drag-over-right' : 'drag-over-left');
            });

            th.addEventListener('drop', (event) => {
                event.preventDefault();
                const sourceColumn = this.draggingColumn || event.dataTransfer?.getData('text/plain');
                if (!sourceColumn || sourceColumn === column) return;
                const rect = th.getBoundingClientRect();
                const dropRightSide = (event.clientX - rect.left) > rect.width / 2;
                this.reorderColumn(sourceColumn, column, dropRightSide);
                this.clearDragIndicators();
                this.draggingColumn = null;
            });

            th.addEventListener('dragend', () => {
                this.draggingColumn = null;
                this.clearDragIndicators();
            });
        });
    },

    buildPreferencePayload() {
        return {
            version: 1,
            visibility: { ...this.visibility },
            order: [...this.order],
            widths: { ...this.widths }
        };
    },

    buildLayoutSnapshot() {
        return {
            ...this.buildPreferencePayload(),
            exported_at: new Date().toISOString()
        };
    },

    exportLayout() {
        try {
            const payload = this.buildLayoutSnapshot();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
            link.href = url;
            link.download = `invoice-column-layout-${stamp}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            Toast.success('Layout exported');
        } catch (error) {
            Toast.error('Export layout failed: ' + (error?.message || 'Unknown error'));
        }
    },

    async importLayout(file) {
        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            this.applyImportedLayout(payload, { syncServer: true });
            Toast.success('Layout imported');
        } catch (error) {
            Toast.error('Import layout failed: ' + (error?.message || 'Invalid file'));
        }
    },

    applyImportedLayout(payload, options = {}) {
        const { syncServer = true } = options;
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid layout schema');
        }

        const nextVisibility = payload.visibility && typeof payload.visibility === 'object'
            ? payload.visibility
            : {};
        const nextOrder = Array.isArray(payload.order) ? payload.order : [];
        const nextWidths = payload.widths && typeof payload.widths === 'object'
            ? payload.widths
            : {};

        this.visibility = { ...this.defaults, ...nextVisibility };
        this.order = nextOrder;
        this.widths = nextWidths;
        this.normalizeState();

        if (this.countVisibleColumns() === 0) {
            const first = this.getColumns()[0];
            this.visibility[first] = true;
        }

        this.saveVisibility();
        this.saveOrder();
        this.saveWidths();
        this.syncMenu();
        this.applyToTable();
        if (syncServer) this.scheduleSyncToServer();
    },

    scheduleSyncToServer() {
        if (!AppState.currentUser?.username) return;
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }
        this.syncTimer = setTimeout(() => {
            this.pushLayoutToServer();
        }, this.syncDebounceMs);
    },

    async pushLayoutToServer() {
        try {
            await API.setUserPreference(this.serverPreferenceKey, this.buildPreferencePayload());
        } catch (error) {
            console.warn('Failed to sync column layout to server', error);
        }
    },

    async loadFromServer() {
        if (!AppState.currentUser?.username) return;
        try {
            const result = await API.getUserPreference(this.serverPreferenceKey);
            const serverValue = result?.value;
            if (serverValue && typeof serverValue === 'object') {
                this.applyImportedLayout(serverValue, { syncServer: false });
            }
        } catch (error) {
            console.warn('Failed to load column layout from server', error);
        }
    },

    saveVisibility() {
        try {
            localStorage.setItem(this.visibilityStorageKey, JSON.stringify(this.visibility));
        } catch (error) {
            console.warn('Failed to persist column visibility settings', error);
        }
    },

    saveOrder() {
        try {
            localStorage.setItem(this.orderStorageKey, JSON.stringify(this.order));
        } catch (error) {
            console.warn('Failed to persist column order settings', error);
        }
    },

    saveWidths() {
        try {
            localStorage.setItem(this.widthStorageKey, JSON.stringify(this.widths));
        } catch (error) {
            console.warn('Failed to persist column width settings', error);
        }
    },

    loadVisibility() {
        try {
            const raw = localStorage.getItem(this.visibilityStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.warn('Failed to load column visibility settings', error);
            return {};
        }
    },

    loadOrder() {
        try {
            const raw = localStorage.getItem(this.orderStorageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Failed to load column order settings', error);
            return [];
        }
    },

    loadWidths() {
        try {
            const raw = localStorage.getItem(this.widthStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.warn('Failed to load column width settings', error);
            return {};
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
    // 鎶ラ攢浜哄垎缁勫垪琛紝姣忎釜鍒嗙粍鍖呭惈: { personId, personName, records: [{ pdfFile, voucherFiles }] }
    personGroups: [],
    groupIdCounter: 0,
    recordIdCounter: 0,
    // 缂撳瓨鎶ラ攢浜哄垪琛?
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

        // 閲嶇疆鎶ラ攢浜哄垎缁勫垪琛?
        this.personGroups = [];
        this.groupIdCounter = 0;
        this.recordIdCounter = 0;

        // 鍔犺浇鎶ラ攢浜哄垪琛ㄥ苟缂撳瓨
        await ReimbursementPerson.loadPersons();
        this.cachedPersons = ReimbursementPerson.persons;

        this.renderPersonGroups();

        // 鏄剧ず鎻愮ず淇℃伅
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
     * 娣诲姞涓€涓柊鐨勬姤閿€浜哄垎缁?
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

        // 闅愯棌鎻愮ず淇℃伅
        const hint = document.getElementById('uploadHint');
        if (hint) hint.classList.add('d-none');
    },

    /**
     * 鍒犻櫎涓€涓姤閿€浜哄垎缁?
     */
    removePersonGroup(groupId) {
        this.personGroups = this.personGroups.filter(g => g.id !== groupId);
        this.renderPersonGroups();

        // 濡傛灉娌℃湁鍒嗙粍浜嗭紝鏄剧ず鎻愮ず淇℃伅
        if (this.personGroups.length === 0) {
            const hint = document.getElementById('uploadHint');
            if (hint) hint.classList.remove('d-none');
        }
    },

    /**
     * 涓烘寚瀹氭姤閿€浜哄垎缁勬坊鍔犲彂绁ㄨ褰?
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
     * 浠庢寚瀹氭姤閿€浜哄垎缁勫垹闄ゅ彂绁ㄨ褰?
     */
    removeRecordFromGroup(groupId, recordId) {
        const group = this.personGroups.find(g => g.id === groupId);
        if (!group) return;

        group.records = group.records.filter(r => r.id !== recordId);
        this.renderPersonGroups();
    },

    /**
     * 鐢熸垚鎶ラ攢浜洪€夋嫨涓嬫媺妗嗙殑HTML
     */
    getPersonSelectHtml(groupId, selectedPersonId) {
        const options = this.cachedPersons.map(p =>
            `<option value="${p.id}" ${p.id === selectedPersonId ? 'selected' : ''}>${Utils.escapeHtml(p.name)}</option>`
        ).join('');
        return `
            <option value="">-- 选择报销人 --</option>
            ${options}
            <option value="__new__">+ 新增报销人</option>
        `;
    },

    /**
     * 娓叉煋鎶ラ攢浜哄垎缁勫垪琛?
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
                                           data-group-id="${group.id}" placeholder="输入新增报销人姓名"
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
                                                        <i class="bi bi-file-earmark-pdf text-danger me-1"></i>发票 PDF <span class="text-danger">*</span>
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

        // 缁戝畾浜嬩欢
        this.bindGroupEvents();
    },

    /**
     * 缁戝畾鎶ラ攢浜哄垎缁勭殑浜嬩欢
     */
    bindGroupEvents() {
        const container = document.getElementById('personGroupsContainer');
        if (!container) return;

        // 鍒犻櫎鎶ラ攢浜哄垎缁?
        container.querySelectorAll('.remove-group-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = parseInt(e.currentTarget.dataset.groupId);
                this.removePersonGroup(groupId);
            });
        });

        // 鎶ラ攢浜洪€夋嫨
        container.querySelectorAll('.person-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const groupId = parseInt(e.target.dataset.groupId);
                const group = this.personGroups.find(g => g.id === groupId);
                if (!group) return;

                if (e.target.value === '__new__') {
                    // 鍒囨崲鍒版柊澧炴姤閿€浜烘ā寮?
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

        // 鏂版姤閿€浜哄悕绉拌緭鍏?
        container.querySelectorAll('.new-person-name-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const groupId = parseInt(e.target.dataset.groupId);
                const group = this.personGroups.find(g => g.id === groupId);
                if (group) {
                    group.newPersonName = e.target.value;
                }
            });
        });

        // 鍙栨秷鏂板鎶ラ攢浜?
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

        // 娣诲姞鍙戠エ璁板綍
        container.querySelectorAll('.add-record-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = parseInt(e.currentTarget.dataset.groupId);
                this.addRecordToGroup(groupId);
            });
        });

        // 鍒犻櫎鍙戠エ璁板綍
        container.querySelectorAll('.remove-record-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = parseInt(e.currentTarget.dataset.groupId);
                const recordId = parseInt(e.currentTarget.dataset.recordId);
                this.removeRecordFromGroup(groupId, recordId);
            });
        });

        // PDF鏂囦欢閫夋嫨
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

        // 鍑瘉鏂囦欢閫夋嫨
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
     * 鎸夋姤閿€浜哄垎缁勪笂浼狅紝姣忎釜璁板綍鏈夊悇鑷殑鍑瘉
     */
    async handleUploadWithVouchers() {
        // 楠岃瘉鏄惁鏈夋姤閿€浜哄垎缁?
        if (this.personGroups.length === 0) {
            if (DOM.uploadInvoiceError) {
                DOM.uploadInvoiceError.textContent = '请至少添加一组报销记录';
                DOM.uploadInvoiceError.classList.remove('d-none');
            }
            return;
        }

        // 楠岃瘉姣忎釜鍒嗙粍閮芥湁鎶ラ攢浜哄拰鍙戠エ璁板綍
        for (let i = 0; i < this.personGroups.length; i++) {
            const group = this.personGroups[i];
            if (group.isNewPerson) {
                if (!group.newPersonName.trim()) {
                    if (DOM.uploadInvoiceError) {
                        DOM.uploadInvoiceError.textContent = `第 ${i + 1} 组缺少新增报销人姓名`;
                        DOM.uploadInvoiceError.classList.remove('d-none');
                    }
                    return;
                }
            } else if (!group.personId) {
                if (DOM.uploadInvoiceError) {
                    DOM.uploadInvoiceError.textContent = `第 ${i + 1} 组未选择报销人`;
                    DOM.uploadInvoiceError.classList.remove('d-none');
                }
                return;
            }

            if (group.records.length === 0) {
                if (DOM.uploadInvoiceError) {
                    DOM.uploadInvoiceError.textContent = `第 ${i + 1} 组还没有上传记录`;
                    DOM.uploadInvoiceError.classList.remove('d-none');
                }
                return;
            }

            const invalidRecords = group.records.filter(r => !r.pdfFile);
            if (invalidRecords.length > 0) {
                if (DOM.uploadInvoiceError) {
                    DOM.uploadInvoiceError.textContent = `报销人 ${i + 1} 的发票记录未选择 PDF 文件`;
                    DOM.uploadInvoiceError.classList.remove('d-none');
                }
                return;
            }
        }

        if (this.isUploading) return;
        this.isUploading = true;

        // 璁＄畻鎬昏褰曟暟
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

            // 寮€濮嬪厑璁告樉绀鸿繘搴?
            this.startProgress();

            // 澶勭悊姣忎釜鎶ラ攢浜哄垎缁?
            for (const group of this.personGroups) {
                let personId = group.personId;

                // 濡傛灉鏄柊鎶ラ攢浜猴紝鍏堝垱寤?
                if (group.isNewPerson && group.newPersonName.trim()) {
                    try {
                        const result = await API.createReimbursementPerson(group.newPersonName.trim());
                        if (result.success && result.person) {
                            personId = result.person.id;
                        } else {
                            Toast.error(`创建报销人“${group.newPersonName}”失败`);
                            continue;
                        }
                    } catch (e) {
                        Toast.error(`创建报销人失败: ${e.message}`);
                        continue;
                    }
                }

                // 澶勭悊璇ユ姤閿€浜虹殑姣忔潯鍙戠エ璁板綍
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
                Toast.success(`成功上传 ${successCount} 条记录`);
            }
            if (duplicateCount > 0) {
                Toast.warning(`${duplicateCount} 张发票已存在，已跳过`);
            }
            if (errorCount > 0) {
                Toast.error(`${errorCount} 条记录上传失败`);
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
        if (this.isUploading) return; // 闃叉閲嶅涓婁紶

        this.isUploading = true;
        this.startProgress();  // 寮€濮嬪厑璁告樉绀鸿繘搴?
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
                        // 涓嶅湪寰幆涓樉绀洪敊璇紝閬垮厤闃诲
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

        // 纭繚杩涘害妗嗕竴瀹氫細鍏抽棴锛堢瓑寰呭叧闂畬鎴愶級
        await this.forceHideProgress();
        this.isUploading = false;

        // Show summary (Requirements: 3.1, 3.2, 3.3)
        if (successCount > 0) {
            Toast.success(`成功上传 ${successCount} 个文件`);
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

    progressAllowed: false,  // 鏄惁鍏佽鏄剧ず杩涘害妗?
    progressShowing: false,   // 杩涘害妗嗗綋鍓嶆槸鍚︽樉绀?

    showProgress(percent, text) {
        // 鍙湁鍦ㄥ厑璁告樉绀烘椂鎵嶆樉绀?
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
        // 绂佹鍐嶆樉绀鸿繘搴︽
        this.progressAllowed = false;
        this.progressShowing = false;

        const modalEl = DOM.uploadProgressModal;

        // 浣跨敤 Promise 绛夊緟妯℃€佹鍏抽棴鍔ㄧ敾瀹屾垚
        await new Promise(resolve => {
            const onHidden = () => {
                modalEl.removeEventListener('hidden.bs.modal', onHidden);
                resolve();
            };

            // 濡傛灉妯℃€佹姝ｅ湪鏄剧ず锛岀瓑寰呭畠鍏抽棴
            if (modalEl && modalEl.classList.contains('show')) {
                modalEl.addEventListener('hidden.bs.modal', onHidden);
                try {
                    this.modalInstance.hide();
                } catch (e) { }

                // 璁剧疆瓒呮椂锛岄槻姝簨浠舵病鏈夎Е鍙?
                setTimeout(() => {
                    modalEl.removeEventListener('hidden.bs.modal', onHidden);
                    resolve();
                }, 500);
            } else {
                resolve();
            }
        });

        // 鐩存帴鎿嶄綔 DOM 纭繚鍏抽棴
        if (modalEl) {
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
            modalEl.setAttribute('aria-hidden', 'true');
        }

        // 绉婚櫎鎵€鏈?backdrop
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());

        // 鎭㈠ body 婊氬姩
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        DOM.uploadProgressBar.style.width = '0%';

        // 棰濆绛夊緟纭繚 DOM 瀹屽叏鏇存柊
        await new Promise(resolve => setTimeout(resolve, 100));
    },

    // 寮€濮嬫樉绀鸿繘搴︼紙鍦ㄤ笂浼犲紑濮嬫椂璋冪敤锛?
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
        // 纭繚杩涘害妗嗗凡瀹屽叏鍏抽棴
        await this.forceHideProgress();

        // 棰濆绛夊緟纭繚妯℃€佹鍔ㄧ敾瀹屾垚
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

        // 鏄剧ず涓婁紶浜哄拰涓婁紶鏃堕棿
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

        // 鍐嶆纭繚娓呯悊鎵€鏈?backdrop
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        // 鏄剧ず閲嶅鍙戠エ寮圭獥
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

        // 鏄剧ず鏂囦欢鍚嶏紙鍙彇鏈€鍚庝竴閮ㄥ垎锛?
        const filePath = invoice.file_path || '-';
        const fileName = filePath.split(/[/\\]/).pop();
        DOM.detailFilePath.textContent = fileName;
        DOM.detailFilePath.title = filePath;

        await InvoiceContracts.load(invoice.invoice_number);

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

        // 楠岃瘉
        if (!data.invoice_date) {
            DOM.editError.textContent = '请填写开票日期';
            DOM.editError.classList.remove('d-none');
            return;
        }
        if (data.amount <= 0) {
            DOM.editError.textContent = '閲戦蹇呴』澶т簬0';
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

const InvoiceContracts = {
    renderLoading() {
        if (DOM.detailRelatedContracts) {
            DOM.detailRelatedContracts.innerHTML = '<div class="invoice-related-empty">正在加载关联合同...</div>';
        }
        if (DOM.detailRelatedContractsCount) {
            DOM.detailRelatedContractsCount.textContent = '0';
        }
    },

    renderContracts(contracts = []) {
        if (DOM.detailRelatedContractsCount) {
            DOM.detailRelatedContractsCount.textContent = String(contracts.length);
        }
        if (!DOM.detailRelatedContracts) {
            return;
        }
        if (!contracts.length) {
            DOM.detailRelatedContracts.innerHTML = '<div class="invoice-related-empty">暂无关联合同</div>';
            return;
        }

        DOM.detailRelatedContracts.innerHTML = contracts.map((contract) => {
            const candidateNumbers = contract.invoice_numbers || [];
            const linkedNumbers = contract.linked_invoice_numbers || [];
            return `
                <div class="invoice-related-card">
                    <div class="invoice-related-header">
                        <div>
                            <div class="invoice-related-title">${Utils.escapeHtml(contract.contract_title || contract.original_filename || '未命名合同')}</div>
                            <div class="invoice-related-meta">
                                <span>${Utils.escapeHtml(contract.original_filename || '-')}</span>
                                <span>${Utils.escapeHtml(Utils.formatDateTime(contract.upload_time))}</span>
                            </div>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-secondary invoice-related-open-btn" data-contract-search="${Utils.escapeHtml(AppState.currentInvoice?.invoice_number || '')}">
                            <i class="bi bi-box-arrow-up-right me-1"></i>查看合同
                        </button>
                    </div>
                    <div class="invoice-related-meta">
                        <span>候选 ${candidateNumbers.length}</span>
                        <span>已配对 ${linkedNumbers.length}</span>
                        <span>缺失 ${contract.candidate_missing_count || 0}</span>
                    </div>
                    </div>
                    <div class="contract-overview-chips mt-2">
                        ${(candidateNumbers.length ? candidateNumbers : linkedNumbers).map((invoiceNumber) => `
                            <button type="button" class="contract-reference-link" data-open-invoice="${Utils.escapeHtml(invoiceNumber)}">
                                ${Utils.escapeHtml(invoiceNumber)}
                            </button>
                        `).join('') || '<span class="text-muted">-</span>'}
                    </div>
                </div>
            `;
        }).join('');
    },

    async load(invoiceNumber) {
        this.renderLoading();
        if (!invoiceNumber) {
            this.renderContracts([]);
            return;
        }
        try {
            const data = await API.getInvoiceContracts(invoiceNumber);
            this.renderContracts(data.contracts || []);
        } catch (error) {
            if (DOM.detailRelatedContracts) {
                DOM.detailRelatedContracts.innerHTML = `<div class="invoice-related-empty">${Utils.escapeHtml(error.message || '加载关联合同失败')}</div>`;
            }
            if (DOM.detailRelatedContractsCount) {
                DOM.detailRelatedContractsCount.textContent = '0';
            }
        }
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

            // 鍒涘缓涓嬭浇閾炬帴
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
            a.download = `发票批量导出_${timestamp}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            Toast.success(`成功导出 ${selectedInvoices.length} 份文档`);
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
        if (!confirm('确认删除这张凭证吗？')) return;

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
                Toast.success('新增报销人成功');
                // Reload persons and select the new one
                await this.loadPersons();
                if (DOM.reimbursementPersonSelect && result.person) {
                    DOM.reimbursementPersonSelect.value = result.person.id;
                }
                this.hideNewPersonInput();
                return result.person;
            } else {
                Toast.error(result.message || '新增报销人失败');
                return null;
            }
        } catch (error) {
            Toast.error('新增报销人失败: ' + error.message);
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
                // 鏄剧ず/闅愯棌绠＄悊鍛樺姛鑳?
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
                // 鏄剧ず/闅愯棌绠＄悊鍛樺姛鑳?
                const adminBtn = document.getElementById('userManagementBtn');
                if (adminBtn) {
                    adminBtn.style.display = result.user.is_admin ? 'inline-block' : 'none';
                }
                this.hideLoginModal();
                Toast.success('登录成功');
                if (isInvoicePage) {
                    // 加载筛选数据
                    await PersonFilter.loadPersons();
                    await PersonFilter.loadUploaders();
                    await ColumnSettings.loadFromServer();
                    await App.loadInvoices();
                } else if (isContractPage) {
                    await ContractManager.loadContracts();
                }
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
            Toast.error('退出登录失败');
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
            Toast.error('当前用户没有管理员权限');
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
                    <button class="btn btn-sm btn-outline-warning me-1" onclick="UserManagement.showEditForm(${user.id})" title="编辑用户">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="UserManagement.deleteUser(${user.id})" title="删除用户">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    showAddForm() {
        this.editingUserId = null;
        document.getElementById('userFormTitle').textContent = '新增用户';
        document.getElementById('userFormUsername').value = '';
        document.getElementById('userFormUsername').disabled = false;
        document.getElementById('userFormDisplayName').value = '';
        document.getElementById('userFormPassword').value = '';
        document.getElementById('userFormPassword').required = true;
        document.getElementById('userFormPasswordHint').textContent = '密码长度至少 6 位';
        document.getElementById('userFormIsAdmin').checked = false;
        document.getElementById('userFormError').classList.add('d-none');
        document.getElementById('userListSection').classList.add('d-none');
        document.getElementById('userFormSection').classList.remove('d-none');
        document.getElementById('userFormTitle').textContent = '新增用户';
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
        document.getElementById('userFormPasswordHint').textContent = '留空则不修改密码';
        document.getElementById('userFormIsAdmin').checked = user.is_admin;
        document.getElementById('userFormError').classList.add('d-none');
        document.getElementById('userListSection').classList.add('d-none');
        document.getElementById('userFormSection').classList.remove('d-none');
        document.getElementById('userFormTitle').textContent = '编辑用户';
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
        errorEl.classList.add('d-none');

        if (!displayName) {
            errorEl.textContent = '显示名称不能为空';
            errorEl.classList.remove('d-none');
            return;
        }

        try {
            let result;
            if (this.editingUserId) {
                const updateData = { display_name: displayName, is_admin: isAdmin };
                if (password) updateData.password = password;
                result = await API.updateUser(this.editingUserId, updateData);
            } else {
                if (!username) {
                    errorEl.textContent = '用户名不能为空';
                    errorEl.classList.remove('d-none');
                    return;
                }
                if (!password || password.length < 6) {
                    errorEl.textContent = '密码长度至少 6 位';
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

        if (!confirm(`确认删除用户“${user.display_name}”吗？`)) return;

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
// Contract Management
// ============================================
const ContractManager = {
    modalInstance: null,
    pairModalInstance: null,
    detailModalInstance: null,
    editModalInstance: null,
    currentContract: null,
    contracts: [],
    tagValues: [],
    selectedFile: null,
    activeTags: new Set(),
    pairFilter: 'all',

    init() {
        if (DOM.contractManagementModal) {
            this.modalInstance = new bootstrap.Modal(DOM.contractManagementModal);
        }
        if (DOM.contractPairModal) {
            this.pairModalInstance = new bootstrap.Modal(DOM.contractPairModal);
        }
        if (DOM.contractDetailModal) {
            this.detailModalInstance = new bootstrap.Modal(DOM.contractDetailModal);
        }
        if (DOM.contractEditModal) {
            this.editModalInstance = new bootstrap.Modal(DOM.contractEditModal);
        }
        this.initUploadUI();
        this.bindEvents();
    },

    bindEvents() {
        DOM.uploadContractBtn?.addEventListener('click', async () => {
            await this.uploadContract();
        });

        DOM.refreshContractsBtn?.addEventListener('click', async () => {
            await this.loadContracts();
        });

        DOM.contractSearchInput?.addEventListener('input', Utils.debounce(async () => {
            await this.loadContracts();
        }, 300));

        DOM.contractTableBody?.addEventListener('click', async (e) => {
            const downloadBtn = e.target.closest('.contract-download-btn');
            if (downloadBtn) {
                const contractId = downloadBtn.dataset.contractId;
                const url = API.getContractDownloadUrl(contractId, false);
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                a.remove();
                return;
            }

            const detailBtn = e.target.closest('.contract-detail-btn');
            if (detailBtn) {
                const contractId = Number(detailBtn.dataset.contractId);
                await this.openDetailModal(contractId);
                return;
            }

            const editBtn = e.target.closest('.contract-edit-btn');
            if (editBtn) {
                const contractId = Number(editBtn.dataset.contractId);
                const contract = this.contracts.find((item) => item.id === contractId);
                if (contract) {
                    this.openEditModal(contract);
                } else {
                    await this.openDetailModal(contractId);
                    if (this.currentContract) {
                        this.openEditModal(this.currentContract);
                    }
                }
                return;
            }

            const pairBtn = e.target.closest('.contract-pair-btn');
            if (pairBtn) {
                const contractId = Number(pairBtn.dataset.contractId);
                const contract = this.contracts.find((item) => item.id === contractId);
                if (contract) {
                    await this.openPairModal(contract);
                }
                return;
            }

            const deleteBtn = e.target.closest('.contract-delete-btn');
            if (deleteBtn) {
                const contractId = Number(deleteBtn.dataset.contractId);
                await this.deleteContract(contractId);
            }
        });

        DOM.contractPairSaveBtn?.addEventListener('click', async () => {
            await this.savePairing();
        });

        DOM.contractDetailPairBtn?.addEventListener('click', async () => {
            if (!this.currentContract) return;
            const contract = this.contracts.find((item) => item.id === this.currentContract.id) || this.currentContract;
            if (this.detailModalInstance) {
                this.detailModalInstance.hide();
            }
            await this.openPairModal(contract);
        });

        DOM.contractEditSaveBtn?.addEventListener('click', async () => {
            await this.saveEdit();
        });

        DOM.resetContractFormBtn?.addEventListener('click', () => {
            this.resetUploadForm();
        });

        DOM.contractPairFilter?.addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-value]');
            if (!btn) return;
            this.pairFilter = btn.dataset.value || 'all';
            DOM.contractPairFilter.querySelectorAll('button').forEach((button) => {
                button.classList.toggle('active', button.dataset.value === this.pairFilter);
            });
            this.render();
        });
    },

    openEditModal(contract) {
        if (!this.editModalInstance || !contract) return;
        this.currentContract = contract;
        if (DOM.contractEditError) {
            DOM.contractEditError.classList.add('d-none');
        }
        if (DOM.contractEditTitleInput) DOM.contractEditTitleInput.value = contract.contract_title || '';
        if (DOM.contractEditTagsInput) DOM.contractEditTagsInput.value = contract.contract_tags_text || '';
        if (DOM.contractEditInvoiceNumbersInput) {
            DOM.contractEditInvoiceNumbersInput.value = contract.invoice_numbers_text || '';
        }
        this.editModalInstance.show();
    },

    async saveEdit() {
        if (!this.currentContract) return;
        const payload = {
            contract_title: DOM.contractEditTitleInput?.value?.trim() || '',
            contract_tags: DOM.contractEditTagsInput?.value?.trim() || '',
            invoice_numbers: DOM.contractEditInvoiceNumbersInput?.value?.trim() || ''
        };

        try {
            const result = await API.updateContract(this.currentContract.id, payload);
            if (!result.success) {
                if (DOM.contractEditError) {
                    DOM.contractEditError.textContent = result.message || '更新失败';
                    DOM.contractEditError.classList.remove('d-none');
                } else {
                    Toast.error(result.message || '更新失败');
                }
                return;
            }
            Toast.success(result.message || '更新成功');
            await this.loadContracts();
            if (this.editModalInstance) {
                this.editModalInstance.hide();
            }
        } catch (error) {
            if (DOM.contractEditError) {
                DOM.contractEditError.textContent = error.message || '更新失败';
                DOM.contractEditError.classList.remove('d-none');
            } else {
                Toast.error(error.message || '更新失败');
            }
        }
    },

    initUploadUI() {
        if (DOM.contractDropZone && DOM.contractFileInput) {
            DOM.contractDropZone.addEventListener('click', () => {
                DOM.contractFileInput.click();
            });
            DOM.contractDropZone.addEventListener('dragover', (event) => {
                event.preventDefault();
                DOM.contractDropZone.classList.add('drag-over');
            });
            DOM.contractDropZone.addEventListener('dragleave', () => {
                DOM.contractDropZone.classList.remove('drag-over');
            });
            DOM.contractDropZone.addEventListener('drop', (event) => {
                event.preventDefault();
                DOM.contractDropZone.classList.remove('drag-over');
                const file = event.dataTransfer?.files?.[0];
                if (file) {
                    this.handleContractFile(file);
                }
            });
            DOM.contractFileInput.addEventListener('change', (event) => {
                const file = event.target.files?.[0];
                if (file) {
                    this.handleContractFile(file);
                }
            });
        }

        DOM.contractFileClearBtn?.addEventListener('click', () => {
            this.selectedFile = null;
            if (DOM.contractFileInput) DOM.contractFileInput.value = '';
            this.updateFileInfo(null);
        });

        if (DOM.contractTagEntryInput) {
            DOM.contractTagEntryInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    this.addTagFromInput();
                }
            });
            DOM.contractTagEntryInput.addEventListener('blur', () => {
                this.addTagFromInput();
            });
        }
    },

    addTagFromInput() {
        const raw = DOM.contractTagEntryInput?.value?.trim() || '';
        if (!raw) return;
        raw.split(',').forEach((item) => this.addTag(item.trim()));
        if (DOM.contractTagEntryInput) DOM.contractTagEntryInput.value = '';
    },

    addTag(tag) {
        if (!tag) return;
        if (this.tagValues.includes(tag)) return;
        this.tagValues.push(tag);
        this.renderTags();
    },

    removeTag(tag) {
        this.tagValues = this.tagValues.filter((item) => item !== tag);
        this.renderTags();
    },

    renderTags() {
        if (DOM.contractTagList) {
            DOM.contractTagList.innerHTML = this.tagValues.map((tag) => `
                <span class="contract-tag-chip">
                    ${Utils.escapeHtml(tag)}
                    <button type="button" data-tag="${Utils.escapeHtml(tag)}">&times;</button>
                </span>
            `).join('');
            DOM.contractTagList.querySelectorAll('button[data-tag]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.removeTag(btn.dataset.tag || '');
                });
            });
        }
        if (DOM.contractTagsInput) {
            DOM.contractTagsInput.value = this.tagValues.join(', ');
        }
    },

    handleContractFile(file) {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            Toast.error('合同仅支持 PDF 格式');
            return;
        }
        this.selectedFile = file;
        this.updateFileInfo(file);
    },

    updateFileInfo(file) {
        if (!DOM.contractFileInfo || !DOM.contractFileName || !DOM.contractFileMeta) return;
        if (!file) {
            DOM.contractFileInfo.classList.add('d-none');
            return;
        }
        DOM.contractFileName.textContent = file.name;
        DOM.contractFileMeta.textContent = `大小：${Utils.formatFileSize(file.size || 0)}`;
        DOM.contractFileInfo.classList.remove('d-none');
    },

    resetUploadForm() {
        if (DOM.contractInvoiceNumbersInput) DOM.contractInvoiceNumbersInput.value = '';
        if (DOM.contractTagEntryInput) DOM.contractTagEntryInput.value = '';
        this.tagValues = [];
        this.renderTags();
        this.selectedFile = null;
        if (DOM.contractFileInput) DOM.contractFileInput.value = '';
        this.updateFileInfo(null);
    },

    async openModal() {
        if (!this.modalInstance) return;
        await this.loadContracts();
        this.resetUploadForm();
        this.modalInstance.show();
    },

    async loadContracts() {
        try {
            const search = DOM.contractSearchInput?.value?.trim() || '';
            const data = await API.getContracts(search, 500);
            this.contracts = data.contracts || [];
            this.renderTagFilters();
            this.render();
        } catch (error) {
            Toast.error(error.message || '获取合同列表失败');
        }
    },

    renderTagFilters() {
        if (!DOM.contractTagFilterList) return;
        const tags = new Set();
        this.contracts.forEach((contract) => {
            (contract.contract_tags || []).forEach((tag) => tags.add(tag));
        });
        const tagList = Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-Hans'));
        // Drop active tags that no longer exist in current dataset
        this.activeTags.forEach((tag) => {
            if (!tags.has(tag)) {
                this.activeTags.delete(tag);
            }
        });
        DOM.contractTagFilterList.innerHTML = `
            <button type="button" class="contract-tag-filter ${this.activeTags.size === 0 ? 'active' : ''}" data-tag="__all">全部标签</button>
            ${tagList.map((tag) => `
                <button type="button" class="contract-tag-filter ${this.getTagColorClass(tag)} ${this.activeTags.has(tag) ? 'active' : ''}" data-tag="${Utils.escapeHtml(tag)}">
                    ${Utils.escapeHtml(tag)}
                </button>
            `).join('')}
        `;
        DOM.contractTagFilterList.querySelectorAll('button[data-tag]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag || '';
                if (tag === '__all') {
                    this.activeTags.clear();
                } else {
                    if (this.activeTags.has(tag)) {
                        this.activeTags.delete(tag);
                    } else {
                        this.activeTags.add(tag);
                    }
                }
                this.renderTagFilters();
                this.render();
            });
        });
    },

    getTagColorClass(tag) {
        if (!tag) return 'tag-color-0';
        let hash = 0;
        for (let i = 0; i < tag.length; i += 1) {
            hash = (hash * 31 + tag.charCodeAt(i)) % 8;
        }
        return `tag-color-${hash}`;
    },

    async openPairModal(contract) {
        if (!this.pairModalInstance || !contract) return;
        this.currentContract = contract;

        if (DOM.contractPairMeta) {
            const fileName = contract.original_filename || '-';
            const uploadTime = contract.upload_time ? Utils.formatDateTime(contract.upload_time) : '-';
            DOM.contractPairMeta.textContent = `合同文件：${fileName} | 上传时间：${uploadTime}`;
        }
        if (DOM.contractPairCandidates) {
            const candidates = contract.invoice_numbers_text || (contract.invoice_numbers || []).join('\n');
            DOM.contractPairCandidates.textContent = candidates || '暂无候选发票编号';
        }
        if (DOM.contractPairInvoiceNumbersInput) {
            DOM.contractPairInvoiceNumbersInput.value = '';
        }

        try {
            const data = await API.getContractLinks(contract.id);
            const linked = data.invoice_numbers || [];
            if (DOM.contractPairInvoiceNumbersInput) {
                if (linked.length) {
                    DOM.contractPairInvoiceNumbersInput.value = linked.join('\n');
                } else {
                    DOM.contractPairInvoiceNumbersInput.value = contract.invoice_numbers_text || '';
                }
            }
        } catch (error) {
            Toast.error(error.message || '获取配对信息失败');
        }

        this.pairModalInstance.show();
    },

    async openDetailModal(contractId) {
        if (!this.detailModalInstance || !contractId) return;

        try {
            const data = await API.getContractDetail(contractId);
            if (!data.success || !data.contract) {
                Toast.error(data.message || '获取合同详情失败');
                return;
            }
            const contract = data.contract;
            this.currentContract = contract;

            if (DOM.contractDetailTitle) DOM.contractDetailTitle.textContent = contract.contract_title || '-';
            if (DOM.contractDetailTags) {
                const tags = (contract.contract_tags || []).map((tag) => `<span class="contract-tag-badge ${this.getTagColorClass(tag)} me-1 mb-1">${Utils.escapeHtml(tag)}</span>`).join('');
                DOM.contractDetailTags.innerHTML = tags || '-';
            }
            if (DOM.contractDetailCandidates) {
                DOM.contractDetailCandidates.textContent = (contract.invoice_numbers || []).join(', ') || '-';
            }
            if (DOM.contractDetailLinked) {
                DOM.contractDetailLinked.textContent = (contract.linked_invoice_numbers || []).join(', ') || '-';
            }
            if (DOM.contractDetailFilename) DOM.contractDetailFilename.textContent = contract.original_filename || '-';
            if (DOM.contractDetailUploadTime) DOM.contractDetailUploadTime.textContent = Utils.formatDateTime(contract.upload_time);
            if (DOM.contractDetailFileSize) DOM.contractDetailFileSize.textContent = Utils.formatFileSize(contract.file_size || 0);
            if (DOM.contractDetailPreview) {
                DOM.contractDetailPreview.src = API.getContractDownloadUrl(contractId, true);
            }
            if (DOM.contractDetailDownloadBtn) {
                DOM.contractDetailDownloadBtn.href = API.getContractDownloadUrl(contractId, false);
            }

            this.detailModalInstance.show();
        } catch (error) {
            Toast.error(error.message || '获取合同详情失败');
        }
    },

    async savePairing() {
        if (!this.currentContract) return;
        const invoiceNumbers = DOM.contractPairInvoiceNumbersInput?.value?.trim() || '';

        try {
            const result = await API.updateContractLinks(this.currentContract.id, invoiceNumbers);
            if (!result.success) {
                const missing = result.missing_invoice_numbers || [];
                if (missing.length) {
                    Toast.error(`未找到发票：${missing.join(', ')}`);
                } else {
                    Toast.error(result.message || '配对失败');
                }
                return;
            }

            Toast.success(result.message || '配对成功');
            await this.loadContracts();
            if (this.pairModalInstance) {
                this.pairModalInstance.hide();
            }
        } catch (error) {
            Toast.error(error.message || '配对失败');
        }
    },

    async uploadContract() {
        const invoiceNumbers = DOM.contractInvoiceNumbersInput?.value?.trim() || '';
        const file = this.selectedFile || DOM.contractFileInput?.files?.[0];
        const tags = DOM.contractTagsInput?.value?.trim() || '';

        if (!file) {
            Toast.error('请选择合同 PDF 文件');
            return;
        }
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            Toast.error('合同仅支持 PDF 格式');
            return;
        }

        try {
            const result = await API.createContract(invoiceNumbers, file, tags);
            if (!result.success) {
                Toast.error(result.message || '上传合同失败');
                return;
            }

            Toast.success(result.message || '合同上传成功');
            this.resetUploadForm();
            await this.loadContracts();
        } catch (error) {
            Toast.error(error.message || '上传合同失败');
        }
    },

    async deleteContract(contractId) {
        if (!contractId) return;
        if (!confirm('确认删除这份合同吗？此操作不可恢复。')) return;

        try {
            const result = await API.deleteContract(contractId);
            if (result.success) {
                Toast.success(result.message || '合同删除成功');
                await this.loadContracts();
            } else {
                Toast.error(result.message || '合同删除失败');
            }
        } catch (error) {
            Toast.error(error.message || '合同删除失败');
        }
    },

    render() {
        if (!DOM.contractTableBody) return;

        let filteredContracts = [...this.contracts];
        if (this.activeTags.size > 0) {
            filteredContracts = filteredContracts.filter((contract) => {
                const tags = contract.contract_tags || [];
                return tags.some((tag) => this.activeTags.has(tag));
            });
        }
        if (this.pairFilter === 'paired') {
            filteredContracts = filteredContracts.filter((contract) => (contract.linked_invoice_count || 0) > 0);
        } else if (this.pairFilter === 'unpaired') {
            filteredContracts = filteredContracts.filter((contract) => (contract.linked_invoice_count || 0) === 0);
        }

        if (!filteredContracts.length) {
            DOM.contractTableBody.innerHTML = `
                <tr>
                    <td colspan=\"8\" class=\"text-center text-muted py-4\">暂无合同数据</td>
                </tr>
            `;
            return;
        }

        DOM.contractTableBody.innerHTML = filteredContracts.map((contract) => `
            <tr>
                <td>
                    <div class=\"fw-semibold\">${(contract.invoice_numbers || []).map((invoiceNumber) => `<span class="badge text-bg-light border me-1 mb-1">${Utils.escapeHtml(invoiceNumber)}</span>`).join('') || '-'}</div>
                    <small class=\"text-muted\">主编号：${contract.invoice_number ? Utils.escapeHtml(contract.invoice_number) : '未关联'}</small>
                </td>
                <td class=\"text-center\">${contract.invoice_count || (contract.invoice_numbers || []).length || 0}</td>
                <td class=\"text-center\">${contract.linked_invoice_count || 0}</td>
                <td>${Utils.escapeHtml(contract.contract_title || '-')}</td>
                <td>${(contract.contract_tags || []).map((tag) => `<span class="contract-tag-badge ${this.getTagColorClass(tag)} me-1 mb-1">${Utils.escapeHtml(tag)}</span>`).join('') || '-'}</td>
                <td>
                    <span class=\"d-inline-block text-truncate\" style=\"max-width: 260px;\" title=\"${Utils.escapeHtml(contract.original_filename || '-')}\">
                        ${Utils.escapeHtml(contract.original_filename || '-')}
                    </span>
                    <small class=\"text-muted d-block\">${Utils.formatFileSize(contract.file_size || 0)}</small>
                </td>
                <td>${Utils.formatDateTime(contract.upload_time)}</td>
                <td class=\"text-center\">
                    <button class=\"btn btn-sm btn-outline-dark contract-detail-btn\" data-contract-id=\"${contract.id}\" title=\"查看详情\">
                        <i class=\"bi bi-eye\"></i>
                    </button>
                    <button class=\"btn btn-sm btn-outline-warning contract-edit-btn\" data-contract-id=\"${contract.id}\" title=\"编辑\">
                        <i class=\"bi bi-pencil-square\"></i>
                    </button>
                    <button class=\"btn btn-sm btn-outline-secondary contract-pair-btn\" data-contract-id=\"${contract.id}\" title=\"配对\">
                        <i class=\"bi bi-link-45deg\"></i>
                    </button>
                    <button class=\"btn btn-sm btn-outline-primary contract-download-btn\" data-contract-id=\"${contract.id}\" title=\"下载\">
                        <i class=\"bi bi-download\"></i>
                    </button>
                    <button class=\"btn btn-sm btn-outline-danger contract-delete-btn\" data-contract-id=\"${contract.id}\" title=\"删除\">
                        <i class=\"bi bi-trash\"></i>
                    </button>
                </td>
            </tr>
        `).join('');
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
        ContractManager.init();
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
        ColumnSettings.init();

        // Load initial data if logged in
        if (isLoggedIn) {
            // 鍔犺浇绛涢€変笅鎷夋鏁版嵁
            await PersonFilter.loadPersons();
            await PersonFilter.loadUploaders();
            this.applyInitialUrlState();
            await this.loadInvoices();
        }

        console.log('Invoice Web App initialized');
    },

    applyInitialUrlState() {
        if (AppState.urlStateInitialized) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        AppState.searchQuery = (params.get('search') || '').trim();
        AppState.focusInvoice = (params.get('focus_invoice') || '').trim();
        AppState.dateFilter.startDate = (params.get('start_date') || '').trim();
        AppState.dateFilter.endDate = (params.get('end_date') || '').trim();
        AppState.personFilter = (params.get('reimbursement_person_id') || '').trim();
        AppState.uploaderFilter = (params.get('uploaded_by') || '').trim();
        AppState.reimbursementStatusFilter = (params.get('reimbursement_status') || '').trim();
        AppState.recordTypeFilter = (params.get('record_type') || '').trim();

        const page = Number.parseInt(params.get('page') || '1', 10);
        const pageSize = Number.parseInt(params.get('page_size') || '', 10);
        AppState.pagination.page = Number.isInteger(page) && page > 0 ? page : 1;
        if (Number.isInteger(pageSize) && pageSize > 0) {
            AppState.pagination.pageSize = pageSize;
        }

        if (DOM.searchInput) DOM.searchInput.value = AppState.searchQuery;
        if (DOM.startDateInput) DOM.startDateInput.value = AppState.dateFilter.startDate;
        if (DOM.endDateInput) DOM.endDateInput.value = AppState.dateFilter.endDate;

        const personSelect = document.getElementById('personFilterSelect');
        const uploaderSelect = document.getElementById('uploaderFilterSelect');
        if (personSelect) personSelect.value = AppState.personFilter;
        if (uploaderSelect) uploaderSelect.value = AppState.uploaderFilter;
        if (DOM.paginationPageSize) DOM.paginationPageSize.value = String(AppState.pagination.pageSize);

        this.setStatusTabFromState();
        this.setRecordTypeRadioFromState();
        AppState.navigationState.focusInvoiceHandled = false;
        AppState.urlStateInitialized = true;
    },

    syncUrlState() {
        if (!isInvoicePage) {
            return;
        }

        const url = new URL(window.location.href);
        const params = new URLSearchParams();

        if (AppState.searchQuery) params.set('search', AppState.searchQuery);
        if (AppState.focusInvoice) params.set('focus_invoice', AppState.focusInvoice);
        if (AppState.dateFilter.startDate) params.set('start_date', AppState.dateFilter.startDate);
        if (AppState.dateFilter.endDate) params.set('end_date', AppState.dateFilter.endDate);
        if (AppState.personFilter) params.set('reimbursement_person_id', AppState.personFilter);
        if (AppState.uploaderFilter) params.set('uploaded_by', AppState.uploaderFilter);
        if (AppState.reimbursementStatusFilter) params.set('reimbursement_status', AppState.reimbursementStatusFilter);
        if (AppState.recordTypeFilter) params.set('record_type', AppState.recordTypeFilter);
        if (AppState.pagination.page > 1) params.set('page', String(AppState.pagination.page));
        if (AppState.pagination.pageSize !== 20) params.set('page_size', String(AppState.pagination.pageSize));

        const nextQuery = params.toString();
        const currentQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
        if (nextQuery === currentQuery) {
            return;
        }

        const nextUrl = nextQuery ? `${url.pathname}?${nextQuery}` : url.pathname;
        window.history.replaceState({}, '', nextUrl);
    },

    setStatusTabFromState() {
        const statusTabs = document.getElementById('statusTabs');
        if (!statusTabs) {
            return;
        }

        const activeTab = AppState.reimbursementStatusFilter
            ? statusTabs.querySelector(`.nav-link[data-status="${AppState.reimbursementStatusFilter}"]`)
            : document.getElementById('tab-all');

        statusTabs.querySelectorAll('.nav-link').forEach((tab) => tab.classList.remove('active'));
        (activeTab || document.getElementById('tab-all'))?.classList.add('active');
    },

    setRecordTypeRadioFromState() {
        const checkedRadio = document.querySelector(`input[name="adminRecordTypeFilter"][value="${AppState.recordTypeFilter}"]`)
            || document.getElementById('admin-filter-all');
        if (checkedRadio) {
            checkedRadio.checked = true;
        }
    },

    openContractWorkspace(invoiceNumber) {
        if (!invoiceNumber) {
            return;
        }
        window.location.href = Utils.buildContractWorkspaceUrl(invoiceNumber);
    },

    async openFocusedInvoiceFromState() {
        if (!AppState.focusInvoice || AppState.navigationState.focusInvoiceHandled) {
            return;
        }

        const focusedInvoice = AppState.invoices.find((invoice) => invoice.invoice_number === AppState.focusInvoice);
        if (!focusedInvoice) {
            return;
        }

        AppState.navigationState.focusInvoiceHandled = true;
        const escapedInvoiceNumber = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(AppState.focusInvoice)
            : AppState.focusInvoice.replace(/"/g, '\\"');
        const focusedRow = DOM.invoiceTableBody?.querySelector(`[data-invoice-number="${escapedInvoiceNumber}"]`);
        focusedRow?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await Modals.showDetail(focusedInvoice);
    },

    bindEvents() {
        // Upload buttons - show upload modal
        DOM.uploadBtn.addEventListener('click', () => Upload.showUploadModal());
        DOM.uploadBtnEmpty.addEventListener('click', () => Upload.showUploadModal());
        DOM.contractManageBtn?.addEventListener('click', async () => {
            if (DOM.contractManagementModal) {
                await ContractManager.openModal();
            }
        });

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
        if (DOM.quickBatchExportBtn) {
            DOM.quickBatchExportBtn.addEventListener('click', () => Export.downloadDocxBatch());
        }
        if (DOM.clearSelectionBtn) {
            DOM.clearSelectionBtn.addEventListener('click', () => InvoiceTable.clearSelection());
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
        const debouncedSearch = Utils.debounce((query) => Search.execute(query, { resetFocus: true }), 300);
        DOM.searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

        // Clear search button
        DOM.clearSearchBtn.addEventListener('click', () => Search.clear());

        // Keyboard shortcuts: "/" focuses search, Esc clears current search input
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const active = document.activeElement;
                const tag = (active?.tagName || '').toLowerCase();
                const isTyping = ['input', 'textarea', 'select'].includes(tag) || active?.isContentEditable;
                if (!isTyping && DOM.searchInput) {
                    e.preventDefault();
                    DOM.searchInput.focus();
                    DOM.searchInput.select();
                }
            }

            if (e.key === 'Escape' && document.activeElement === DOM.searchInput && DOM.searchInput.value) {
                e.preventDefault();
                Search.clear();
            }
        });

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

            // Contract button clicked
            if (e.target.closest('.contract-search-btn')) {
                this.openContractWorkspace(invoice.invoice_number);
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

                // 鏄剧ず鐘舵€侀€夋嫨寮圭獥
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

        [DOM.openInvoiceContractsBtn, DOM.openInvoiceContractsPanelBtn].filter(Boolean).forEach((button) => {
            button.addEventListener('click', () => {
                if (AppState.currentInvoice) {
                    this.openContractWorkspace(AppState.currentInvoice.invoice_number);
                }
            });
        });

        DOM.detailRelatedContracts?.addEventListener('click', (event) => {
            const contractButton = event.target.closest('[data-contract-search]');
            if (contractButton) {
                const invoiceNumber = contractButton.dataset.contractSearch || AppState.currentInvoice?.invoice_number || '';
                if (invoiceNumber) {
                    this.openContractWorkspace(invoiceNumber);
                }
                return;
            }

            const invoiceButton = event.target.closest('[data-open-invoice]');
            if (invoiceButton) {
                const invoiceNumber = invoiceButton.dataset.openInvoice || '';
                if (invoiceNumber) {
                    window.location.href = Utils.buildInvoiceWorkspaceUrl(invoiceNumber);
                }
            }
        });

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
                AppState.pagination.page = 1;

                await this.loadInvoices();
            });
        }

        if (DOM.paginationPrevBtn) {
            DOM.paginationPrevBtn.addEventListener('click', async () => {
                if (AppState.pagination.page <= 1) return;
                AppState.pagination.page -= 1;
                await this.loadInvoices();
            });
        }

        if (DOM.paginationNextBtn) {
            DOM.paginationNextBtn.addEventListener('click', async () => {
                if (AppState.pagination.page >= AppState.pagination.totalPages) return;
                AppState.pagination.page += 1;
                await this.loadInvoices();
            });
        }

        if (DOM.paginationPageSize) {
            DOM.paginationPageSize.addEventListener('change', async (e) => {
                const nextSize = parseInt(e.target.value, 10);
                if (!Number.isInteger(nextSize) || nextSize <= 0) return;
                AppState.pagination.pageSize = nextSize;
                AppState.pagination.page = 1;
                await this.loadInvoices();
            });
        }

        if (DOM.clearAllFiltersBtn) {
            DOM.clearAllFiltersBtn.addEventListener('click', async () => {
                await this.clearAllFilters();
            });
        }
    },

    setTableLoading(loading) {
        if (DOM.tableLoadingMask) {
            DOM.tableLoadingMask.classList.toggle('d-none', !loading);
        }
        if (DOM.paginationPrevBtn) {
            DOM.paginationPrevBtn.disabled = loading || AppState.pagination.page <= 1;
        }
        if (DOM.paginationNextBtn) {
            DOM.paginationNextBtn.disabled = loading || AppState.pagination.page >= AppState.pagination.totalPages;
        }
        if (DOM.paginationPageSize) {
            DOM.paginationPageSize.disabled = loading;
        }
    },

    updateStatusCounts(data) {
        const allCount = data.total_count || 0;
        const pendingCount = data.pending_count || 0;
        const completedCount = data.completed_count || 0;

        const countAll = document.getElementById('countAll');
        const countPending = document.getElementById('countPending');
        const countCompleted = document.getElementById('countCompleted');

        if (countAll) countAll.textContent = allCount;
        if (countPending) countPending.textContent = pendingCount;
        if (countCompleted) countCompleted.textContent = completedCount;
    },

    buildActiveFilters() {
        const filters = [];
        if (AppState.searchQuery) filters.push(`搜索: "${AppState.searchQuery}"`);
        if (AppState.dateFilter.startDate || AppState.dateFilter.endDate) {
            const startDate = AppState.dateFilter.startDate || '*';
            const endDate = AppState.dateFilter.endDate || '*';
            filters.push(`日期: ${startDate} 至 ${endDate}`);
        }
        if (AppState.personFilter) {
            const personSelect = document.getElementById('personFilterSelect');
            const personLabel = personSelect?.selectedOptions?.[0]?.textContent?.trim() || AppState.personFilter;
            filters.push(`报销人: ${personLabel}`);
        }
        if (AppState.uploaderFilter) filters.push(`上传人: ${AppState.uploaderFilter}`);
        if (AppState.reimbursementStatusFilter) filters.push(`报销状态: ${AppState.reimbursementStatusFilter}`);
        if (AppState.recordTypeFilter) filters.push(`记录类型: ${AppState.recordTypeFilter}`);
        return filters;
    },

    updateFilterSummary() {
        if (!DOM.activeFilterBar || !DOM.activeFilterText) return;
        const filters = this.buildActiveFilters();
        if (filters.length === 0) {
            DOM.activeFilterBar.classList.add('d-none');
            DOM.activeFilterText.textContent = '当前没有筛选条件';
            return;
        }
        DOM.activeFilterBar.classList.remove('d-none');
        DOM.activeFilterText.textContent = filters.join(' | ');
    },

    async clearAllFilters() {
        AppState.searchQuery = '';
        AppState.dateFilter.startDate = '';
        AppState.dateFilter.endDate = '';
        AppState.personFilter = '';
        AppState.uploaderFilter = '';
        AppState.reimbursementStatusFilter = '';
        AppState.recordTypeFilter = '';
        AppState.focusInvoice = '';
        AppState.navigationState.focusInvoiceHandled = false;
        AppState.pagination.page = 1;

        if (DOM.searchInput) DOM.searchInput.value = '';
        if (DOM.startDateInput) DOM.startDateInput.value = '';
        if (DOM.endDateInput) DOM.endDateInput.value = '';

        const personSelect = document.getElementById('personFilterSelect');
        const uploaderSelect = document.getElementById('uploaderFilterSelect');
        if (personSelect) personSelect.value = '';
        if (uploaderSelect) uploaderSelect.value = '';

        const allTab = document.getElementById('tab-all');
        const statusTabs = document.getElementById('statusTabs');
        if (allTab && statusTabs) {
            statusTabs.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
            allTab.classList.add('active');
        }

        const recordTypeAll = document.getElementById('admin-filter-all');
        if (recordTypeAll) recordTypeAll.checked = true;

        await this.loadInvoices();
    },

    updatePagination(data) {
        const page = data.page || 1;
        const totalPages = Math.max(data.total_pages || 1, 1);
        const totalCount = data.total_count || 0;
        const pageSize = data.page_size || AppState.pagination.pageSize;

        AppState.pagination.page = page;
        AppState.pagination.totalPages = totalPages;
        AppState.pagination.totalCount = totalCount;
        AppState.pagination.pageSize = pageSize;

        if (DOM.paginationPageSize && DOM.paginationPageSize.value !== String(pageSize)) {
            DOM.paginationPageSize.value = String(pageSize);
        }

        if (DOM.paginationInfo) {
            const startNum = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
            const endNum = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);
            DOM.paginationInfo.textContent = `显示 ${startNum}-${endNum} 条，共 ${totalCount} 条，第 ${page}/${totalPages} 页`;
        }
        if (DOM.paginationPrevBtn) DOM.paginationPrevBtn.disabled = page <= 1;
        if (DOM.paginationNextBtn) DOM.paginationNextBtn.disabled = page >= totalPages;
    },

    async loadInvoices() {
        const requestId = ++AppState.requestState.seq;
        AppState.requestState.active = requestId;
        this.setTableLoading(true);

        try {
            const { startDate, endDate } = AppState.dateFilter;
            const page = AppState.pagination.page;
            const pageSize = AppState.pagination.pageSize;

            const allData = await API.getInvoices(
                AppState.searchQuery,
                startDate,
                endDate,
                AppState.personFilter,
                AppState.uploaderFilter,
                '',
                AppState.recordTypeFilter,
                1,
                1
            );
            if (requestId !== AppState.requestState.active) return;

            this.updateStatusCounts(allData);

            const data = await API.getInvoices(
                AppState.searchQuery,
                startDate,
                endDate,
                AppState.personFilter,
                AppState.uploaderFilter,
                AppState.reimbursementStatusFilter,
                AppState.recordTypeFilter,
                page,
                pageSize
            );
            if (requestId !== AppState.requestState.active) return;

            if ((data.total_pages || 0) > 0 && page > data.total_pages) {
                AppState.pagination.page = data.total_pages;
                await this.loadInvoices();
                return;
            }

            InvoiceTable.render(data.invoices);
            Statistics.update(
                allData.total_count,
                allData.total_amount,
                allData.invoice_count,
                allData.manual_count,
                allData.invoice_amount,
                allData.manual_amount
            );
            this.updatePagination(data);
            this.updateFilterSummary();
            this.syncUrlState();
            await this.openFocusedInvoiceFromState();
        } catch (error) {
            if (error.message !== '需要登录') {
                Toast.error('加载发票列表失败: ' + error.message);
            }
            InvoiceTable.render([]);
            Statistics.update(0, 0, 0, 0, '0', '0');
            this.updateStatusCounts({ total_count: 0, pending_count: 0, completed_count: 0 });
            this.updatePagination({ page: 1, total_pages: 1, total_count: 0, page_size: AppState.pagination.pageSize });
            this.updateFilterSummary();
        } finally {
            if (requestId === AppState.requestState.active) {
                this.setTableLoading(false);
            }
        }
    }
};

const ContractPage = {
    async init() {
        Auth.init();
        UserManagement.init();
        ContractManager.init();

        const isLoggedIn = await Auth.checkAuth();
        if (!isLoggedIn) {
            Auth.showLoginModal();
        }

        this.bindEvents();

        if (isLoggedIn) {
            await ContractManager.loadContracts();
        }
    },

    bindEvents() {
        if (DOM.loginForm) {
            DOM.loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = DOM.loginUsername.value.trim();
                const password = DOM.loginPassword.value;
                await Auth.login(username, password);
            });
        }

        if (DOM.logoutBtn) {
            DOM.logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                Auth.logout();
            });
        }

        const userManagementBtn = document.getElementById('userManagementBtn');
        if (userManagementBtn) {
            userManagementBtn.addEventListener('click', (e) => {
                e.preventDefault();
                UserManagement.showModal();
            });
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
                    dimInfo.textContent = `${Math.round(this.pdfWidth)} x ${Math.round(this.pdfHeight)} px`;
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
        const name = prompt('请输入签章模板名称', file.name.split('.')[0]);
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

        if (!confirm('确认删除该签章模板吗？')) return;

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
            Toast.error('仅支持 PNG、JPG、JPEG 格式图片');
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
                Toast.warning('请先上传签章文件或选择签章模板');
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
            Toast.warning('当前没有可删除的签章');
            return;
        }

        if (!confirm('确认删除该签章吗？')) return;

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
                Toast.success(`报销状态已更新为 "${newStatus}"`);

                if (this.modalInstance) {
                    this.modalInstance.hide();
                }

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

                const invoiceIndex = AppState.invoices.findIndex(
                    inv => inv.invoice_number === this.currentInvoiceNumber
                );
                if (invoiceIndex !== -1) {
                    AppState.invoices[invoiceIndex].reimbursement_status = newStatus;
                }

                await App.loadInvoices();
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
    if (isContractPage) {
        ContractPage.init();
        return;
    }
    if (isUscoaPage) {
        return;
    }
    App.init();
    SignatureManager.init();
    ReimbursementStatusManager.init();
});
