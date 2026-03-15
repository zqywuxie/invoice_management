ContractManager.filteredContracts = [];
ContractManager.uploadPreviewRequestId = 0;
ContractManager.pairPreviewRequestId = 0;
ContractManager.pairValidationState = null;
ContractManager.sortMode = 'upload_desc';
ContractManager.onlyShowMissing = false;
ContractManager.focusInvoice = '';
ContractManager.urlStateInitialized = false;

ContractManager.init = function() {
    if (DOM.contractManagementModal) {
        this.modalInstance = new bootstrap.Modal(DOM.contractManagementModal);
        DOM.contractManagementModal.addEventListener('hidden.bs.modal', () => {
            this.resetUploadForm();
        });
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
    this.applyInitialUrlState();
    this.resetUploadForm();
    this.updatePairFilterButtons();
    this.updateContractFiltersUI();
};

ContractManager.updatePairFilterButtons = function() {
    DOM.contractPairFilter?.querySelectorAll('button[data-value]').forEach((button) => {
        button.classList.toggle('active', button.dataset.value === this.pairFilter);
    });
};

ContractManager.updateContractFiltersUI = function() {
    if (DOM.contractSortSelect) {
        DOM.contractSortSelect.value = this.sortMode;
    }
    if (DOM.contractMissingOnlyToggle) {
        DOM.contractMissingOnlyToggle.checked = Boolean(this.onlyShowMissing);
    }
};

ContractManager.applyInitialUrlState = function() {
    if (this.urlStateInitialized) return;

    const params = new URLSearchParams(window.location.search);
    const search = (params.get('search') || '').trim();
    const pairFilter = (params.get('pair_filter') || '').trim();
    const sortMode = (params.get('sort') || '').trim();

    if (DOM.contractSearchInput) {
        DOM.contractSearchInput.value = search;
    }
    if (['all', 'paired', 'unpaired'].includes(pairFilter)) {
        this.pairFilter = pairFilter;
    }
    if (['upload_desc', 'unpaired_first', 'missing_desc', 'candidate_desc'].includes(sortMode)) {
        this.sortMode = sortMode;
    }

    this.focusInvoice = (params.get('focus_invoice') || '').trim();
    this.onlyShowMissing = params.get('missing') === 'only';
    this.urlStateInitialized = true;
};

ContractManager.syncUrlState = function() {
    const url = new URL(window.location.href);
    const params = new URLSearchParams();
    const search = DOM.contractSearchInput?.value?.trim() || '';

    if (search) params.set('search', search);
    if (this.focusInvoice) params.set('focus_invoice', this.focusInvoice);
    if (this.pairFilter !== 'all') params.set('pair_filter', this.pairFilter);
    if (this.onlyShowMissing) params.set('missing', 'only');
    if (this.sortMode !== 'upload_desc') params.set('sort', this.sortMode);

    const nextQuery = params.toString();
    const currentQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
    if (nextQuery === currentQuery) return;

    const nextUrl = nextQuery ? `${url.pathname}?${nextQuery}` : url.pathname;
    window.history.replaceState({}, '', nextUrl);
};

ContractManager.parseInvoiceNumbers = function(rawValue) {
    if (rawValue == null) return [];
    if (Array.isArray(rawValue)) {
        return this.parseInvoiceNumbers(rawValue.join('\n'));
    }

    const normalizedInput = String(rawValue)
        .replace(/\r/g, '\n')
        .replace(/，/g, ',')
        .replace(/；/g, ',')
        .replace(/;/g, ',');
    const values = [];

    normalizedInput.split('\n').forEach((line) => {
        line.split(',').forEach((part) => {
            const cleaned = part.trim();
            if (cleaned) {
                values.push(cleaned);
            }
        });
    });

    return Array.from(new Set(values));
};

ContractManager.getCandidateNumbers = function(contract) {
    if (!contract) return [];
    return this.parseInvoiceNumbers(contract.invoice_numbers_text || contract.invoice_numbers || []);
};

ContractManager.getTagColorClass = function(tag) {
    if (!tag) return 'tag-color-0';
    let hash = 0;
    for (let i = 0; i < tag.length; i += 1) {
        hash = (hash * 31 + tag.charCodeAt(i)) % 8;
    }
    return `tag-color-${hash}`;
};

ContractManager.openInvoiceWorkspace = function(invoiceNumber) {
    if (!invoiceNumber) return;
    window.location.href = Utils.buildInvoiceWorkspaceUrl(invoiceNumber);
};

ContractManager.getSortLabel = function() {
    switch (this.sortMode) {
    case 'unpaired_first':
        return '待配对优先';
    case 'missing_desc':
        return '缺失候选编号优先';
    case 'candidate_desc':
        return '候选编号数量优先';
    default:
        return '最新上传';
    }
};

ContractManager.compareContracts = function(left, right) {
    const leftTime = left?.upload_time ? new Date(left.upload_time).getTime() || 0 : 0;
    const rightTime = right?.upload_time ? new Date(right.upload_time).getTime() || 0 : 0;
    const fallback = rightTime - leftTime || (Number(right?.id || 0) - Number(left?.id || 0));

    switch (this.sortMode) {
    case 'unpaired_first': {
        const leftRank = (left?.linked_invoice_count || 0) > 0 ? 1 : 0;
        const rightRank = (right?.linked_invoice_count || 0) > 0 ? 1 : 0;
        return leftRank - rightRank || (right?.candidate_missing_count || 0) - (left?.candidate_missing_count || 0) || fallback;
    }
    case 'missing_desc':
        return (right?.candidate_missing_count || 0) - (left?.candidate_missing_count || 0)
            || (right?.linked_invoice_count || 0) - (left?.linked_invoice_count || 0)
            || fallback;
    case 'candidate_desc':
        return (right?.invoice_count || 0) - (left?.invoice_count || 0)
            || (right?.linked_invoice_count || 0) - (left?.linked_invoice_count || 0)
            || fallback;
    default:
        return fallback;
    }
};

ContractManager.renderInvoiceJumpButton = function(invoiceNumber, label = '查看发票') {
    if (!invoiceNumber) return '';
    return `
        <button type="button" class="btn btn-sm btn-outline-secondary contract-jump-btn" data-open-invoice="${Utils.escapeHtml(invoiceNumber)}">
            <i class="bi bi-box-arrow-up-right me-1"></i>${Utils.escapeHtml(label)}
        </button>
    `;
};

ContractManager.renderInvoiceReferenceChips = function(invoiceNumbers = [], styleClass = '') {
    if (!invoiceNumbers.length) {
        return '-';
    }

    return invoiceNumbers.map((invoiceNumber) => `
        <button type="button" class="contract-reference-link ${styleClass}" data-open-invoice="${Utils.escapeHtml(invoiceNumber)}">
            ${Utils.escapeHtml(invoiceNumber)}
        </button>
    `).join('');
};

ContractManager.getFilteredContracts = function() {
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

    if (this.onlyShowMissing) {
        filteredContracts = filteredContracts.filter((contract) => (contract.candidate_missing_count || 0) > 0);
    }

    filteredContracts.sort((left, right) => this.compareContracts(left, right));
    return filteredContracts;
};

ContractManager.getProgressData = function(contract) {
    const candidateCount = contract.invoice_count || (contract.invoice_numbers || []).length || 0;
    const linkedCount = contract.linked_invoice_count || 0;
    if (candidateCount <= 0) {
        return {
            candidateCount,
            linkedCount,
            percent: linkedCount > 0 ? 100 : 0
        };
    }
    return {
        candidateCount,
        linkedCount,
        percent: Math.min(100, Math.round((linkedCount / candidateCount) * 100))
    };
};

ContractManager.getStatusPillsHtml = function(contract) {
    const missingCount = contract.candidate_missing_count || 0;
    const linkedCount = contract.linked_invoice_count || 0;
    const candidateCount = contract.invoice_count || (contract.invoice_numbers || []).length || 0;
    const pills = [];

    if (candidateCount === 0) {
        pills.push('<span class="contract-status-pill is-warning"><i class="bi bi-journal-x"></i>无候选编号</span>');
    } else if (missingCount > 0) {
        pills.push(`<span class="contract-status-pill is-danger"><i class="bi bi-exclamation-triangle"></i>缺失 ${missingCount} 个编号</span>`);
    } else {
        pills.push(`<span class="contract-status-pill is-success"><i class="bi bi-patch-check"></i>候选已校验 ${contract.candidate_existing_count || 0} 个</span>`);
    }

    if (linkedCount > 0) {
        pills.push(`<span class="contract-status-pill is-success"><i class="bi bi-link-45deg"></i>已配对 ${linkedCount} 张</span>`);
    } else {
        pills.push('<span class="contract-status-pill is-warning"><i class="bi bi-hourglass-split"></i>待配对</span>');
    }

    return pills.join('');
};

ContractManager.renderInvoicePreviewList = function(previews = [], missingNumbers = [], emptyText = '暂无相关发票') {
    const blocks = [];

    previews.forEach((preview) => {
        const recordType = preview.record_type === 'manual' ? '手动记录' : '发票';
        blocks.push(`
            <div class="contract-mini-item is-found">
                <div class="contract-mini-head">
                    <div>
                        <div class="contract-mini-name">${Utils.escapeHtml(preview.invoice_number || '')}</div>
                        <div class="contract-mini-meta">
                            <span>${Utils.escapeHtml(preview.item_name || '未填写费用项目')}</span>
                            <span>${Utils.escapeHtml(preview.invoice_date || '-')}</span>
                            <span>${Utils.escapeHtml(Utils.formatCurrency(preview.amount || 0))}</span>
                        </div>
                    </div>
                    <span class="contract-mini-status is-found">已录入</span>
                </div>
                <div class="contract-mini-meta">
                    <span>${Utils.escapeHtml(recordType)}</span>
                    <span>${Utils.escapeHtml(preview.uploaded_by || '未记录上传人')}</span>
                    <span>${Utils.escapeHtml(preview.reimbursement_status || '未记录状态')}</span>
                </div>
                <div class="contract-mini-actions">
                    ${this.renderInvoiceJumpButton(preview.invoice_number || '')}
                </div>
            </div>
        `);
    });

    missingNumbers.forEach((invoiceNumber) => {
        blocks.push(`
            <div class="contract-mini-item is-missing">
                <div class="contract-mini-head">
                    <div>
                        <div class="contract-mini-name">${Utils.escapeHtml(invoiceNumber)}</div>
                        <div class="contract-mini-meta"><span>系统中尚未找到该发票编号</span></div>
                    </div>
                    <span class="contract-mini-status is-missing">缺失</span>
                </div>
                <div class="contract-mini-actions">
                    ${this.renderInvoiceJumpButton(invoiceNumber, '鍘诲彂绁ㄩ〉鎼滅储')}
                </div>
            </div>
        `);
    });

    if (!blocks.length) {
        return `<div class="contract-mini-empty">${Utils.escapeHtml(emptyText)}</div>`;
    }

    return blocks.join('');
};

ContractManager.renderSummaryCards = function() {
    const total = this.contracts.length;
    const paired = this.contracts.filter((contract) => (contract.linked_invoice_count || 0) > 0).length;
    const unpaired = total - paired;
    const missing = this.contracts.reduce((sum, contract) => sum + (contract.candidate_missing_count || 0), 0);
    const candidateFound = this.contracts.reduce((sum, contract) => sum + (contract.candidate_existing_count || 0), 0);

    if (DOM.contractTotalCount) DOM.contractTotalCount.textContent = String(total);
    if (DOM.contractPairedCount) DOM.contractPairedCount.textContent = String(paired);
    if (DOM.contractUnpairedCount) DOM.contractUnpairedCount.textContent = String(unpaired);
    if (DOM.contractMissingCount) DOM.contractMissingCount.textContent = String(missing);
    if (DOM.contractSummaryHint) {
        DOM.contractSummaryHint.textContent = `候选已录入 ${candidateFound} 个，缺失 ${missing} 个`;
    }
};

ContractManager.renderResultSummary = function(filteredContracts) {
    const search = DOM.contractSearchInput?.value?.trim() || '';
    const filters = [];
    if (search) filters.push(`搜索“${search}”`);
    if (this.activeTags.size > 0) filters.push(`标签 ${Array.from(this.activeTags).join('、')}`);
    if (this.pairFilter === 'paired') filters.push('仅看已配对');
    if (this.pairFilter === 'unpaired') filters.push('仅看待配对');
    if (this.onlyShowMissing) filters.push('只看缺失候选编号');
    const sortLabel = this.getSortLabel();

    if (DOM.contractResultSummary) {
        const prefix = `共 ${this.contracts.length} 份合同，当前显示 ${filteredContracts.length} 份`;
        const summary = filters.length ? `${prefix}；筛选条件：${filters.join('，')}` : prefix;
        DOM.contractResultSummary.textContent = `${summary}；当前排序：${sortLabel}`;
    }

    if (DOM.clearContractFiltersBtn) {
        DOM.clearContractFiltersBtn.disabled = filters.length === 0 && this.sortMode === 'upload_desc';
    }
};

ContractManager.renderTagFilters = function() {
    if (!DOM.contractTagFilterList) return;

    const tags = new Set();
    this.contracts.forEach((contract) => {
        (contract.contract_tags || []).forEach((tag) => tags.add(tag));
    });

    this.activeTags.forEach((tag) => {
        if (!tags.has(tag)) {
            this.activeTags.delete(tag);
        }
    });

    const tagList = Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-Hans'));
    if (!tagList.length) {
        DOM.contractTagFilterList.innerHTML = '<span class="contract-chip-muted">当前没有可筛选标签</span>';
        return;
    }

    DOM.contractTagFilterList.innerHTML = `
        <button type="button" class="contract-tag-filter ${this.activeTags.size === 0 ? 'active' : ''}" data-tag="__all">全部标签</button>
        ${tagList.map((tag) => `
            <button type="button" class="contract-tag-filter ${this.getTagColorClass(tag)} ${this.activeTags.has(tag) ? 'active' : ''}" data-tag="${Utils.escapeHtml(tag)}">
                ${Utils.escapeHtml(tag)}
            </button>
        `).join('')}
    `;

    DOM.contractTagFilterList.querySelectorAll('button[data-tag]').forEach((button) => {
        button.addEventListener('click', () => {
            const tag = button.dataset.tag || '';
            if (tag === '__all') {
                this.activeTags.clear();
            } else if (this.activeTags.has(tag)) {
                this.activeTags.delete(tag);
            } else {
                this.activeTags.add(tag);
            }
            this.renderTagFilters();
            this.render();
        });
    });
};

ContractManager.render = function() {
    if (!DOM.contractTableBody) return;

    const filteredContracts = this.getFilteredContracts();
    this.filteredContracts = filteredContracts;
    this.renderResultSummary(filteredContracts);
    this.syncUrlState();

    if (!filteredContracts.length) {
        const hasFilter = Boolean(
            (DOM.contractSearchInput?.value?.trim() || '')
            || this.activeTags.size > 0
            || this.pairFilter !== 'all'
            || this.onlyShowMissing
        );
        DOM.contractTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-5">
                    ${hasFilter ? '没有符合当前筛选条件的合同' : '暂无合同数据，先上传一份合同开始管理'}
                </td>
            </tr>
        `;
        return;
    }

    DOM.contractTableBody.innerHTML = filteredContracts.map((contract) => {
        const candidateCount = contract.invoice_count || (contract.invoice_numbers || []).length || 0;
        const missingCount = contract.candidate_missing_count || 0;
        const progress = this.getProgressData(contract);
        const candidateNumbers = contract.invoice_numbers || [];
        const linkedNumbers = contract.linked_invoice_numbers || [];
        const rowClassName = this.focusInvoice && (candidateNumbers.includes(this.focusInvoice) || linkedNumbers.includes(this.focusInvoice))
            ? 'contract-focus-row'
            : '';
        const candidateSummary = candidateCount
            ? `候选 ${candidateCount} 个 · 已录入 ${contract.candidate_existing_count || 0} 个${missingCount ? ` · 缺失 ${missingCount} 个` : ''}`
            : '暂无候选发票编号';

        return `
            <tr class="${rowClassName}">
                <td>
                    <div class="contract-overview-main">
                        <div class="contract-overview-title">${Utils.escapeHtml(contract.contract_title || contract.original_filename || '未命名合同')}</div>
                        <div class="contract-overview-subtitle">${Utils.escapeHtml(candidateSummary)}</div>
                        <div class="contract-overview-chips">
                            ${candidateNumbers.map((invoiceNumber) => `<span class="badge text-bg-light border">${Utils.escapeHtml(invoiceNumber)}</span>`).join('') || '<span class="text-muted">未填写</span>'}
                        </div>
                    </div>
                </td>
                <td>
                    <div class="contract-status-stack">
                        <div>${this.getStatusPillsHtml(contract)}</div>
                        <div class="contract-progress">
                            <div class="contract-progress-label">配对进度 ${progress.linkedCount}/${progress.candidateCount || 0}</div>
                            <div class="contract-progress-track">
                                <div class="contract-progress-fill" style="width:${progress.percent}%;"></div>
                            </div>
                        </div>
                    </div>
                </td>
                <td>${Utils.escapeHtml(contract.contract_title || '待补充标题')}</td>
                <td>${(contract.contract_tags || []).map((tag) => `<span class="contract-tag-badge ${this.getTagColorClass(tag)} me-1 mb-1">${Utils.escapeHtml(tag)}</span>`).join('') || '-'}</td>
                <td>
                    <span class="d-inline-block text-truncate" style="max-width: 220px;" title="${Utils.escapeHtml(contract.original_filename || '-')}">
                        ${Utils.escapeHtml(contract.original_filename || '-')}
                    </span>
                    <small class="text-muted d-block">${Utils.formatFileSize(contract.file_size || 0)}</small>
                </td>
                <td>${Utils.formatDateTime(contract.upload_time)}</td>
                <td class="text-center actions-cell">
                    <button class="btn btn-sm btn-outline-dark contract-detail-btn" data-contract-id="${contract.id}" title="查看详情">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning contract-edit-btn" data-contract-id="${contract.id}" title="编辑合同">
                        <i class="bi bi-pencil-square"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary contract-pair-btn" data-contract-id="${contract.id}" title="处理配对">
                        <i class="bi bi-link-45deg"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary contract-download-btn" data-contract-id="${contract.id}" title="下载合同">
                        <i class="bi bi-download"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger contract-delete-btn" data-contract-id="${contract.id}" title="删除合同">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    Array.from(DOM.contractTableBody.querySelectorAll('tr')).forEach((row, index) => {
        const contract = filteredContracts[index];
        const chips = row.querySelector('.contract-overview-chips');
        if (chips) {
            chips.innerHTML = this.renderInvoiceReferenceChips(contract?.invoice_numbers || []);
        }
    });
};

