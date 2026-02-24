/**
 * User Portal JavaScript
 * 用户端前端逻辑
 */

const USER_API_BASE = '/user/api';
const PREFERENCE_API_BASE = '/api';

async function getUserPreference(prefKey) {
    const response = await fetch(`${PREFERENCE_API_BASE}/user/preferences/${encodeURIComponent(prefKey)}`);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Failed to get user preference');
    }
    return data;
}

async function setUserPreference(prefKey, value) {
    const response = await fetch(`${PREFERENCE_API_BASE}/user/preferences/${encodeURIComponent(prefKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Failed to save user preference');
    }
    return data;
}

// Utility Functions
function showMessage(message, type = 'info') {
    const container = document.getElementById('flash-messages');
    if (!container) return;

    const alertClass = type === 'error' ? 'alert-danger' :
        type === 'success' ? 'alert-success' : 'alert-info';

    const alert = document.createElement('div');
    alert.className = `alert ${alertClass} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    container.appendChild(alert);

    setTimeout(() => alert.remove(), 5000);
}

function formatAmount(amount) {
    return '¥' + parseFloat(amount).toFixed(2);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
}

// Initialize based on current page
document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;

    if (path === '/user/login') {
        initLoginPage();
    } else if (path === '/user/' || path === '/user') {
        initUploadPage();
    } else if (path === '/user/invoices') {
        initInvoicesPage();
    } else if (path.startsWith('/user/invoices/')) {
        initDetailPage();
    }

    // Setup logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});

// Logout Handler
async function handleLogout(e) {
    e.preventDefault();
    try {
        const response = await fetch(`${USER_API_BASE}/logout`, { method: 'POST' });
        if (response.ok) {
            window.location.href = '/user/login';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ========== Mode Selector ==========
function initModeSelector() {
    const pdfModeBtn = document.getElementById('pdf-mode-btn');
    const manualModeBtn = document.getElementById('manual-mode-btn');
    const uploadArea = document.getElementById('upload-area');
    const manualEntryArea = document.getElementById('manual-entry-area');

    if (!pdfModeBtn || !manualModeBtn || !uploadArea || !manualEntryArea) return;

    // Handle PDF mode button click
    pdfModeBtn.addEventListener('click', function () {
        // Remove active class from both buttons
        pdfModeBtn.classList.add('active');
        manualModeBtn.classList.remove('active');

        // Show PDF upload area, hide manual entry area
        uploadArea.classList.remove('d-none');
        manualEntryArea.style.display = 'none';
    });

    // Handle manual mode button click
    manualModeBtn.addEventListener('click', function () {
        // Remove active class from both buttons
        manualModeBtn.classList.add('active');
        pdfModeBtn.classList.remove('active');

        // Hide PDF upload area, show manual entry area
        uploadArea.classList.add('d-none');
        manualEntryArea.style.display = 'block';
    });
}

// ========== Manual Entry Form ==========
function initManualEntryForm() {
    const form = document.getElementById('manual-entry-form');
    const dateInput = document.getElementById('manual-invoice-date');
    const voucherInput = document.getElementById('manual-voucher-files');
    const voucherPreview = document.getElementById('manual-voucher-preview');
    const addPersonBtn = document.getElementById('manual-add-person-btn');

    if (!form) return;

    // Set default date to today
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }

    // Handle voucher file preview
    if (voucherInput && voucherPreview) {
        voucherInput.addEventListener('change', function (e) {
            voucherPreview.innerHTML = '';
            const files = Array.from(e.target.files);

            files.forEach((file, index) => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        const previewItem = document.createElement('div');
                        previewItem.className = 'voucher-preview-item';
                        previewItem.innerHTML = `
                            <img src="${e.target.result}" alt="凭证预览">
                            <button type="button" class="remove-preview-btn" data-index="${index}">
                                <i class="bi bi-x"></i>
                            </button>
                        `;
                        voucherPreview.appendChild(previewItem);
                    };
                    reader.readAsDataURL(file);
                }
            });
        });

        // Handle remove preview button
        voucherPreview.addEventListener('click', function (e) {
            const removeBtn = e.target.closest('.remove-preview-btn');
            if (removeBtn) {
                const index = parseInt(removeBtn.dataset.index);
                const dt = new DataTransfer();
                const files = Array.from(voucherInput.files);

                files.forEach((file, i) => {
                    if (i !== index) {
                        dt.items.add(file);
                    }
                });

                voucherInput.files = dt.files;
                voucherInput.dispatchEvent(new Event('change'));
            }
        });
    }

    // Handle add person button
    if (addPersonBtn) {
        addPersonBtn.addEventListener('click', () => {
            new bootstrap.Modal(document.getElementById('addPersonModal')).show();
        });
    }

    // Handle form submission
    form.addEventListener('submit', handleManualFormSubmit);

    // Handle form reset
    form.addEventListener('reset', () => {
        // Clear validation errors
        clearManualFormErrors();
        // Reset voucher preview
        if (voucherPreview) {
            voucherPreview.innerHTML = '';
        }
        // Reset date to today
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }
    });

    // Update person select for manual form
    updateManualPersonSelect();
}

