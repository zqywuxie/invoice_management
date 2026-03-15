(() => {
    const state = {
        submitting: false,
        meta: null,
    };

    const elements = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheElements();
        bindEvents();

        try {
            const auth = await requestJson('/api/auth/status');
            if (!auth.logged_in) {
                window.location.href = '/';
                return;
            }

            updateCurrentUser(auth.user || {});
            if (!auth.user?.is_admin) {
                disableForm(true);
                showFormError('当前账号没有管理员权限，无法使用 OA 自动填报页面。');
                return;
            }

            await loadMeta();
        } catch (error) {
            disableForm(true);
            showGuideStatus(error.message || '初始化失败', true);
            showResult(false, { message: error.message || '初始化失败' });
        }
    }

    function cacheElements() {
        elements.form = document.getElementById('uscoaAutofillForm');
        elements.subject = document.getElementById('uscoaSubject');
        elements.contractAmount = document.getElementById('uscoaContractAmount');
        elements.description = document.getElementById('uscoaDescription');
        elements.phone = document.getElementById('uscoaPhone');
        elements.remark = document.getElementById('uscoaRemark');
        elements.attachments = document.getElementById('uscoaAttachments');
        elements.attachmentHint = document.getElementById('attachmentHint');
        elements.attachmentFileList = document.getElementById('attachmentFileList');
        elements.attachmentEmptyState = document.getElementById('attachmentEmptyState');
        elements.stampOptions = document.getElementById('stampOptionsContainer');
        elements.fillOnlyBtn = document.getElementById('fillOnlyBtn');
        elements.saveDraftBtn = document.getElementById('saveDraftBtn');
        elements.formErrorBox = document.getElementById('formErrorBox');
        elements.guideStatus = document.getElementById('guideStatus');
        elements.guidePanel = document.getElementById('guidePanel');
        elements.guideTitle = document.getElementById('guideTitle');
        elements.guideSectionTitle = document.getElementById('guideSectionTitle');
        elements.guideResponsibleList = document.getElementById('guideResponsibleList');
        elements.guideNoteList = document.getElementById('guideNoteList');
        elements.guideBadge = document.getElementById('guideBadge');
        elements.resultBadge = document.getElementById('resultBadge');
        elements.resultMessage = document.getElementById('resultMessage');
        elements.resultMeta = document.getElementById('resultMeta');
        elements.resultOutput = document.querySelector('.result-output');
        elements.currentUserName = document.getElementById('currentUserName');
        elements.logoutBtn = document.getElementById('logoutBtn');
        elements.userManagementBtn = document.getElementById('userManagementBtn');
    }

    function bindEvents() {
        elements.form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await submit('save_draft');
        });

        elements.fillOnlyBtn?.addEventListener('click', async () => {
            await submit('fill_only');
        });

        elements.attachments?.addEventListener('change', () => {
            renderSelectedFiles();
        });

        elements.logoutBtn?.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                await requestJson('/api/auth/logout', { method: 'POST' });
            } finally {
                window.location.href = '/';
            }
        });
    }

    async function loadMeta() {
        showGuideStatus('正在读取 OA 页面元数据...', false);
        const response = await requestJson('/api/uscoa/research-seal/meta');
        state.meta = response;
        renderGuide(response.guide || {});
        renderStampOptions(response.form_template?.stamp_options || []);
        applyAttachmentConstraints(response.form_template?.attachment_constraints || {});
        renderSelectedFiles();
        showGuideStatus('', false, true);
    }

    function renderGuide(guide) {
        elements.guideTitle.textContent = guide.title || '温馨提示';
        elements.guideSectionTitle.textContent = guide.sectionTitle || '科研部相关业务负责人信息如下';
        elements.guideBadge.textContent = guide.guideKey || '科研事项用印';

        elements.guideResponsibleList.innerHTML = '';
        const responsibles = Array.isArray(guide.responsibles) ? guide.responsibles : [];
        responsibles.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'd-flex justify-content-between align-items-start gap-3';

            const category = document.createElement('div');
            category.className = 'small';
            category.textContent = item.category || '-';

            const owner = document.createElement('span');
            owner.className = 'guide-owner';
            owner.textContent = item.owner || '-';

            li.appendChild(category);
            li.appendChild(owner);
            elements.guideResponsibleList.appendChild(li);
        });

        if (!responsibles.length) {
            const li = document.createElement('li');
            li.className = 'text-muted small';
            li.textContent = '未提取到负责人信息。';
            elements.guideResponsibleList.appendChild(li);
        }

        elements.guideNoteList.innerHTML = '';
        const notes = Array.isArray(guide.notes) ? guide.notes : [];
        notes.forEach((note) => {
            const li = document.createElement('li');
            li.className = 'small text-muted';
            li.textContent = note;
            elements.guideNoteList.appendChild(li);
        });

        if (!notes.length) {
            const li = document.createElement('li');
            li.className = 'text-muted small';
            li.textContent = '暂无额外须知。';
            elements.guideNoteList.appendChild(li);
        }
    }

    function renderStampOptions(options) {
        elements.stampOptions.innerHTML = '';
        const normalized = Array.isArray(options) ? options : [];

        normalized.forEach((option, index) => {
            const label = document.createElement('label');
            label.className = 'stamp-option';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-check-input';
            input.name = 'sealTypes';
            input.value = option.label || '';
            input.id = `sealType_${index}`;

            const text = document.createElement('span');
            text.className = 'small fw-medium';
            text.textContent = option.label || '';

            label.appendChild(input);
            label.appendChild(text);
            elements.stampOptions.appendChild(label);
        });
    }

    function renderSelectedFiles() {
        const files = getSelectedFiles();
        elements.attachmentFileList.innerHTML = '';

        if (!files.length) {
            elements.attachmentFileList.classList.add('d-none');
            elements.attachmentEmptyState.classList.remove('d-none');
            elements.attachmentEmptyState.textContent = '当前未选择附件。';
            return;
        }

        files.forEach((file) => {
            const li = document.createElement('li');
            li.className = 'd-flex justify-content-between align-items-center gap-3 small';

            const name = document.createElement('span');
            name.textContent = file.name;

            const size = document.createElement('span');
            size.className = 'text-muted';
            size.textContent = formatFileSize(file.size);

            li.appendChild(name);
            li.appendChild(size);
            elements.attachmentFileList.appendChild(li);
        });

        elements.attachmentFileList.classList.remove('d-none');
        elements.attachmentEmptyState.classList.add('d-none');
    }

    function applyAttachmentConstraints(constraints) {
        if (!elements.attachments) {
            return;
        }

        const maxCount = Number(constraints.max_count || 0);
        const maxFileSizeMb = Number(constraints.max_file_size_mb || 0);
        const maxTotalSizeMb = Number(constraints.max_total_size_mb || 0);
        const allowedExtensions = Array.isArray(constraints.allowed_extensions) ? constraints.allowed_extensions : [];
        const accept = typeof constraints.accept === 'string' ? constraints.accept : '';

        if (accept) {
            elements.attachments.setAttribute('accept', accept);
        }

        const messages = ['支持一次选择多个文件。若上传附件，OA 会先自动保存草稿，再进入附件页面执行上传。'];
        if (maxCount > 0) {
            messages.push(`最多 ${maxCount} 个附件`);
        }
        if (maxFileSizeMb > 0) {
            messages.push(`单个不超过 ${maxFileSizeMb} MB`);
        }
        if (maxTotalSizeMb > 0) {
            messages.push(`总计不超过 ${maxTotalSizeMb} MB`);
        }
        if (allowedExtensions.length) {
            messages.push(`格式：${allowedExtensions.map((item) => `.${item}`).join('、')}`);
        }
        if (elements.attachmentHint) {
            elements.attachmentHint.textContent = messages.join('；') + '。';
        }
    }

    async function submit(action) {
        if (state.submitting) {
            return;
        }

        hideFormError();
        const payload = collectPayload(action);
        const validationError = validatePayload(payload);
        if (validationError) {
            showFormError(validationError);
            return;
        }

        setSubmitting(true, action);
        showResult(true, {
            message: payload.attachments.length
                ? '正在执行自动填报、保存草稿并上传附件...'
                : action === 'fill_only'
                    ? '正在执行自动填充...'
                    : '正在执行自动填报并保存草稿...'
        }, true);

        try {
            const response = await submitAutofill(payload);
            showResult(true, response, false);
        } catch (error) {
            showFormError(error.message || '提交失败');
            showResult(false, { message: error.message || '提交失败' }, false);
        } finally {
            setSubmitting(false, action);
        }
    }

    function collectPayload(action) {
        const sealTypes = Array.from(document.querySelectorAll('input[name="sealTypes"]:checked'))
            .map((input) => input.value)
            .filter(Boolean);
        const attachments = getSelectedFiles();

        return {
            subject: elements.subject.value.trim(),
            seal_types: sealTypes,
            contract_amount: elements.contractAmount.value.trim(),
            description: elements.description.value.trim(),
            phone: elements.phone.value.trim(),
            remark: elements.remark.value.trim(),
            attachments,
            action,
        };
    }

    function validatePayload(payload) {
        if (!payload.subject) {
            return '申办内容不能为空。';
        }
        if (!payload.seal_types.length) {
            return '至少选择一种用印类型。';
        }
        if (!payload.description) {
            return '事项说明不能为空。';
        }
        if (!payload.phone) {
            return '联系电话不能为空。';
        }
        if (payload.attachments.length && payload.action !== 'save_draft') {
            return '上传附件时只能使用“自动填报并保存草稿”。';
        }
        const attachmentError = validateAttachments(payload.attachments);
        if (attachmentError) {
            return attachmentError;
        }
        return '';
    }

    function validateAttachments(files) {
        if (!files.length) {
            return '';
        }

        const constraints = state.meta?.form_template?.attachment_constraints || {};
        const maxCount = Number(constraints.max_count || 0);
        const maxFileSizeBytes = Number(constraints.max_file_size_bytes || 0);
        const maxTotalSizeBytes = Number(constraints.max_total_size_bytes || 0);
        const allowedExtensions = new Set(
            (Array.isArray(constraints.allowed_extensions) ? constraints.allowed_extensions : [])
                .map((item) => String(item || '').trim().toLowerCase())
                .filter(Boolean)
        );

        if (maxCount > 0 && files.length > maxCount) {
            return `附件数量不能超过 ${maxCount} 个。`;
        }

        let totalSize = 0;
        for (const file of files) {
            const fileName = String(file.name || '');
            const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
            if (allowedExtensions.size > 0 && !allowedExtensions.has(extension)) {
                return `附件格式不支持：${fileName}。`;
            }
            if (maxFileSizeBytes > 0 && Number(file.size || 0) > maxFileSizeBytes) {
                return `附件过大：${fileName}，单个不能超过 ${formatFileSize(maxFileSizeBytes)}。`;
            }
            totalSize += Number(file.size || 0);
        }

        if (maxTotalSizeBytes > 0 && totalSize > maxTotalSizeBytes) {
            return `附件总大小不能超过 ${formatFileSize(maxTotalSizeBytes)}。`;
        }

        return '';
    }

    async function submitAutofill(payload) {
        const formData = new FormData();
        formData.append('subject', payload.subject);
        formData.append('contract_amount', payload.contract_amount);
        formData.append('description', payload.description);
        formData.append('phone', payload.phone);
        formData.append('remark', payload.remark);
        formData.append('action', payload.action);
        payload.seal_types.forEach((item) => {
            formData.append('seal_types', item);
        });
        payload.attachments.forEach((file) => {
            formData.append('attachments', file, file.name);
        });

        return requestJson('/api/uscoa/research-seal/autofill', {
            method: 'POST',
            body: formData,
        });
    }

    function getSelectedFiles() {
        return Array.from(elements.attachments?.files || []);
    }

    function setSubmitting(isSubmitting, action) {
        state.submitting = isSubmitting;
        const hasAttachments = getSelectedFiles().length > 0;
        const fillOnlyText = isSubmitting && action === 'fill_only' ? '执行中...' : '仅填充不保存';
        const saveDraftText = isSubmitting
            ? (hasAttachments ? '上传中...' : '执行中...')
            : '自动填报并保存草稿';

        elements.fillOnlyBtn.disabled = isSubmitting || hasAttachments;
        elements.saveDraftBtn.disabled = isSubmitting;
        if (hasAttachments) {
            elements.fillOnlyBtn.classList.add('disabled');
        } else {
            elements.fillOnlyBtn.classList.remove('disabled');
        }
        elements.fillOnlyBtn.innerHTML = `<i class="bi bi-input-cursor-text me-1"></i>${fillOnlyText}`;
        elements.saveDraftBtn.innerHTML = `<i class="bi bi-lightning-charge me-1"></i>${saveDraftText}`;
    }

    function showGuideStatus(message, isError, hidePanel = false) {
        if (!elements.guideStatus) {
            return;
        }

        if (hidePanel) {
            elements.guideStatus.classList.add('d-none');
            elements.guidePanel.classList.remove('d-none');
            return;
        }

        elements.guideStatus.className = `alert ${isError ? 'alert-danger' : 'alert-info'} mb-0`;
        elements.guideStatus.textContent = message;
        elements.guideStatus.classList.remove('d-none');
        elements.guidePanel.classList.add('d-none');
    }

    function showFormError(message) {
        elements.formErrorBox.textContent = message;
        elements.formErrorBox.classList.remove('d-none');
    }

    function hideFormError() {
        elements.formErrorBox.textContent = '';
        elements.formErrorBox.classList.add('d-none');
    }

    function showResult(success, payload, pending = false) {
        elements.resultBadge.className = 'badge';
        if (pending) {
            elements.resultBadge.classList.add('text-bg-warning');
            elements.resultBadge.textContent = '执行中';
        } else if (success) {
            elements.resultBadge.classList.add('text-bg-success');
            elements.resultBadge.textContent = '成功';
        } else {
            elements.resultBadge.classList.add('text-bg-danger');
            elements.resultBadge.textContent = '失败';
        }

        elements.resultMessage.textContent = payload.message || (success ? '执行完成' : '执行失败');
        renderResultMeta(payload, pending);

        const automationResult = payload.automation?.result || payload.automation || payload;
        elements.resultOutput.textContent = JSON.stringify(automationResult, null, 2);
    }

    function renderResultMeta(payload, pending) {
        elements.resultMeta.innerHTML = '';

        if (pending) {
            appendMetaItem('状态', '自动化脚本正在运行，请等待浏览器流程结束。');
            return;
        }

        const result = payload.automation?.result || {};
        const request = payload.request || {};
        const attachmentSummary = payload.attachment_summary || {};
        const dialogs = result.actionResult?.dialogs || [];
        const attachments = request.attachments || [];

        if (request.subject) {
            appendMetaItem('申办内容', request.subject);
        }
        if (Array.isArray(request.seal_types) && request.seal_types.length) {
            appendMetaItem('用印类型', request.seal_types.join('、'));
        }
        if (attachments.length) {
            appendMetaItem('附件', attachments.map((item) => item.name || item.path || '-').join('；'));
        }
        if (attachments.length && Object.keys(attachmentSummary).length) {
            const uploadStatus = attachmentSummary.success ? '成功' : '失败';
            appendMetaItem(
                '附件上传',
                `${uploadStatus}（${attachmentSummary.matched_count || 0}/${attachmentSummary.requested_count || attachments.length}）`
            );
        }
        if (result.action) {
            appendMetaItem('执行动作', result.action);
        }
        if (result.sourceUrl) {
            appendMetaItem('页面地址', result.sourceUrl);
        }
        if (result.artifacts?.jsonPath) {
            appendMetaItem('结果文件', result.artifacts.jsonPath);
        }
        if (dialogs.length) {
            appendMetaItem('系统提示', dialogs.map((item) => item.message).join(' | '));
        }
        if (result.attachmentResult?.artifacts?.jsonPath) {
            appendMetaItem('附件页产物', result.attachmentResult.artifacts.jsonPath);
        }
        if (attachmentSummary.record_id) {
            appendMetaItem('记录编号', attachmentSummary.record_id);
        }
        if (Array.isArray(attachmentSummary.missing_files) && attachmentSummary.missing_files.length) {
            appendMetaItem('未确认附件', attachmentSummary.missing_files.join('；'));
        }
        if (attachmentSummary.artifacts?.jsonPath) {
            appendMetaItem('附件诊断', attachmentSummary.artifacts.jsonPath);
        }

        if (!elements.resultMeta.childElementCount) {
            appendMetaItem('状态', payload.message || '暂无详细结果');
        }
    }

    function appendMetaItem(label, value) {
        const row = document.createElement('div');
        row.className = 'result-meta-item';

        const title = document.createElement('div');
        title.className = 'small text-muted mb-1';
        title.textContent = label;

        const body = document.createElement('div');
        body.className = 'small';
        body.textContent = value || '-';

        row.appendChild(title);
        row.appendChild(body);
        elements.resultMeta.appendChild(row);
    }

    function updateCurrentUser(user) {
        if (elements.currentUserName) {
            elements.currentUserName.textContent = user.display_name || user.username || '已登录';
        }
        if (elements.userManagementBtn) {
            elements.userManagementBtn.style.display = 'none';
        }
    }

    function disableForm(disabled) {
        elements.subject.disabled = disabled;
        elements.contractAmount.disabled = disabled;
        elements.description.disabled = disabled;
        elements.phone.disabled = disabled;
        elements.remark.disabled = disabled;
        elements.attachments.disabled = disabled;
        elements.fillOnlyBtn.disabled = disabled;
        elements.saveDraftBtn.disabled = disabled;
        document.querySelectorAll('input[name="sealTypes"]').forEach((input) => {
            input.disabled = disabled;
        });
    }

    function formatFileSize(bytes) {
        const size = Number(bytes || 0);
        if (size <= 0) {
            return '0 B';
        }
        if (size < 1024) {
            return `${size} B`;
        }
        if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(1)} KB`;
        }
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    async function requestJson(url, options = {}) {
        const headers = new Headers(options.headers || {});
        if (!headers.has('Accept')) {
            headers.set('Accept', 'application/json');
        }

        const response = await fetch(url, { ...options, headers });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : { message: (await response.text()).trim() || `Request failed (${response.status})` };

        if (!response.ok) {
            if (data.need_login) {
                window.location.href = '/';
                throw new Error('请先登录');
            }
            throw new Error(data.message || `Request failed (${response.status})`);
        }

        return data;
    }
})();