ContractManager.bindEvents = function() {
    const debouncedLoad = Utils.debounce(async () => {
        await this.loadContracts();
    }, 300);
    const debouncedUploadPreview = Utils.debounce(async () => {
        await this.refreshUploadPreview();
    }, 250);
    const debouncedPairPreview = Utils.debounce(async () => {
        await this.refreshPairValidation();
    }, 250);

    DOM.uploadContractBtn?.addEventListener('click', async () => {
        await this.uploadContract();
    });

    DOM.openContractUploadBtn?.addEventListener('click', () => {
        this.openModal();
    });

    DOM.refreshContractsBtn?.addEventListener('click', async () => {
        await this.loadContracts();
    });

    DOM.clearContractFiltersBtn?.addEventListener('click', async () => {
        if (DOM.contractSearchInput) DOM.contractSearchInput.value = '';
        this.activeTags.clear();
        this.pairFilter = 'all';
        this.onlyShowMissing = false;
        this.sortMode = 'upload_desc';
        this.focusInvoice = '';
        this.updatePairFilterButtons();
        this.updateContractFiltersUI();
        this.renderTagFilters();
        await this.loadContracts();
    });

    DOM.contractSearchInput?.addEventListener('input', () => {
        this.focusInvoice = '';
        debouncedLoad();
    });
    DOM.contractSortSelect?.addEventListener('change', () => {
        this.sortMode = DOM.contractSortSelect?.value || 'upload_desc';
        this.render();
    });
    DOM.contractMissingOnlyToggle?.addEventListener('change', () => {
        this.onlyShowMissing = Boolean(DOM.contractMissingOnlyToggle?.checked);
        this.render();
    });
    DOM.contractInvoiceNumbersInput?.addEventListener('input', debouncedUploadPreview);
    DOM.contractPairInvoiceNumbersInput?.addEventListener('input', debouncedPairPreview);

    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-open-invoice]');
        if (!trigger) return;
        const invoiceNumber = trigger.dataset.openInvoice || '';
        if (!invoiceNumber) return;
        event.preventDefault();
        this.openInvoiceWorkspace(invoiceNumber);
    });

    DOM.contractTableBody?.addEventListener('click', async (event) => {
        const downloadBtn = event.target.closest('.contract-download-btn');
        if (downloadBtn) {
            const contractId = downloadBtn.dataset.contractId;
            const url = API.getContractDownloadUrl(contractId, false);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.target = '_blank';
            anchor.rel = 'noopener';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            return;
        }

        const detailBtn = event.target.closest('.contract-detail-btn');
        if (detailBtn) {
            await this.openDetailModal(Number(detailBtn.dataset.contractId));
            return;
        }

        const editBtn = event.target.closest('.contract-edit-btn');
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

        const pairBtn = event.target.closest('.contract-pair-btn');
        if (pairBtn) {
            const contractId = Number(pairBtn.dataset.contractId);
            const contract = this.contracts.find((item) => item.id === contractId);
            if (contract) {
                await this.openPairModal(contract);
            }
            return;
        }

        const deleteBtn = event.target.closest('.contract-delete-btn');
        if (deleteBtn) {
            await this.deleteContract(Number(deleteBtn.dataset.contractId));
        }
    });

    DOM.contractPairSaveBtn?.addEventListener('click', async () => {
        await this.savePairing();
    });

    DOM.contractPairUseCandidatesBtn?.addEventListener('click', async () => {
        if (!this.currentContract) return;
        const candidates = this.getCandidateNumbers(this.currentContract);
        if (DOM.contractPairInvoiceNumbersInput) {
            DOM.contractPairInvoiceNumbersInput.value = candidates.join('\n');
        }
        await this.refreshPairValidation();
    });

    DOM.contractPairClearBtn?.addEventListener('click', async () => {
        if (DOM.contractPairInvoiceNumbersInput) {
            DOM.contractPairInvoiceNumbersInput.value = '';
        }
        await this.refreshPairValidation();
    });

    DOM.contractDetailPairBtn?.addEventListener('click', async () => {
        if (!this.currentContract) return;
        const contract = this.contracts.find((item) => item.id === this.currentContract.id) || this.currentContract;
        this.detailModalInstance?.hide();
        await this.openPairModal(contract);
    });

    DOM.contractDetailEditBtn?.addEventListener('click', () => {
        if (!this.currentContract) return;
        this.detailModalInstance?.hide();
        this.openEditModal(this.currentContract);
    });

    DOM.contractEditSaveBtn?.addEventListener('click', async () => {
        await this.saveEdit();
    });

    DOM.resetContractFormBtn?.addEventListener('click', () => {
        this.resetUploadForm();
    });

    DOM.contractPairFilter?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-value]');
        if (!button) return;
        this.pairFilter = button.dataset.value || 'all';
        this.updatePairFilterButtons();
        this.render();
    });
};