async function handleManualFormSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Clear previous errors
    clearManualFormErrors();

    // Get form data
    const itemName = document.getElementById('manual-item-name').value.trim();
    const amount = document.getElementById('manual-amount').value.trim();
    const invoiceDate = document.getElementById('manual-invoice-date').value.trim();
    const remark = document.getElementById('manual-remark').value.trim();
    const reimbursementPersonId = document.getElementById('manual-reimbursement-person').value;
    const voucherFiles = document.getElementById('manual-voucher-files').files;

    // Client-side validation
    let hasErrors = false;

    if (!itemName) {
        showFieldError('manual-item-name', '费用项目名称不能为空');
        hasErrors = true;
    }

    if (!amount) {
        showFieldError('manual-amount', '金额不能为空');
        hasErrors = true;
    } else {
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            showFieldError('manual-amount', '金额必须大于0');
            hasErrors = true;
        }
    }

    if (!invoiceDate) {
        showFieldError('manual-invoice-date', '日期不能为空');
        hasErrors = true;
    }

    if (hasErrors) {
        return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...';

    try {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('item_name', itemName);
        formData.append('amount', amount);
        formData.append('invoice_date', invoiceDate);
        formData.append('remark', remark);

        if (reimbursementPersonId) {
            formData.append('reimbursement_person_id', reimbursementPersonId);
        }

        // Add voucher files
        if (voucherFiles.length > 0) {
            // Validate file formats
            for (let i = 0; i < voucherFiles.length; i++) {
                const file = voucherFiles[i];
                if (!file.type.match(/^image\/(jpeg|png)$/)) {
                    showMessage(`文件 ${file.name} 格式不支持，仅支持JPG、PNG格式`, 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                    return;
                }
                formData.append('voucher_files[]', file);
            }
        }

        // Submit to API
        const response = await fetch(`${USER_API_BASE}/create-manual`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Success
            showMessage('手动记录创建成功！', 'success');

            // Reset form
            form.reset();
            clearManualFormErrors();
            document.getElementById('manual-voucher-preview').innerHTML = '';

            // Reset date to today
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('manual-invoice-date').value = today;

            // Optionally redirect to invoices page after a delay
            setTimeout(() => {
                window.location.href = '/user/invoices';
            }, 1500);

        } else if (data.is_duplicate_warning) {
            // Handle duplicate warning
            handleDuplicateWarning(data, formData);
        } else {
            // Handle validation errors
            if (data.errors) {
                Object.keys(data.errors).forEach(field => {
                    const fieldId = `manual-${field.replace('_', '-')}`;
                    showFieldError(fieldId, data.errors[field]);
                });
            } else {
                showMessage(data.message || '创建失败，请重试', 'error');
            }
        }

    } catch (error) {
        console.error('Submit error:', error);
        showMessage('网络错误，请重试', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

function handleDuplicateWarning(data, formData) {
    const similar = data.similar_record;

    // Format the similar record information
    const scanTime = similar.scan_time ? new Date(similar.scan_time).toLocaleString('zh-CN') : '未知';
    const personName = similar.reimbursement_person_name || '未指定';

    const message = `
        <div class="alert alert-warning">
            <h6 class="alert-heading"><i class="bi bi-exclamation-triangle me-2"></i>检测到相似的报销记录</h6>
            <hr>
            <p class="mb-2"><strong>记录号：</strong>${similar.invoice_number}</p>
            <p class="mb-2"><strong>项目名称：</strong>${similar.item_name}</p>
            <p class="mb-2"><strong>金额：</strong>${formatAmount(similar.amount)}</p>
            <p class="mb-2"><strong>日期：</strong>${similar.invoice_date}</p>
            <p class="mb-2"><strong>报销人：</strong>${personName}</p>
            <p class="mb-2"><strong>上传时间：</strong>${scanTime}</p>
            ${similar.remark ? `<p class="mb-2"><strong>备注：</strong>${similar.remark}</p>` : ''}
            <hr>
            <p class="mb-0">是否仍要创建此记录？</p>
        </div>
    `;

    // Show confirmation dialog
    if (confirm(data.message + '\n\n' +
        `记录号：${similar.invoice_number}\n` +
        `项目名称：${similar.item_name}\n` +
        `金额：¥${similar.amount}\n` +
        `日期：${similar.invoice_date}\n` +
        `报销人：${personName}\n` +
        `上传时间：${scanTime}\n\n` +
        '是否仍要创建此记录？')) {

        // User chose to proceed, add force_create flag
        formData.append('force_create', 'true');

        // Resubmit
        submitManualFormWithForce(formData);
    }
}

async function submitManualFormWithForce(formData) {
    const form = document.getElementById('manual-entry-form');
    const submitBtn = form.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...';

    try {
        const response = await fetch(`${USER_API_BASE}/create-manual`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage('手动记录创建成功！', 'success');

            // Reset form
            form.reset();
            clearManualFormErrors();
            document.getElementById('manual-voucher-preview').innerHTML = '';

            // Reset date to today
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('manual-invoice-date').value = today;

            // Redirect to invoices page
            setTimeout(() => {
                window.location.href = '/user/invoices';
            }, 1500);
        } else {
            showMessage(data.message || '创建失败，请重试', 'error');
        }
    } catch (error) {
        console.error('Submit error:', error);
        showMessage('网络错误，请重试', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorDiv = document.getElementById(`${fieldId}-error`);

    if (field) {
        field.classList.add('is-invalid');
    }

    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function clearManualFormErrors() {
    const fields = ['manual-item-name', 'manual-amount', 'manual-invoice-date'];

    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        const errorDiv = document.getElementById(`${fieldId}-error`);

        if (field) {
            field.classList.remove('is-invalid');
        }

        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
    });
}

function updateManualPersonSelect() {
    const select = document.getElementById('manual-reimbursement-person');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">请选择</option>';

    cachedPersons.forEach(person => {
        const option = document.createElement('option');
        option.value = person.id;
        option.textContent = person.name;
        select.appendChild(option);
    });

    if (currentValue) {
        select.value = currentValue;
    }
}

// ========== Login Page ==========
function initLoginPage() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');
        const errorText = document.getElementById('login-error-text');
        const btn = document.getElementById('login-btn');

        btn.disabled = true;
        btn.querySelector('.btn-text').classList.add('d-none');
        btn.querySelector('.spinner-border').classList.remove('d-none');
        btn.querySelector('.loading-text').classList.remove('d-none');
        errorDiv.classList.add('d-none');

        try {
            const response = await fetch(`${USER_API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                window.location.href = '/user/';
            } else {
                errorText.textContent = data.message || '登录失败';
                errorDiv.classList.remove('d-none');
            }
        } catch (error) {
            errorText.textContent = '网络错误，请重试';
            errorDiv.classList.remove('d-none');
        } finally {
            btn.disabled = false;
            btn.querySelector('.btn-text').classList.remove('d-none');
            btn.querySelector('.spinner-border').classList.add('d-none');
            btn.querySelector('.loading-text').classList.add('d-none');
        }
    });
}


// ========== Upload Page with Draft List ==========
let draftInvoices = [];
let cachedPersons = [];
let currentEditIndex = -1;
let editVoucherFiles = [];
let editContractFile = null;

// 大额发票金额阈值
const LARGE_INVOICE_THRESHOLD = 10000;

// LocalStorage key for draft invoices
const DRAFT_STORAGE_KEY = 'invoice_drafts';

// 保存暂存发票到 localStorage（只保存发票信息，不保存文件）
function saveDraftsToStorage() {
    const draftsToSave = draftInvoices.map(d => ({
        invoice: d.invoice,
        personId: d.personId,
        personName: d.personName,
        // 文件无法序列化，只保存文件名
        pdfFileName: d.pdfFile?.name || '',
        voucherFileNames: d.voucherFiles.map(f => f.name),
        contractFileName: d.contractFile?.name || '',
        selected: d.selected,
        // 标记是否有文件（用于显示警告）
        hasPdfFile: !!d.pdfFile,
        hasVoucherFiles: d.voucherFiles.length > 0,
        hasContractFile: !!d.contractFile
    }));
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftsToSave));
}

// 从 localStorage 加载暂存发票
function loadDraftsFromStorage() {
    try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (saved) {
            const drafts = JSON.parse(saved);
            // 恢复暂存发票（文件需要重新上传）
            draftInvoices = drafts.map(d => ({
                invoice: d.invoice,
                personId: d.personId,
                personName: d.personName,
                pdfFile: null, // 文件无法恢复
                voucherFiles: [],
                contractFile: null,
                selected: false,
                // 保存原始文件信息用于显示
                _pdfFileName: d.pdfFileName,
                _needsReupload: true // 标记需要重新上传PDF
            }));
            return draftInvoices.length > 0;
        }
    } catch (e) {
        console.error('加载暂存发票失败:', e);
    }
    return false;
}

// 清除 localStorage 中的暂存发票
function clearDraftsFromStorage() {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
}

function initUploadPage() {
    const dropZone = document.getElementById('drop-zone');
    const pdfInput = document.getElementById('pdf-input');

    if (!dropZone || !pdfInput) return;

    // Initialize mode selector
    initModeSelector();

    // Initialize manual entry form
    initManualEntryForm();

    loadPersons();

    // 加载保存的暂存发票
    if (loadDraftsFromStorage()) {
        renderDraftList();
    }

    dropZone.addEventListener('click', () => pdfInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handlePdfFiles(e.dataTransfer.files);
    });
    pdfInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePdfFiles(e.target.files);
        }
    });

    document.getElementById('clear-all-drafts-btn')?.addEventListener('click', clearAllDrafts);
    document.getElementById('submit-all-btn')?.addEventListener('click', submitAllDrafts);
    document.getElementById('submit-selected-btn')?.addEventListener('click', submitSelectedDrafts);
    document.getElementById('select-all-drafts')?.addEventListener('change', toggleSelectAll);

    initEditModal();

    document.getElementById('save-person-btn')?.addEventListener('click', handleSavePerson);
    document.getElementById('edit-add-person-btn')?.addEventListener('click', () => {
        new bootstrap.Modal(document.getElementById('addPersonModal')).show();
    });
}

async function loadPersons() {
    try {
        const response = await fetch(`${USER_API_BASE}/persons`);
        const data = await response.json();
        cachedPersons = data.persons || [];
        updatePersonSelects();
    } catch (error) {
        console.error('Load persons error:', error);
    }
}

function updatePersonSelects() {
    const select = document.getElementById('edit-person-select');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- 选择报销人 --</option>';
    cachedPersons.forEach(person => {
        const option = document.createElement('option');
        option.value = person.id;
        option.textContent = person.name;
        select.appendChild(option);
    });
    if (currentValue) select.value = currentValue;

    // Also update manual form person select
    updateManualPersonSelect();
}

async function handlePdfFiles(files) {
    const loading = document.getElementById('upload-loading');
    const dropZone = document.getElementById('drop-zone');

    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
        showMessage('请选择PDF文件', 'error');
        return;
    }

    dropZone.classList.add('d-none');
    loading.classList.remove('d-none');

    for (const file of pdfFiles) {
        await parsePdfFile(file);
    }

    loading.classList.add('d-none');
    dropZone.classList.remove('d-none');
    document.getElementById('pdf-input').value = '';

    renderDraftList();
}

async function parsePdfFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${USER_API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            draftInvoices.push({
                invoice: data.invoice,
                pdfFile: file,
                personId: null,
                personName: '',
                voucherFiles: [],
                selected: false
            });
            saveDraftsToStorage();
        } else if (data.is_duplicate && data.existing_invoice) {
            // 显示重复发票的详细信息
            const existing = data.existing_invoice;
            const uploadTime = existing.scan_time ? new Date(existing.scan_time).toLocaleString('zh-CN') : '未知';
            const personName = existing.reimbursement_person_name || '未指定';
            showMessage(
                `${file.name}: 发票号码 ${existing.invoice_number} 已存在，报销人: "${personName}"，上传时间: ${uploadTime}`,
                'error'
            );
        } else {
            showMessage(`${file.name}: ${data.message}`, 'error');
        }
    } catch (error) {
        showMessage(`${file.name}: 解析失败`, 'error');
    }
}

function renderDraftList() {
    const card = document.getElementById('draft-list-card');
    const tbody = document.getElementById('draft-list-body');
    const countBadge = document.getElementById('draft-count');

    if (draftInvoices.length === 0) {
        card.classList.add('d-none');
        clearDraftsFromStorage();
        return;
    }

    card.classList.remove('d-none');
    countBadge.textContent = draftInvoices.length;

    tbody.innerHTML = '';
    draftInvoices.forEach((draft, index) => {
        const amount = parseFloat(draft.invoice.amount || 0);
        const isLargeInvoice = amount > LARGE_INVOICE_THRESHOLD;
        const hasContract = !!draft.contractFile;
        const needsContract = isLargeInvoice && !hasContract;
        const needsReupload = draft._needsReupload && !draft.pdfFile;

        const tr = document.createElement('tr');
        if (needsReupload) {
            tr.classList.add('table-danger');
        } else if (needsContract) {
            tr.classList.add('table-warning');
        }

        let amountHtml = `<span class="text-success fw-bold">${formatAmount(draft.invoice.amount)}</span>`;
        if (isLargeInvoice) {
            amountHtml += hasContract ?
                ' <i class="bi bi-file-earmark-check text-success" title="已上传合同"></i>' :
                ' <i class="bi bi-exclamation-triangle text-danger" title="需要上传合同"></i>';
        }

        // 状态列
        let statusHtml = '';
        if (needsReupload) {
            statusHtml = '<span class="badge bg-danger" title="刷新后需重新上传PDF"><i class="bi bi-exclamation-circle"></i> 需重传</span>';
        } else {
            statusHtml = '<span class="badge bg-success"><i class="bi bi-check"></i> 就绪</span>';
        }

        tr.innerHTML = `
            <td><input type="checkbox" class="form-check-input draft-checkbox" data-index="${index}" ${draft.selected ? 'checked' : ''} ${needsReupload ? 'disabled' : ''}></td>
            <td>${draft.invoice.invoice_number}</td>
            <td>${draft.invoice.invoice_date || '-'}</td>
            <td>${draft.invoice.item_name || '-'}</td>
            <td class="text-end">${amountHtml}</td>
            <td>${draft.personName || '-'}</td>
            <td class="text-center"><span class="badge bg-secondary">${draft.voucherFiles.length}</span></td>
            <td class="text-center">${statusHtml}</td>
            <td class="text-center">
                ${needsReupload ?
                `<button class="btn btn-sm btn-warning me-1 reupload-draft-btn" data-index="${index}" title="重新上传PDF"><i class="bi bi-upload"></i></button>` :
                `<button class="btn btn-sm btn-outline-primary me-1 edit-draft-btn" data-index="${index}"><i class="bi bi-pencil"></i></button>`
            }
                <button class="btn btn-sm btn-outline-danger remove-draft-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.draft-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            draftInvoices[parseInt(e.target.dataset.index)].selected = e.target.checked;
            saveDraftsToStorage();
            updateSelectionSummary();
        });
    });

    tbody.querySelectorAll('.edit-draft-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openEditModal(parseInt(e.target.closest('button').dataset.index)));
    });

    tbody.querySelectorAll('.remove-draft-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            draftInvoices.splice(parseInt(e.target.closest('button').dataset.index), 1);
            saveDraftsToStorage();
            renderDraftList();
        });
    });

    // 重新上传按钮
    tbody.querySelectorAll('.reupload-draft-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('button').dataset.index);
            showReuploadDialog(index);
        });
    });

    updateSelectionSummary();
}


