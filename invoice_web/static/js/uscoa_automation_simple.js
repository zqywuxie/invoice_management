(() => {
    const state = {
        meta: null,
        submitting: false,
        pollingTimer: null,
        taskId: '',
        lastEventCount: 0,
    };

    const elements = {};
    const ALL_STEPS = ['login', 'navigate', 'open_form', 'fill_form', 'save_draft', 'upload_attachment', 'complete'];

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheElements();
        bindEvents();
        resetProcessView();

        try {
            const auth = await requestJson('/api/auth/status');
            if (!auth.logged_in) {
                window.location.href = '/';
                return;
            }
            if (!auth.user?.is_admin) {
                disableForm(true);
                showFormError('当前账号没有管理员权限。');
                return;
            }

            await loadMeta();
            appendLog('元数据加载完成。');
        } catch (error) {
            disableForm(true);
            showFormError(error.message || '初始化失败');
            appendLog(`初始化失败: ${error.message || 'unknown error'}`);
        }
    }

    function cacheElements() {
        elements.form = document.getElementById('simpleUscoaForm');
        elements.subject = document.getElementById('simpleSubject');
        elements.stampOptions = document.getElementById('simpleStampOptions');
        elements.contractAmount = document.getElementById('simpleContractAmount');
        elements.phone = document.getElementById('simplePhone');
        elements.description = document.getElementById('simpleDescription');
        elements.remark = document.getElementById('simpleRemark');
        elements.attachments = document.getElementById('simpleAttachments');
        elements.attachmentHint = document.getElementById('simpleAttachmentHint');
        elements.attachmentNames = document.getElementById('simpleAttachmentNames');
        elements.formError = document.getElementById('simpleFormError');
        elements.fillOnlyBtn = document.getElementById('simpleFillOnlyBtn');
        elements.saveDraftBtn = document.getElementById('simpleSaveDraftBtn');
        elements.runBadge = document.getElementById('simpleRunBadge');
        elements.runLog = document.getElementById('simpleRunLog');
        elements.resultJson = document.getElementById('simpleResultJson');
        elements.stepList = document.getElementById('simpleStepList');
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
            renderSelectedAttachmentNames();
        });
    }

    async function loadMeta() {
        appendLog('读取 OA 表单元数据...');
        const meta = await requestJson('/api/uscoa/research-seal/meta');
        state.meta = meta;
        renderStampOptions(meta.form_template?.stamp_options || []);
        applyAttachmentConstraints(meta.form_template?.attachment_constraints || {});
        renderSelectedAttachmentNames();
    }

    function renderStampOptions(options) {
        elements.stampOptions.innerHTML = '';
        const normalized = Array.isArray(options) ? options : [];

        normalized.forEach((item, index) => {
            const wrapper = document.createElement('label');
            wrapper.className = 'form-check border rounded p-2';

            const input = document.createElement('input');
            input.className = 'form-check-input';
            input.type = 'checkbox';
            input.name = 'simpleSealTypes';
            input.value = item.label || '';
            input.id = `simpleSealType_${index}`;

            const text = document.createElement('span');
            text.className = 'form-check-label ms-2';
            text.textContent = item.label || '';

            wrapper.appendChild(input);
            wrapper.appendChild(text);
            elements.stampOptions.appendChild(wrapper);
        });
    }

    function applyAttachmentConstraints(constraints) {
        if (!elements.attachments || !elements.attachmentHint) {
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

        const hints = [];
        if (maxCount > 0) {
            hints.push(`最多 ${maxCount} 个`);
        }
        if (maxFileSizeMb > 0) {
            hints.push(`单个 <= ${maxFileSizeMb} MB`);
        }
        if (maxTotalSizeMb > 0) {
            hints.push(`总计 <= ${maxTotalSizeMb} MB`);
        }
        if (allowedExtensions.length) {
            hints.push(`格式: ${allowedExtensions.map((item) => `.${item}`).join('、')}`);
        }
        elements.attachmentHint.textContent = hints.length ? hints.join('；') : '支持多附件上传。';
    }

    function renderSelectedAttachmentNames() {
        const files = getSelectedFiles();
        if (elements.fillOnlyBtn) {
            elements.fillOnlyBtn.disabled = state.submitting || files.length > 0;
        }
        if (!files.length) {
            elements.attachmentNames.textContent = '未选择附件。';
            return;
        }
        elements.attachmentNames.textContent = `已选择: ${files.map((file) => file.name).join('；')}`;
    }

    async function submit(action) {
        if (state.submitting) {
            return;
        }

        hideFormError();
        const payload = collectPayload(action);
        const validationMessage = validatePayload(payload);
        if (validationMessage) {
            showFormError(validationMessage);
            return;
        }

        setSubmitting(true);
        resetProcessView();
        elements.resultJson.textContent = '任务创建中...';
        appendLog(`创建任务: ${action}`);

        try {
            const task = await startTask(payload);
            state.taskId = task.id || '';
            state.lastEventCount = 0;
            appendLog(`任务已启动: ${state.taskId}`);
            applyTaskSnapshot(task);
            await pollTaskUntilDone();
        } catch (error) {
            setRunBadge('失败', 'danger');
            showFormError(error.message || '执行失败');
            appendLog(`执行失败: ${error.message || 'unknown error'}`);
            elements.resultJson.textContent = JSON.stringify({ success: false, message: error.message }, null, 2);
        } finally {
            stopPolling();
            state.taskId = '';
            setSubmitting(false);
        }
    }

    async function startTask(payload) {
        const formData = new FormData();
        formData.append('subject', payload.subject);
        formData.append('contract_amount', payload.contract_amount);
        formData.append('description', payload.description);
        formData.append('phone', payload.phone);
        formData.append('remark', payload.remark);
        formData.append('action', payload.action);
        payload.seal_types.forEach((item) => formData.append('seal_types', item));
        payload.attachments.forEach((file) => formData.append('attachments', file, file.name));

        const response = await requestJson('/api/uscoa/research-seal/task-start', {
            method: 'POST',
            body: formData,
        });
        return response.task || {};
    }

    async function pollTaskUntilDone() {
        stopPolling();
        return new Promise((resolve, reject) => {
            let running = true;
            const pollOnce = async () => {
                if (!running || !state.taskId) {
                    return;
                }
                try {
                    const response = await requestJson(`/api/uscoa/research-seal/task/${state.taskId}`);
                    const task = response.task || {};
                    applyTaskSnapshot(task);

                    if (task.status === 'success') {
                        running = false;
                        resolve(task);
                        return;
                    }
                    if (task.status === 'failed') {
                        running = false;
                        reject(new Error(task.error || task.message || '任务执行失败'));
                        return;
                    }
                } catch (error) {
                    running = false;
                    reject(error);
                    return;
                }
            };

            state.pollingTimer = window.setInterval(pollOnce, 1200);
            pollOnce().catch(reject);
        });
    }

    function stopPolling() {
        if (state.pollingTimer) {
            window.clearInterval(state.pollingTimer);
            state.pollingTimer = null;
        }
    }

    function applyTaskSnapshot(task) {
        if (!task || typeof task !== 'object') {
            return;
        }

        applyTaskStatus(task.status || 'queued');
        applyTaskSteps(task.steps || {});
        flushTaskEvents(task.events || []);

        if (task.result) {
            elements.resultJson.textContent = JSON.stringify(task.result, null, 2);
        } else {
            elements.resultJson.textContent = JSON.stringify(task, null, 2);
        }
    }

    function applyTaskStatus(status) {
        if (status === 'running') {
            setRunBadge('执行中', 'warning');
            return;
        }
        if (status === 'success') {
            setRunBadge('成功', 'success');
            return;
        }
        if (status === 'failed') {
            setRunBadge('失败', 'danger');
            return;
        }
        setRunBadge('待执行', 'secondary');
    }

    function applyTaskSteps(steps) {
        ALL_STEPS.forEach((step) => {
            const stateInfo = steps[step] || { status: 'pending', message: '等待执行' };
            updateStep(step, stateInfo.status || 'pending', stateInfo.message || '');
        });
    }

    function flushTaskEvents(events) {
        const eventList = Array.isArray(events) ? events : [];
        if (state.lastEventCount > eventList.length) {
            state.lastEventCount = 0;
        }
        const delta = eventList.slice(state.lastEventCount);
        delta.forEach((event) => {
            const time = event.time || '-';
            const title = stepTitle(event.step || 'complete');
            appendLog(`${time} ${title} [${event.status || 'pending'}] ${event.message || ''}`);
        });
        state.lastEventCount = eventList.length;
    }

    function collectPayload(action) {
        const sealTypes = Array.from(document.querySelectorAll('input[name="simpleSealTypes"]:checked'))
            .map((input) => input.value)
            .filter(Boolean);
        return {
            subject: elements.subject.value.trim(),
            seal_types: sealTypes,
            contract_amount: elements.contractAmount.value.trim(),
            description: elements.description.value.trim(),
            phone: elements.phone.value.trim(),
            remark: elements.remark.value.trim(),
            attachments: getSelectedFiles(),
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
            return '存在附件时，只能选择“保存草稿并执行”。';
        }
        return validateAttachments(payload.attachments);
    }

    function validateAttachments(files) {
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

        let total = 0;
        for (const file of files) {
            const name = String(file.name || '');
            const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
            if (allowedExtensions.size > 0 && !allowedExtensions.has(ext)) {
                return `附件格式不支持: ${name}`;
            }
            const size = Number(file.size || 0);
            if (maxFileSizeBytes > 0 && size > maxFileSizeBytes) {
                return `附件过大: ${name}，单个不能超过 ${formatSize(maxFileSizeBytes)}。`;
            }
            total += size;
        }

        if (maxTotalSizeBytes > 0 && total > maxTotalSizeBytes) {
            return `附件总大小不能超过 ${formatSize(maxTotalSizeBytes)}。`;
        }

        return '';
    }

    function resetProcessView() {
        updateStep('login', 'pending', '等待执行');
        updateStep('navigate', 'pending', '等待执行');
        updateStep('open_form', 'pending', '等待执行');
        updateStep('fill_form', 'pending', '等待执行');
        updateStep('save_draft', 'pending', '等待执行');
        updateStep('upload_attachment', 'pending', '等待执行');
        updateStep('complete', 'pending', '等待执行');
        elements.runLog.textContent = '准备就绪，等待执行。';
        setRunBadge('未执行', 'secondary');
        state.lastEventCount = 0;
    }

    function updateStep(stepId, status, detail) {
        const item = elements.stepList.querySelector(`[data-step-id="${stepId}"]`);
        if (!item) {
            return;
        }

        item.classList.remove('is-pending', 'is-running', 'is-success', 'is-failed', 'is-skipped');
        item.classList.add(`is-${status}`);

        const badge = item.querySelector('.badge');
        const detailNode = item.querySelector('.small.text-muted');
        if (badge) {
            badge.className = `badge ${badgeClassForStatus(status)}`;
            badge.textContent = badgeTextForStatus(status);
        }
        if (detailNode) {
            detailNode.textContent = detail || '';
        }
    }

    function badgeClassForStatus(status) {
        if (status === 'running') {
            return 'text-bg-warning';
        }
        if (status === 'success') {
            return 'text-bg-success';
        }
        if (status === 'failed') {
            return 'text-bg-danger';
        }
        if (status === 'skipped') {
            return 'text-bg-secondary';
        }
        return 'text-bg-light';
    }

    function badgeTextForStatus(status) {
        if (status === 'running') {
            return '执行中';
        }
        if (status === 'success') {
            return '成功';
        }
        if (status === 'failed') {
            return '失败';
        }
        if (status === 'skipped') {
            return '跳过';
        }
        return '待执行';
    }

    function stepTitle(stepId) {
        if (stepId === 'login') {
            return '登录 OA';
        }
        if (stepId === 'navigate') {
            return '菜单跳转';
        }
        if (stepId === 'open_form') {
            return '进入表单';
        }
        if (stepId === 'fill_form') {
            return '填充表单';
        }
        if (stepId === 'save_draft') {
            return '保存草稿';
        }
        if (stepId === 'upload_attachment') {
            return '上传附件';
        }
        return '完成';
    }

    function appendLog(message) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const line = `[${hh}:${mm}:${ss}] ${message}`;
        elements.runLog.textContent = `${elements.runLog.textContent}\n${line}`;
        elements.runLog.scrollTop = elements.runLog.scrollHeight;
    }

    function getSelectedFiles() {
        return Array.from(elements.attachments?.files || []);
    }

    function setSubmitting(submitting) {
        state.submitting = submitting;
        const disabled = Boolean(submitting);
        elements.subject.disabled = disabled;
        elements.contractAmount.disabled = disabled;
        elements.phone.disabled = disabled;
        elements.description.disabled = disabled;
        elements.remark.disabled = disabled;
        elements.attachments.disabled = disabled;
        elements.fillOnlyBtn.disabled = disabled || getSelectedFiles().length > 0;
        elements.saveDraftBtn.disabled = disabled;
        document.querySelectorAll('input[name="simpleSealTypes"]').forEach((input) => {
            input.disabled = disabled;
        });
    }

    function setRunBadge(text, type) {
        elements.runBadge.className = `badge text-bg-${type || 'secondary'}`;
        elements.runBadge.textContent = text;
    }

    function showFormError(message) {
        elements.formError.textContent = message;
        elements.formError.classList.remove('d-none');
    }

    function hideFormError() {
        elements.formError.textContent = '';
        elements.formError.classList.add('d-none');
    }

    function disableForm(disabled) {
        elements.subject.disabled = disabled;
        elements.contractAmount.disabled = disabled;
        elements.phone.disabled = disabled;
        elements.description.disabled = disabled;
        elements.remark.disabled = disabled;
        elements.attachments.disabled = disabled;
        elements.fillOnlyBtn.disabled = disabled;
        elements.saveDraftBtn.disabled = disabled;
        document.querySelectorAll('input[name="simpleSealTypes"]').forEach((input) => {
            input.disabled = disabled;
        });
    }

    function formatSize(bytes) {
        if (bytes >= 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
        if (bytes >= 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${bytes} B`;
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