ContractManager.initUploadUI = function() {
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
};

ContractManager.addTagFromInput = function() {
    const raw = DOM.contractTagEntryInput?.value?.trim() || '';
    if (!raw) return;
    raw.replace(/，/g, ',').split(',').forEach((tag) => this.addTag(tag.trim()));
    if (DOM.contractTagEntryInput) DOM.contractTagEntryInput.value = '';
};

ContractManager.addTag = function(tag) {
    if (!tag || this.tagValues.includes(tag)) return;
    this.tagValues.push(tag);
    this.renderTags();
};

ContractManager.removeTag = function(tag) {
    this.tagValues = this.tagValues.filter((item) => item !== tag);
    this.renderTags();
};

ContractManager.renderTags = function() {
    if (DOM.contractTagList) {
        DOM.contractTagList.innerHTML = this.tagValues.map((tag) => `
            <span class="contract-tag-chip">
                ${Utils.escapeHtml(tag)}
                <button type="button" data-tag="${Utils.escapeHtml(tag)}">&times;</button>
            </span>
        `).join('');

        DOM.contractTagList.querySelectorAll('button[data-tag]').forEach((button) => {
            button.addEventListener('click', () => {
                this.removeTag(button.dataset.tag || '');
            });
        });
    }

    if (DOM.contractTagsInput) {
        DOM.contractTagsInput.value = this.tagValues.join(', ');
    }
};