function toggleSelectAll(e) {
    draftInvoices.forEach(d => d.selected = e.target.checked);
    renderDraftList();
}

function updateSelectionSummary() {
    const selected = draftInvoices.filter(d => d.selected);
    document.getElementById('selected-count').textContent = selected.length;
    document.getElementById('selected-amount').textContent = formatAmount(selected.reduce((sum, d) => sum + parseFloat(d.invoice.amount || 0), 0));
    document.getElementById('submit-selected-btn').disabled = selected.length === 0;

    const selectAll = document.getElementById('select-all-drafts');
    if (selectAll && draftInvoices.length > 0) {
        selectAll.checked = selected.length === draftInvoices.length;
        selectAll.indeterminate = selected.length > 0 && selected.length < draftInvoices.length;
    }
}

function clearAllDrafts() {
    if (confirm('确定要清空所有暂存发票吗？')) {
        draftInvoices = [];
        clearDraftsFromStorage();
        renderDraftList();
    }
}

// 显示重新上传对话框
function showReuploadDialog(index) {
    const draft = draftInvoices[index];
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 验证文件是否匹配（通过重新解析）
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${USER_API_BASE}/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.success) {
                // 检查发票号码是否匹配
                if (data.invoice.invoice_number === draft.invoice.invoice_number) {
                    draft.pdfFile = file;
                    draft._needsReupload = false;
                    saveDraftsToStorage();
                    renderDraftList();
                    showMessage('PDF文件已重新上传', 'success');
                } else {
                    showMessage(`发票号码不匹配：期望 ${draft.invoice.invoice_number}，实际 ${data.invoice.invoice_number}`, 'error');
                }
            } else if (data.is_duplicate) {
                // 重复发票也可以接受（因为是重新上传同一张）
                draft.pdfFile = file;
                draft._needsReupload = false;
                saveDraftsToStorage();
                renderDraftList();
                showMessage('PDF文件已重新上传', 'success');
            } else {
                showMessage(data.message, 'error');
            }
        } catch (error) {
            showMessage('上传失败: ' + error.message, 'error');
        }
    };
    input.click();
}

function initEditModal() {
    const voucherInput = document.getElementById('edit-voucher-input');
    const voucherDropZone = document.getElementById('edit-voucher-drop-zone');

    if (voucherDropZone && voucherInput) {
        voucherDropZone.addEventListener('click', () => voucherInput.click());
        voucherDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            voucherDropZone.style.borderColor = '#0d6efd';
        });
        voucherDropZone.addEventListener('dragleave', () => voucherDropZone.style.borderColor = '#dee2e6');
        voucherDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            voucherDropZone.style.borderColor = '#dee2e6';
            handleEditVoucherFiles(e.dataTransfer.files);
        });
        voucherInput.addEventListener('change', (e) => handleEditVoucherFiles(e.target.files));
    }

    // 合同上传
    const contractInput = document.getElementById('edit-contract-input');
    const contractDropZone = document.getElementById('edit-contract-drop-zone');

    if (contractDropZone && contractInput) {
        contractDropZone.addEventListener('click', () => contractInput.click());
        contractDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            contractDropZone.style.borderColor = '#b02a37';
        });
        contractDropZone.addEventListener('dragleave', () => contractDropZone.style.borderColor = '#dc3545');
        contractDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            contractDropZone.style.borderColor = '#dc3545';
            handleEditContractFile(e.dataTransfer.files[0]);
        });
        contractInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleEditContractFile(e.target.files[0]);
            }
        });
    }

    document.getElementById('remove-contract-btn')?.addEventListener('click', () => {
        editContractFile = null;
        updateContractFileInfo();
    });

    document.getElementById('save-draft-btn')?.addEventListener('click', saveDraftEdit);
}

function handleEditContractFile(file) {
    if (!file) return;
    const allowedTypes = ['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/png'];
    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExts = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];

    if (!allowedExts.includes(ext)) {
        showMessage('仅支持PDF、DOC、DOCX、JPG、PNG格式文件', 'error');
        return;
    }
    editContractFile = file;
    updateContractFileInfo();
}

function updateContractFileInfo() {
    const fileInfo = document.getElementById('edit-contract-file-info');
    const filename = document.getElementById('edit-contract-filename');
    const dropZone = document.getElementById('edit-contract-drop-zone');

    if (editContractFile) {
        fileInfo?.classList.remove('d-none');
        dropZone?.classList.add('d-none');
        if (filename) filename.textContent = editContractFile.name;
    } else {
        fileInfo?.classList.add('d-none');
        dropZone?.classList.remove('d-none');
    }
}

function openEditModal(index) {
    currentEditIndex = index;
    const draft = draftInvoices[index];
    editVoucherFiles = [...draft.voucherFiles];
    editContractFile = draft.contractFile || null;

    document.getElementById('edit-invoice-number').value = draft.invoice.invoice_number;
    document.getElementById('edit-invoice-date').value = draft.invoice.invoice_date || '';
    document.getElementById('edit-item-name').value = draft.invoice.item_name || '';
    document.getElementById('edit-amount').value = formatAmount(draft.invoice.amount);

    updatePersonSelects();
    document.getElementById('edit-person-select').value = draft.personId || '';

    // 显示/隐藏合同上传区域（大额发票）
    const contractSection = document.getElementById('contract-upload-section');
    const amount = parseFloat(draft.invoice.amount || 0);
    if (amount > LARGE_INVOICE_THRESHOLD) {
        contractSection?.classList.remove('d-none');
    } else {
        contractSection?.classList.add('d-none');
    }
    updateContractFileInfo();

    renderEditVoucherThumbnails();
    new bootstrap.Modal(document.getElementById('editDraftModal')).show();
}

function handleEditVoucherFiles(files) {
    Array.from(files).forEach(file => {
        if (!file.type.match(/^image\/(jpeg|png)$/)) {
            showMessage('仅支持JPG、PNG格式图片', 'error');
            return;
        }
        editVoucherFiles.push(file);
    });
    renderEditVoucherThumbnails();
}

function renderEditVoucherThumbnails() {
    const container = document.getElementById('edit-voucher-thumbnails');
    container.innerHTML = '';

    editVoucherFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'voucher-thumbnail';

        const reader = new FileReader();
        reader.onload = (e) => {
            div.innerHTML = `<img src="${e.target.result}" alt="凭证"><button class="remove-btn" data-index="${index}">&times;</button>`;
            div.querySelector('.remove-btn').addEventListener('click', () => {
                editVoucherFiles.splice(index, 1);
                renderEditVoucherThumbnails();
            });
        };
        reader.readAsDataURL(file);
        container.appendChild(div);
    });
}

function saveDraftEdit() {
    if (currentEditIndex < 0) return;

    const draft = draftInvoices[currentEditIndex];
    const amount = parseFloat(draft.invoice.amount || 0);

    // 验证大额发票必须有合同
    if (amount > LARGE_INVOICE_THRESHOLD && !editContractFile) {
        showMessage(`金额超过${LARGE_INVOICE_THRESHOLD}元的大额发票必须上传合同`, 'error');
        return;
    }

    const personSelect = document.getElementById('edit-person-select');
    draft.personId = personSelect.value || null;
    draft.personName = personSelect.value ? personSelect.options[personSelect.selectedIndex]?.text : '';
    draft.voucherFiles = [...editVoucherFiles];
    draft.contractFile = editContractFile;

    bootstrap.Modal.getInstance(document.getElementById('editDraftModal')).hide();
    saveDraftsToStorage();
    renderDraftList();
}