ContractManager.handleContractFile = function(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        Toast.error('合同仅支持 PDF 格式');
        return;
    }
    this.selectedFile = file;
    this.updateFileInfo(file);
};

ContractManager.updateFileInfo = function(file) {
    if (!DOM.contractFileInfo || !DOM.contractFileName || !DOM.contractFileMeta) return;
    if (!file) {
        DOM.contractFileInfo.classList.add('d-none');
        return;
    }
    DOM.contractFileName.textContent = file.name;
    DOM.contractFileMeta.textContent = `大小：${Utils.formatFileSize(file.size || 0)}`;
    DOM.contractFileInfo.classList.remove('d-none');
};

ContractManager.renderDraftPreview = function(preview = null, message = '') {
    const normalized = preview?.invoice_numbers || [];
    const found = preview?.found || [];
    const missing = preview?.missing || [];

    if (DOM.contractDraftCountBadge) {
        DOM.contractDraftCountBadge.textContent = `${normalized.length} 个候选编号`;
    }

    if (DOM.contractDraftSummary) {
        if (message) {
            DOM.contractDraftSummary.textContent = message;
        } else if (!normalized.length) {
            DOM.contractDraftSummary.textContent = '未填写候选发票编号，合同也可以直接上传';
        } else {
            DOM.contractDraftSummary.textContent = `已识别 ${normalized.length} 个候选编号，其中 ${found.length} 个已录入，${missing.length} 个缺失`;
        }
    }

    if (DOM.contractDraftInvoiceList) {
        DOM.contractDraftInvoiceList.innerHTML = this.renderInvoicePreviewList(found, missing, '候选发票会在这里展示校验结果。');
    }
};