async function submitAllDrafts() {
    if (draftInvoices.length === 0) return;
    await submitDrafts(draftInvoices);
}

async function submitSelectedDrafts() {
    const selected = draftInvoices.filter(d => d.selected);
    if (selected.length === 0) return;
    await submitDrafts(selected);
}

async function submitDrafts(draftsToSubmit) {
    const progressModalEl = document.getElementById('submitProgressModal');
    const progressBar = document.getElementById('submit-progress-bar');
    const progressText = document.getElementById('submit-progress-text');

    // 预检查大额发票是否有合同
    for (const draft of draftsToSubmit) {
        const amount = parseFloat(draft.invoice.amount || 0);
        if (amount > LARGE_INVOICE_THRESHOLD && !draft.contractFile) {
            showMessage(`发票 ${draft.invoice.invoice_number} 金额超过${LARGE_INVOICE_THRESHOLD}元，请先上传合同`, 'error');
            return;
        }
    }

    // 重置进度条
    progressBar.style.width = '0%';
    progressText.textContent = '准备提交...';

    // 显示模态框
    const progressModal = new bootstrap.Modal(progressModalEl);
    progressModal.show();

    let successCount = 0, failCount = 0;
    const total = draftsToSubmit.length;

    try {
        for (let i = 0; i < total; i++) {
            const draft = draftsToSubmit[i];
            progressText.textContent = `正在提交 ${i + 1}/${total}: ${draft.invoice.invoice_number}`;
            progressBar.style.width = `${((i + 1) / total) * 100}%`;

            try {
                const formData = new FormData();
                formData.append('invoice_data', JSON.stringify(draft.invoice));
                formData.append('pdf_file', draft.pdfFile);
                if (draft.personId) formData.append('reimbursement_person_id', draft.personId);
                draft.voucherFiles.forEach(file => formData.append('voucher_files[]', file));
                if (draft.contractFile) formData.append('contract_file', draft.contractFile);

                const response = await fetch(`${USER_API_BASE}/confirm`, { method: 'POST', body: formData });
                const data = await response.json();

                if (data.success) {
                    successCount++;
                    const idx = draftInvoices.indexOf(draft);
                    if (idx > -1) draftInvoices.splice(idx, 1);
                } else {
                    failCount++;
                    showMessage(`${draft.invoice.invoice_number}: ${data.message}`, 'error');
                }
            } catch (error) {
                failCount++;
                showMessage(`${draft.invoice.invoice_number}: 提交失败`, 'error');
            }
        }
    } finally {
        // 确保模态框被关闭
        progressModal.hide();

        // 移除模态框背景（以防万一）
        setTimeout(() => {
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
        }, 300);
    }

    saveDraftsToStorage();
    renderDraftList();

    if (successCount > 0) {
        showMessage(`成功提交 ${successCount} 张发票${failCount > 0 ? `，失败 ${failCount} 张` : ''}`, failCount > 0 ? 'warning' : 'success');
    }
}