ContractManager.refreshUploadPreview = async function() {
    const invoiceNumbers = DOM.contractInvoiceNumbersInput?.value?.trim() || '';
    const normalized = this.parseInvoiceNumbers(invoiceNumbers);

    if (!normalized.length) {
        this.renderDraftPreview({ invoice_numbers: [], found: [], missing: [] });
        return;
    }

    const requestId = ++this.uploadPreviewRequestId;
    this.renderDraftPreview({ invoice_numbers: normalized, found: [], missing: [] }, '正在校验候选发票编号...');

    try {
        const preview = await API.validateContractInvoices(invoiceNumbers);
        if (requestId !== this.uploadPreviewRequestId) return;
        this.renderDraftPreview(preview);
    } catch (error) {
        if (requestId !== this.uploadPreviewRequestId) return;
        this.renderDraftPreview({ invoice_numbers: normalized, found: [], missing: [] }, error.message || '候选发票校验失败');
    }
};

ContractManager.renderPairCandidateChips = function(invoiceNumbers) {
    if (!DOM.contractPairCandidateChips) return;

    const selected = new Set(this.parseInvoiceNumbers(DOM.contractPairInvoiceNumbersInput?.value || ''));
    if (!invoiceNumbers.length) {
        DOM.contractPairCandidateChips.innerHTML = '<span class="contract-chip-muted">暂无候选发票编号</span>';
        return;
    }

    DOM.contractPairCandidateChips.innerHTML = invoiceNumbers.map((invoiceNumber) => `
        <button type="button" class="contract-chip is-clickable ${selected.has(invoiceNumber) ? 'is-active' : ''}" data-invoice-number="${Utils.escapeHtml(invoiceNumber)}">
            ${Utils.escapeHtml(invoiceNumber)}
        </button>
    `).join('');

    DOM.contractPairCandidateChips.querySelectorAll('button[data-invoice-number]').forEach((button) => {
        button.addEventListener('click', async () => {
            const invoiceNumber = button.dataset.invoiceNumber || '';
            const current = this.parseInvoiceNumbers(DOM.contractPairInvoiceNumbersInput?.value || '');
            const next = current.includes(invoiceNumber)
                ? current.filter((item) => item !== invoiceNumber)
                : [...current, invoiceNumber];
            if (DOM.contractPairInvoiceNumbersInput) {
                DOM.contractPairInvoiceNumbersInput.value = next.join('\n');
            }
            this.renderPairCandidateChips(invoiceNumbers);
            await this.refreshPairValidation();
        });
    });
};

ContractManager.renderPairValidation = function(preview = null, message = '') {
    const normalized = preview?.invoice_numbers || [];
    const found = preview?.found || [];
    const missing = preview?.missing || [];

    if (DOM.contractPairValidationBadge) {
        DOM.contractPairValidationBadge.textContent = `${normalized.length} 个编号`;
    }

    if (DOM.contractPairValidationSummary) {
        if (message) {
            DOM.contractPairValidationSummary.textContent = message;
        } else if (!normalized.length) {
            DOM.contractPairValidationSummary.textContent = '当前为空，保存后会清空正式配对关系';
        } else {
            DOM.contractPairValidationSummary.textContent = `已识别 ${normalized.length} 个编号，其中 ${found.length} 个可配对，${missing.length} 个缺失`;
        }
    }

    if (DOM.contractPairValidationList) {
        DOM.contractPairValidationList.innerHTML = this.renderInvoicePreviewList(found, missing, '校验结果会在这里展示。');
    }

    this.pairValidationState = preview;
};

ContractManager.refreshPairValidation = async function() {
    const invoiceNumbers = DOM.contractPairInvoiceNumbersInput?.value?.trim() || '';
    const normalized = this.parseInvoiceNumbers(invoiceNumbers);
    this.renderPairCandidateChips(this.getCandidateNumbers(this.currentContract));

    if (!normalized.length) {
        this.renderPairValidation({ invoice_numbers: [], found: [], missing: [] });
        return;
    }

    const requestId = ++this.pairPreviewRequestId;
    this.renderPairValidation({ invoice_numbers: normalized, found: [], missing: [] }, '正在校验正式配对编号...');

    try {
        const preview = await API.validateContractInvoices(invoiceNumbers);
        if (requestId !== this.pairPreviewRequestId) return;
        this.renderPairValidation(preview);
    } catch (error) {
        if (requestId !== this.pairPreviewRequestId) return;
        this.renderPairValidation({ invoice_numbers: normalized, found: [], missing: [] }, error.message || '配对校验失败');
    }
};