async function handleSavePerson() {
    const name = document.getElementById('new-person-name').value.trim();
    if (!name) {
        showMessage('请输入报销人姓名', 'error');
        return;
    }

    try {
        const response = await fetch(`${USER_API_BASE}/persons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const data = await response.json();

        if (data.success) {
            cachedPersons.push(data.person);
            updatePersonSelects();
            document.getElementById('edit-person-select').value = data.person.id;
            bootstrap.Modal.getInstance(document.getElementById('addPersonModal')).hide();
            document.getElementById('new-person-name').value = '';
            showMessage('报销人创建成功', 'success');
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('创建失败，请重试', 'error');
    }
}


// ========== Invoices Page ==========
let allInvoices = []; // Current page invoices
let currentStatusFilter = '';
let currentRecordTypeFilter = '';
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 20;
const UserInvoiceColumnSettings = {
    visibilityStorageKey: 'user_invoice_column_visibility_v1',
    orderStorageKey: 'user_invoice_column_order_v1',
    widthStorageKey: 'user_invoice_column_width_v1',
    serverPreferenceKey: 'user_invoice_column_layout',
    syncDebounceMs: 800,
    defaults: {
        invoice_number: true,
        invoice_date: true,
        item_name: true,
        amount: true,
        scan_time: true,
        record_type: true,
        reimbursement_status: true,
        voucher: true
    },
    visibility: {},
    order: [],
    widths: {},
    draggingColumn: null,
    isResizing: false,
    headerInteractionsBound: false,
    syncTimer: null,

    init() {
        this.visibility = { ...this.defaults, ...this.loadVisibility() };
        this.order = this.loadOrder();
        this.widths = this.loadWidths();
        this.normalizeState();
        this.bindEvents();
        this.applyToTable();
        this.initHeaderInteractions();
        this.syncMenu();
        this.loadFromServer();
    },

    getColumns() {
        return Object.keys(this.defaults);
    },

    bindEvents() {
        const menu = document.getElementById('userColumnVisibilityMenu');
        if (menu) {
            menu.addEventListener('click', (e) => e.stopPropagation());
            menu.addEventListener('change', (e) => {
                const target = e.target;
                if (!(target instanceof HTMLInputElement) || !target.classList.contains('user-column-toggle')) return;
                const column = target.dataset.column;
                if (!column) return;
                const visibleCount = this.countVisibleColumns();
                if (!target.checked && visibleCount <= 1) {
                    target.checked = true;
                    showMessage('At least one column must stay visible', 'error');
                    return;
                }
                this.setColumn(column, target.checked);
            });
        }

        document.getElementById('userShowAllColumnsBtn')?.addEventListener('click', () => this.showAll());
        document.getElementById('userResetColumnsBtn')?.addEventListener('click', () => this.reset());
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
        this.getColumns().forEach((column) => {
            const isVisible = this.visibility[column] !== false;
            document.querySelectorAll(`#invoice-table-card .col-${column}`).forEach((el) => {
                el.classList.toggle('d-none', !isVisible);
            });
        });
    },

    syncMenu() {
        const menu = document.getElementById('userColumnVisibilityMenu');
        if (!menu) return;
        menu.querySelectorAll('.user-column-toggle').forEach((input) => {
            if (!(input instanceof HTMLInputElement)) return;
            const column = input.dataset.column;
            if (!column) return;
            input.checked = this.visibility[column] !== false;
        });
    },

    normalizeState() {
        this.getColumns().forEach((key) => {
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
        const cls = Array.from(element.classList).find(c => c.startsWith('col-'));
        return cls ? cls.slice(4) : '';
    },

    applyOrder() {
        const table = document.querySelector('#invoice-table-card table');
        const headerRow = table?.querySelector('thead tr');
        if (!headerRow) return;

        this.order.forEach((column) => {
            const header = headerRow.querySelector(`th.col-${column}`);
            if (header) headerRow.appendChild(header);
        });

        const rows = document.querySelectorAll('#invoice-tbody tr');
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
        if (column === 'item_name') return 140;
        return 90;
    },

    applyColumnWidth(column, width) {
        const bounded = Math.max(this.getMinWidth(column), Math.min(900, Math.round(width)));
        document.querySelectorAll(`#invoice-table-card th.col-${column}, #invoice-table-card td.col-${column}`).forEach((el) => {
            el.style.width = `${bounded}px`;
            el.style.minWidth = `${bounded}px`;
        });
    },

    clearColumnWidth(column) {
        document.querySelectorAll(`#invoice-table-card th.col-${column}, #invoice-table-card td.col-${column}`).forEach((el) => {
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
        document.querySelectorAll('#invoice-table-card th.user-reorderable-col').forEach((th) => {
            th.classList.remove('user-drag-over-left', 'user-drag-over-right', 'user-dragging-col');
        });
    },

    initHeaderInteractions() {
        if (this.headerInteractionsBound) return;
        const headers = document.querySelectorAll('#invoice-table-card thead th');
        if (!headers.length) return;
        this.headerInteractionsBound = true;

        headers.forEach((th) => {
            const column = this.extractColumnKey(th);
            if (!column) return;

            th.classList.add('user-reorderable-col');
            th.draggable = true;

            if (!th.querySelector('.user-col-resizer')) {
                const resizer = document.createElement('span');
                resizer.className = 'user-col-resizer';
                th.appendChild(resizer);

                resizer.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.isResizing = true;
                    const startX = event.clientX;
                    const startWidth = th.getBoundingClientRect().width;

                    const onMouseMove = (moveEvent) => {
                        const delta = moveEvent.clientX - startX;
                        this.setColumnWidth(column, startWidth + delta, false);
                    };

                    const onMouseUp = () => {
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
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
                th.classList.add('user-dragging-col');
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
                th.classList.add(dropRightSide ? 'user-drag-over-right' : 'user-drag-over-left');
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

    scheduleSyncToServer() {
        if (this.syncTimer) clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => this.pushToServer(), this.syncDebounceMs);
    },

    async pushToServer() {
        try {
            await setUserPreference(this.serverPreferenceKey, this.buildPreferencePayload());
        } catch (error) {
            console.warn('Failed to sync user invoice layout to server', error);
        }
    },

    async loadFromServer() {
        try {
            const result = await getUserPreference(this.serverPreferenceKey);
            const value = result?.value;
            if (value && typeof value === 'object') {
                this.applyImportedLayout(value, false);
            }
        } catch (error) {
            console.warn('Failed to load user invoice layout from server', error);
        }
    },

    applyImportedLayout(payload, syncServer = true) {
        if (!payload || typeof payload !== 'object') return;
        this.visibility = { ...this.defaults, ...(payload.visibility || {}) };
        this.order = Array.isArray(payload.order) ? payload.order : [];
        this.widths = payload.widths && typeof payload.widths === 'object' ? payload.widths : {};
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

    saveVisibility() {
        localStorage.setItem(this.visibilityStorageKey, JSON.stringify(this.visibility));
    },

    saveOrder() {
        localStorage.setItem(this.orderStorageKey, JSON.stringify(this.order));
    },

    saveWidths() {
        localStorage.setItem(this.widthStorageKey, JSON.stringify(this.widths));
    },

    loadVisibility() {
        try {
            const raw = localStorage.getItem(this.visibilityStorageKey);
            return raw ? (JSON.parse(raw) || {}) : {};
        } catch {
            return {};
        }
    },

    loadOrder() {
        try {
            const raw = localStorage.getItem(this.orderStorageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    },

    loadWidths() {
        try {
            const raw = localStorage.getItem(this.widthStorageKey);
            return raw ? (JSON.parse(raw) || {}) : {};
        } catch {
            return {};
        }
    }
};

function initInvoicesPage() {
    loadInvoices();
    loadDraftsForInvoicesPage();

    document.getElementById('clear-drafts-btn')?.addEventListener('click', () => {
        if (confirm('确定要清空所有暂存发票吗？')) {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
            loadDraftsForInvoicesPage();
        }
    });

    document.querySelectorAll('#invoiceTabs .nav-link[data-status]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const status = e.target.closest('.nav-link').dataset.status;
            currentStatusFilter = status || '';
            currentPage = 1;
            loadInvoices();
        });
    });

    document.querySelectorAll('input[name="recordTypeFilter"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentRecordTypeFilter = e.target.value;
            currentPage = 1;
            loadInvoices();
        });
    });

    document.getElementById('user-pagination-prev')?.addEventListener('click', () => {
        if (currentPage <= 1) return;
        currentPage -= 1;
        loadInvoices();
    });

    document.getElementById('user-pagination-next')?.addEventListener('click', () => {
        if (currentPage >= totalPages) return;
        currentPage += 1;
        loadInvoices();
    });
}

function loadDraftsForInvoicesPage() {
    const draftCard = document.getElementById('draft-list-card-invoices');
    const draftEmpty = document.getElementById('draft-empty-state');
    const draftTbody = document.getElementById('draft-tbody');
    const draftCountTab = document.getElementById('draft-count-tab');

    if (!draftTbody) return;

    let drafts = [];
    try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (saved) {
            drafts = JSON.parse(saved);
        }
    } catch (e) {
        console.error('加载暂存发票失败:', e);
    }

    // 更新tab上的计数
    if (draftCountTab) {
        draftCountTab.textContent = drafts.length;
    }

    if (drafts.length === 0) {
        draftCard?.classList.add('d-none');
        draftEmpty?.classList.remove('d-none');
        return;
    }

    draftCard?.classList.remove('d-none');
    draftEmpty?.classList.add('d-none');

    draftTbody.innerHTML = '';
    drafts.forEach((draft, index) => {
        const tr = document.createElement('tr');
        const needsReupload = !draft.hasPdfFile;

        if (needsReupload) {
            tr.classList.add('table-warning');
        }

        let statusHtml = needsReupload
            ? '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-circle"></i> 需重传PDF</span>'
            : '<span class="badge bg-info"><i class="bi bi-hourglass"></i> 待提交</span>';

        tr.innerHTML = `
            <td>${draft.invoice.invoice_number}</td>
            <td>${draft.invoice.invoice_date || '-'}</td>
            <td>${draft.invoice.item_name || '-'}</td>
            <td class="text-end text-success fw-bold">${formatAmount(draft.invoice.amount)}</td>
            <td>${draft.personName || '-'}</td>
            <td class="text-center">${statusHtml}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-danger remove-draft-invoices-btn" data-index="${index}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        draftTbody.appendChild(tr);
    });

    // 删除按钮事件
    draftTbody.querySelectorAll('.remove-draft-invoices-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            drafts.splice(index, 1);
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
            loadDraftsForInvoicesPage();
        });
    });
}

async function loadInvoices() {
    const loading = document.getElementById('loading');
    const tableCard = document.getElementById('invoice-table-card');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');

    try {
        const params = new URLSearchParams();
        if (currentStatusFilter) params.append('reimbursement_status', currentStatusFilter);
        if (currentRecordTypeFilter) params.append('record_type', currentRecordTypeFilter);
        params.append('page', String(currentPage));
        params.append('page_size', String(PAGE_SIZE));
        const response = await fetch(`${USER_API_BASE}/invoices?${params.toString()}`);
        const data = await response.json();

        loading.classList.add('d-none');

        if ((data.total_pages || 0) > 0 && currentPage > data.total_pages) {
            currentPage = data.total_pages;
            loadInvoices();
            return;
        }

        allInvoices = data.invoices || [];
        updateStatusCounts(data);
        updatePagination(data);

        if (allInvoices.length === 0) {
            emptyState.classList.remove('d-none');
            tableCard.classList.add('d-none');
            return;
        }

        renderFilteredInvoices();
    } catch (error) {
        loading.classList.add('d-none');
        errorState?.classList.remove('d-none');
    }
}

function updateStatusCounts(data) {
    const allCount = data.total_count || 0;
    const pendingCount = data.pending_count || 0;
    const reimbursedCount = data.completed_count || 0;

    const allCountEl = document.getElementById('all-count');
    const pendingCountEl = document.getElementById('pending-count');
    const reimbursedCountEl = document.getElementById('reimbursed-count');

    if (allCountEl) allCountEl.textContent = allCount;
    if (pendingCountEl) pendingCountEl.textContent = pendingCount;
    if (reimbursedCountEl) reimbursedCountEl.textContent = reimbursedCount;

    document.getElementById('total-count').textContent = data.total_count || allCount;
    document.getElementById('total-amount').textContent = formatAmount(data.total_amount || 0);

    const invoiceCountEl = document.getElementById('invoice-count');
    const manualCountEl = document.getElementById('manual-count');
    const invoiceAmountEl = document.getElementById('invoice-amount');
    const manualAmountEl = document.getElementById('manual-amount');

    if (invoiceCountEl) invoiceCountEl.textContent = data.invoice_count || 0;
    if (manualCountEl) manualCountEl.textContent = data.manual_count || 0;
    if (invoiceAmountEl) invoiceAmountEl.textContent = formatAmount(data.invoice_amount || 0);
    if (manualAmountEl) manualAmountEl.textContent = formatAmount(data.manual_amount || 0);
}

function renderFilteredInvoices() {
    const tableCard = document.getElementById('invoice-table-card');
    const emptyState = document.getElementById('empty-state');
    const tbody = document.getElementById('invoice-tbody');

    const filteredInvoices = allInvoices;

    if (filteredInvoices.length === 0) {
        tableCard.classList.add('d-none');
        emptyState.classList.remove('d-none');
        return;
    }

    tableCard.classList.remove('d-none');
    emptyState.classList.add('d-none');

    tbody.innerHTML = '';
    filteredInvoices.forEach(invoice => {
        const tr = document.createElement('tr');
        const status = invoice.reimbursement_status || '未报销';
        const statusClass = status === '已报销' ? 'bg-success' : 'bg-warning text-dark';

        const recordType = invoice.record_type || 'invoice';
        let recordTypeBadge = '';
        if (recordType === 'manual') {
            recordTypeBadge = '<span class="badge badge-manual"><i class="bi bi-pencil-square me-1"></i>无票报销</span>';
        } else {
            recordTypeBadge = '<span class="badge badge-invoice"><i class="bi bi-file-earmark-pdf me-1"></i>有发票</span>';
        }

        tr.innerHTML = `
                <td>${invoice.invoice_number}</td>
                <td>${invoice.invoice_date}</td>
                <td>${invoice.item_name || '-'}</td>
                <td class="text-end text-success fw-bold">${formatAmount(invoice.amount)}</td>
                <td>${invoice.time_ago || '-'}</td>
                <td class="text-center">${recordTypeBadge}</td>
                <td class="text-center"><span class="badge ${statusClass}">${status}</span></td>
                <td class="text-center"><span class="badge bg-secondary">${invoice.voucher_count || 0}</span></td>
            `;
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
            window.location.href = `/user/invoices/${encodeURIComponent(invoice.invoice_number)}`;
        });
        tbody.appendChild(tr);
    });
}

function updatePagination(data) {
    currentPage = data.page || 1;
    totalPages = Math.max(data.total_pages || 1, 1);

    const info = document.getElementById('user-pagination-info');
    const prevBtn = document.getElementById('user-pagination-prev');
    const nextBtn = document.getElementById('user-pagination-next');

    if (info) {
        info.textContent = `Page ${currentPage} / ${totalPages}, Total ${data.total_count || 0}`;
    }
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }
}

// ========== Detail Page ==========
let currentVouchers = [];
let currentVoucherIndex = 0;
let currentInvoiceData = null; // Store current invoice data for editing

function initDetailPage() {
    if (!window.invoiceNumber) return;
    loadInvoiceDetail(window.invoiceNumber);

    document.getElementById('preview-pdf-btn')?.addEventListener('click', () => {
        const iframe = document.getElementById('pdf-iframe');
        iframe.src = `${USER_API_BASE}/invoices/${encodeURIComponent(window.invoiceNumber)}/pdf?preview=true`;
        new bootstrap.Modal(document.getElementById('pdfModal')).show();
    });

    // Edit button for manual records
    document.getElementById('edit-manual-btn')?.addEventListener('click', () => {
        openEditManualModal();
    });

    // Edit form submission
    document.getElementById('edit-manual-form')?.addEventListener('submit', handleEditManualSubmit);

    document.getElementById('prev-voucher-btn')?.addEventListener('click', () => {
        if (currentVouchers.length > 0) {
            currentVoucherIndex = (currentVoucherIndex - 1 + currentVouchers.length) % currentVouchers.length;
            showVoucherAtIndex(currentVoucherIndex);
        }
    });

    document.getElementById('next-voucher-btn')?.addEventListener('click', () => {
        if (currentVouchers.length > 0) {
            currentVoucherIndex = (currentVoucherIndex + 1) % currentVouchers.length;
            showVoucherAtIndex(currentVoucherIndex);
        }
    });
}

async function loadInvoiceDetail(invoiceNumber) {
    const loading = document.getElementById('loading');
    const content = document.getElementById('detail-content');
    const errorState = document.getElementById('error-state');

    try {
        const response = await fetch(`${USER_API_BASE}/invoices/${encodeURIComponent(invoiceNumber)}`);
        const invoice = await response.json();

        if (!response.ok) {
            throw new Error(invoice.message || '发票不存在');
        }

        // Store invoice data for editing
        currentInvoiceData = invoice;

        loading.classList.add('d-none');
        content.classList.remove('d-none');

        // Determine record type
        const recordType = invoice.record_type || 'invoice';
        const isManual = recordType === 'manual';

        // Update UI based on record type
        const cardTitle = document.getElementById('detail-card-title');
        const pdfBtn = document.getElementById('preview-pdf-btn');
        const editBtn = document.getElementById('edit-manual-btn');
        const manualNotice = document.getElementById('manual-record-notice');

        if (isManual) {
            // Manual record
            cardTitle.textContent = '报销记录信息';
            pdfBtn.classList.add('d-none'); // Hide PDF button
            editBtn.classList.remove('d-none'); // Show edit button
            manualNotice.classList.remove('d-none'); // Show manual notice
        } else {
            // Invoice record
            cardTitle.textContent = '发票信息';
            pdfBtn.classList.remove('d-none'); // Show PDF button
            editBtn.classList.add('d-none'); // Hide edit button
            manualNotice.classList.add('d-none'); // Hide manual notice
        }

        // Populate fields
        document.getElementById('detail-number').textContent = invoice.invoice_number;
        document.getElementById('detail-date').textContent = invoice.invoice_date;
        document.getElementById('detail-item').textContent = invoice.item_name || '-';
        document.getElementById('detail-amount').textContent = formatAmount(invoice.amount);
        document.getElementById('detail-person').textContent = invoice.reimbursement_person_name || '-';
        document.getElementById('detail-time').textContent = formatDate(invoice.scan_time);
        document.getElementById('detail-remark').textContent = invoice.remark || '-';

        // 显示报销状态
        const status = invoice.reimbursement_status || '未报销';
        const statusEl = document.getElementById('detail-status');
        if (statusEl) {
            const statusClass = status === '已报销' ? 'bg-success' : 'bg-warning text-dark';
            statusEl.innerHTML = `<span class="badge ${statusClass}">${status}</span>`;
        }

        loadVouchers(invoiceNumber);
    } catch (error) {
        loading.classList.add('d-none');
        errorState.classList.remove('d-none');
    }
}

async function loadVouchers(invoiceNumber) {
    try {
        const response = await fetch(`${USER_API_BASE}/invoices/${encodeURIComponent(invoiceNumber)}/vouchers`);
        const data = await response.json();

        if (!response.ok) {
            console.error('加载凭证失败:', data.message);
            return;
        }

        document.getElementById('voucher-count').textContent = data.count;
        currentVouchers = data.vouchers || [];

        const gallery = document.getElementById('voucher-gallery');
        const noVouchers = document.getElementById('no-vouchers');

        if (currentVouchers.length === 0) {
            noVouchers.classList.remove('d-none');
            gallery.innerHTML = '';
            return;
        }

        noVouchers.classList.add('d-none');
        gallery.innerHTML = '';

        currentVouchers.forEach((voucher, index) => {
            const div = document.createElement('div');
            div.className = 'voucher-gallery-item';
            div.innerHTML = `<img src="${USER_API_BASE}/vouchers/${voucher.id}/image" alt="${voucher.original_filename}">`;
            div.addEventListener('click', () => {
                currentVoucherIndex = index;
                showVoucherAtIndex(index);
                new bootstrap.Modal(document.getElementById('voucherModal')).show();
            });
            gallery.appendChild(div);
        });
    } catch (error) {
        console.error('Load vouchers error:', error);
    }
}

function showVoucherAtIndex(index) {
    if (currentVouchers.length === 0) return;
    const voucher = currentVouchers[index];
    document.getElementById('voucher-preview-img').src = `${USER_API_BASE}/vouchers/${voucher.id}/image`;
    document.getElementById('voucher-index').textContent = `${index + 1} / ${currentVouchers.length}`;
}

// ========== Edit Manual Record Functions ==========
async function openEditManualModal() {
    if (!currentInvoiceData) return;

    // Load persons list if not already loaded
    if (cachedPersons.length === 0) {
        await loadPersons();
    }

    // Populate person select
    const personSelect = document.getElementById('edit-reimbursement-person');
    personSelect.innerHTML = '<option value="">请选择</option>';
    cachedPersons.forEach(person => {
        const option = document.createElement('option');
        option.value = person.id;
        option.textContent = person.name;
        personSelect.appendChild(option);
    });

    // Populate form with current values
    document.getElementById('edit-item-name').value = currentInvoiceData.item_name || '';
    document.getElementById('edit-amount').value = currentInvoiceData.amount || '';
    document.getElementById('edit-invoice-date').value = currentInvoiceData.invoice_date || '';
    document.getElementById('edit-remark').value = currentInvoiceData.remark || '';

    // Set person select value
    if (currentInvoiceData.reimbursement_person_id) {
        personSelect.value = currentInvoiceData.reimbursement_person_id;
    }

    // Clear validation errors
    clearEditManualErrors();

    // Show modal
    new bootstrap.Modal(document.getElementById('editManualModal')).show();
}

async function handleEditManualSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Clear previous errors
    clearEditManualErrors();

    // Get form data
    const itemName = document.getElementById('edit-item-name').value.trim();
    const amount = document.getElementById('edit-amount').value.trim();
    const invoiceDate = document.getElementById('edit-invoice-date').value.trim();
    const remark = document.getElementById('edit-remark').value.trim();
    const reimbursementPersonId = document.getElementById('edit-reimbursement-person').value;

    // Client-side validation
    let hasErrors = false;

    if (!itemName) {
        showEditFieldError('edit-item-name', '费用项目名称不能为空');
        hasErrors = true;
    }

    if (!amount) {
        showEditFieldError('edit-amount', '金额不能为空');
        hasErrors = true;
    } else {
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            showEditFieldError('edit-amount', '金额必须大于0');
            hasErrors = true;
        }
    }

    if (!invoiceDate) {
        showEditFieldError('edit-invoice-date', '日期不能为空');
        hasErrors = true;
    }

    if (hasErrors) {
        return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>保存中...';

    try {
        // Prepare request data
        const requestData = {
            item_name: itemName,
            amount: parseFloat(amount),
            invoice_date: invoiceDate,
            remark: remark
        };

        if (reimbursementPersonId) {
            requestData.reimbursement_person_id = parseInt(reimbursementPersonId);
        }

        // Submit to API
        const response = await fetch(`${USER_API_BASE}/manual/${encodeURIComponent(currentInvoiceData.invoice_number)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Success
            showMessage('记录更新成功！', 'success');

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('editManualModal')).hide();

            // Reload invoice detail
            await loadInvoiceDetail(currentInvoiceData.invoice_number);

        } else {
            // Handle validation errors
            if (data.errors) {
                Object.keys(data.errors).forEach(field => {
                    const fieldId = `edit-${field.replace('_', '-')}`;
                    showEditFieldError(fieldId, data.errors[field]);
                });
            } else {
                showMessage(data.message || '更新失败，请重试', 'error');
            }
        }

    } catch (error) {
        console.error('Update error:', error);
        showMessage('网络错误，请重试', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

function showEditFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorDiv = document.getElementById(`${fieldId}-error`);

    if (field) {
        field.classList.add('is-invalid');
    }

    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function clearEditManualErrors() {
    const fields = ['edit-item-name', 'edit-amount', 'edit-invoice-date'];

    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        const errorDiv = document.getElementById(`${fieldId}-error`);

        if (field) {
            field.classList.remove('is-invalid');
        }

        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
    });
}