ContractManager.resetUploadForm = function() {
    if (DOM.contractTitleInput) DOM.contractTitleInput.value = '';
    if (DOM.contractInvoiceNumbersInput) DOM.contractInvoiceNumbersInput.value = '';
    if (DOM.contractTagEntryInput) DOM.contractTagEntryInput.value = '';
    this.tagValues = [];
    this.renderTags();
    this.selectedFile = null;
    if (DOM.contractFileInput) DOM.contractFileInput.value = '';
    this.updateFileInfo(null);
    this.renderDraftPreview({ invoice_numbers: [], found: [], missing: [] });
};

ContractManager.openEditModal = function(contract) {
    if (!this.editModalInstance || !contract) return;
    this.currentContract = contract;

    if (DOM.contractEditError) {
        DOM.contractEditError.classList.add('d-none');
        DOM.contractEditError.textContent = '';
    }

    if (DOM.contractEditTitleInput) DOM.contractEditTitleInput.value = contract.contract_title || '';
    if (DOM.contractEditTagsInput) DOM.contractEditTagsInput.value = contract.contract_tags_text || '';
    if (DOM.contractEditInvoiceNumbersInput) {
        DOM.contractEditInvoiceNumbersInput.value = contract.invoice_numbers_text || '';
    }

    this.editModalInstance.show();
};

ContractManager.saveEdit = async function() {
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

        const contractId = this.currentContract.id;
        Toast.success(result.message || '合同已更新');
        this.editModalInstance?.hide();
        await this.loadContracts();
        await this.openDetailModal(contractId);
    } catch (error) {
        if (DOM.contractEditError) {
            DOM.contractEditError.textContent = error.message || '更新失败';
            DOM.contractEditError.classList.remove('d-none');
        } else {
            Toast.error(error.message || '更新失败');
        }
    }
};

ContractManager.openModal = async function() {
    if (!this.modalInstance) return;
    this.resetUploadForm();
    this.modalInstance.show();
};

ContractManager.loadContracts = async function() {
    try {
        const search = DOM.contractSearchInput?.value?.trim() || '';
        const data = await API.getContracts(search, 500);
        this.contracts = data.contracts || [];
        this.updateContractFiltersUI();
        this.renderSummaryCards();
        this.renderTagFilters();
        this.render();
    } catch (error) {
        Toast.error(error.message || '获取合同列表失败');
    }
};

ContractManager.openPairModal = async function(contract) {
    if (!this.pairModalInstance || !contract) return;

    this.currentContract = { ...contract };
    const candidateNumbers = this.getCandidateNumbers(contract);
    const title = contract.contract_title || contract.original_filename || '未命名合同';
    const fileName = contract.original_filename || '-';
    const uploadTime = contract.upload_time ? Utils.formatDateTime(contract.upload_time) : '-';

    if (DOM.contractPairMeta) {
        DOM.contractPairMeta.textContent = `${title} · ${fileName} · 上传于 ${uploadTime}`;
    }
    if (DOM.contractPairCandidates) {
        DOM.contractPairCandidates.textContent = candidateNumbers.length
            ? `候选列表共 ${candidateNumbers.length} 个编号。点击上方编号可直接加入或移出正式配对列表。`
            : '当前没有候选发票编号，可直接在右侧输入正式配对编号。';
    }
    if (DOM.contractPairInvoiceNumbersInput) {
        DOM.contractPairInvoiceNumbersInput.value = '';
    }

    this.renderPairCandidateChips(candidateNumbers);
    this.renderPairValidation({ invoice_numbers: [], found: [], missing: [] });

    try {
        const data = await API.getContractLinks(contract.id);
        const linked = data.invoice_numbers || [];
        if (DOM.contractPairInvoiceNumbersInput) {
            DOM.contractPairInvoiceNumbersInput.value = linked.length
                ? linked.join('\n')
                : candidateNumbers.join('\n');
        }
        await this.refreshPairValidation();
    } catch (error) {
        Toast.error(error.message || '获取配对信息失败');
    }

    this.pairModalInstance.show();
};

ContractManager.openDetailModal = async function(contractId) {
    if (!this.detailModalInstance || !contractId) return;

    try {
        const data = await API.getContractDetail(contractId);
        if (!data.success || !data.contract) {
            Toast.error(data.message || '获取合同详情失败');
            return;
        }

        const listRecord = this.contracts.find((item) => item.id === contractId) || {};
        const contract = { ...listRecord, ...data.contract };
        this.currentContract = contract;

        if (DOM.contractDetailTitle) {
            DOM.contractDetailTitle.textContent = contract.contract_title || contract.original_filename || '未命名合同';
        }
        if (DOM.contractDetailStatus) {
            DOM.contractDetailStatus.innerHTML = this.getStatusPillsHtml(contract);
        }
        if (DOM.contractDetailTags) {
            DOM.contractDetailTags.innerHTML = (contract.contract_tags || []).map((tag) => `
                <span class="contract-tag-badge ${this.getTagColorClass(tag)} me-1 mb-1">${Utils.escapeHtml(tag)}</span>
            `).join('') || '-';
        }
        if (DOM.contractDetailCandidates) {
            DOM.contractDetailCandidates.textContent = (contract.invoice_numbers || []).join('、') || '-';
        }
        if (DOM.contractDetailLinked) {
            DOM.contractDetailLinked.textContent = (contract.linked_invoice_numbers || []).join('、') || '-';
        }
        if (DOM.contractDetailMissing) {
            DOM.contractDetailMissing.textContent = (contract.candidate_missing_invoice_numbers || []).join('、') || '无';
        }
        if (DOM.contractDetailFilename) DOM.contractDetailFilename.textContent = contract.original_filename || '-';
        if (DOM.contractDetailUploadTime) DOM.contractDetailUploadTime.textContent = Utils.formatDateTime(contract.upload_time);
        if (DOM.contractDetailFileSize) DOM.contractDetailFileSize.textContent = Utils.formatFileSize(contract.file_size || 0);
        if (DOM.contractDetailCandidates) {
            DOM.contractDetailCandidates.innerHTML = this.renderInvoiceReferenceChips(contract.invoice_numbers || []);
        }
        if (DOM.contractDetailLinked) {
            DOM.contractDetailLinked.innerHTML = this.renderInvoiceReferenceChips(contract.linked_invoice_numbers || []);
        }
        if (DOM.contractDetailMissing) {
            DOM.contractDetailMissing.innerHTML = this.renderInvoiceReferenceChips(contract.candidate_missing_invoice_numbers || [], 'is-missing');
        }
        if (DOM.contractDetailCandidateList) {
            DOM.contractDetailCandidateList.innerHTML = this.renderInvoicePreviewList(
                contract.candidate_invoice_details || [],
                contract.candidate_missing_invoice_numbers || [],
                '暂无候选发票'
            );
        }
        if (DOM.contractDetailLinkedList) {
            DOM.contractDetailLinkedList.innerHTML = this.renderInvoicePreviewList(
                contract.linked_invoice_details || [],
                contract.linked_missing_invoice_numbers || [],
                '暂无已配对发票'
            );
        }
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
};

ContractManager.savePairing = async function() {
    if (!this.currentContract) return;

    const invoiceNumbers = DOM.contractPairInvoiceNumbersInput?.value?.trim() || '';
    const missing = this.pairValidationState?.missing || [];
    if (missing.length) {
        Toast.error(`仍有未录入的发票编号：${missing.join('、')}`);
        return;
    }

    try {
        const result = await API.updateContractLinks(this.currentContract.id, invoiceNumbers);
        if (!result.success) {
            const missingInvoiceNumbers = result.missing_invoice_numbers || [];
            if (missingInvoiceNumbers.length) {
                Toast.error(`未找到发票：${missingInvoiceNumbers.join('、')}`);
            } else {
                Toast.error(result.message || '配对失败');
            }
            return;
        }

        const contractId = this.currentContract.id;
        Toast.success(result.message || '配对成功');
        this.pairModalInstance?.hide();
        await this.loadContracts();
        await this.openDetailModal(contractId);
    } catch (error) {
        Toast.error(error.message || '配对失败');
    }
};

ContractManager.uploadContract = async function() {
    const invoiceNumbers = DOM.contractInvoiceNumbersInput?.value?.trim() || '';
    const file = this.selectedFile || DOM.contractFileInput?.files?.[0];
    const tags = DOM.contractTagsInput?.value?.trim() || '';
    const contractTitle = DOM.contractTitleInput?.value?.trim() || '';

    if (!file) {
        Toast.error('请选择合同 PDF 文件');
        return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        Toast.error('合同仅支持 PDF 格式');
        return;
    }

    try {
        const result = await API.createContract(invoiceNumbers, file, tags, contractTitle);
        if (!result.success) {
            Toast.error(result.message || '上传合同失败');
            return;
        }

        const createdContractId = result.contract?.id;
        Toast.success(result.message || '合同上传成功');
        this.resetUploadForm();
        if (this.modalInstance) {
            this.modalInstance.hide();
            await new Promise((resolve) => window.setTimeout(resolve, 180));
        }
        await this.loadContracts();
        if (createdContractId) {
            await this.openDetailModal(createdContractId);
        }
    } catch (error) {
        Toast.error(error.message || '上传合同失败');
    }
};

ContractManager.deleteContract = async function(contractId) {
    if (!contractId) return;
    if (!confirm('确认删除该合同吗？此操作不可撤销。')) return;

    try {
        const result = await API.deleteContract(contractId);
        if (!result.success) {
            Toast.error(result.message || '合同删除失败');
            return;
        }

        if (this.currentContract?.id === contractId) {
            this.currentContract = null;
            this.detailModalInstance?.hide();
            this.editModalInstance?.hide();
            this.pairModalInstance?.hide();
        }

        Toast.success(result.message || '合同删除成功');
        await this.loadContracts();
    } catch (error) {
        Toast.error(error.message || '合同删除失败');
    }
};
