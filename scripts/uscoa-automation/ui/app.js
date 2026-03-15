const RESEARCH_SEAL_KEY = '科研事项用印';
const RESEARCH_SEAL_GUIDE_KEY = 'research-seal';
const SELECTED_TEACHER_STORAGE_KEY = 'uscoa_research_seal_teacher';
const DEFAULT_SEAL_OPTIONS = [
  { value: 'party_committee_seal', label: '学校党委章' },
  { value: 'administration_seal', label: '学校行政章' },
  { value: 'party_secretary_seal', label: '党委书记印' },
  { value: 'president_seal', label: '校长印' },
  { value: 'school_steel_seal', label: '学校钢印' },
  { value: 'contract_seal', label: '合同用印' },
];

const form = document.getElementById('configForm');
const configHint = document.getElementById('configHint');
const runState = document.getElementById('runState');
const serverTime = document.getElementById('serverTime');
const messageBar = document.getElementById('messageBar');
const stopRunBtn = document.getElementById('stopRunBtn');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const refreshStatusBtn = document.getElementById('refreshStatusBtn');
const reloadConfigBtn = document.getElementById('reloadConfigBtn');
const openTeacherModalBtn = document.getElementById('openTeacherModalBtn');
const openConfigModalBtn = document.getElementById('openConfigModalBtn');
const teacherModal = document.getElementById('teacherModal');
const configModal = document.getElementById('configModal');

const summaryConfigValue = document.getElementById('summaryConfigValue');
const summaryConfigMeta = document.getElementById('summaryConfigMeta');
const summarySessionValue = document.getElementById('summarySessionValue');
const summarySessionMeta = document.getElementById('summarySessionMeta');
const summaryTeacherValue = document.getElementById('summaryTeacherValue');
const summaryTeacherMeta = document.getElementById('summaryTeacherMeta');
const summaryMonitorValue = document.getElementById('summaryMonitorValue');
const summaryMonitorMeta = document.getElementById('summaryMonitorMeta');

const pageStageBadge = document.getElementById('pageStageBadge');
const pageStageText = document.getElementById('pageStageText');
const browserCurrentMessage = document.getElementById('browserCurrentMessage');
const browserUpdatedAt = document.getElementById('browserUpdatedAt');
const browserActionText = document.getElementById('browserActionText');
const browserActivePageTitle = document.getElementById('browserActivePageTitle');
const browserPageStateText = document.getElementById('browserPageStateText');
const browserPageCount = document.getElementById('browserPageCount');
const browserPageList = document.getElementById('browserPageList');
const browserVisibleButtons = document.getElementById('browserVisibleButtons');
const browserVisibleInputs = document.getElementById('browserVisibleInputs');
const browserNoticeMeta = document.getElementById('browserNoticeMeta');
const browserNoticeList = document.getElementById('browserNoticeList');
const browserTodoMeta = document.getElementById('browserTodoMeta');
const browserTodoList = document.getElementById('browserTodoList');
const livePreviewMeta = document.getElementById('livePreviewMeta');
const livePreviewImage = document.getElementById('livePreviewImage');
const livePreviewEmpty = document.getElementById('livePreviewEmpty');

const autofillForm = document.getElementById('autofillForm');
const autofillMeta = document.getElementById('autofillMeta');
const autofillSubmitBtn = document.getElementById('autofillSubmitBtn');
const autofillStatus = document.getElementById('autofillStatus');
const subjectInput = document.getElementById('subjectInput');
const descriptionInput = document.getElementById('descriptionInput');
const phoneInput = document.getElementById('phoneInput');
const contractAmountInput = document.getElementById('contractAmountInput');
const remarkInput = document.getElementById('remarkInput');
const actionInput = document.getElementById('actionInput');
const attachmentsInput = document.getElementById('attachmentsInput');
const attachmentsMeta = document.getElementById('attachmentsMeta');
const attachmentsSelected = document.getElementById('attachmentsSelected');
const sealTypeList = document.getElementById('sealTypeList');

const teacherGuideState = document.getElementById('teacherGuideState');
const selectedTeacherCard = document.getElementById('selectedTeacherCard');
const teacherSearchInput = document.getElementById('teacherSearchInput');
const teacherList = document.getElementById('teacherList');
const teacherNotes = document.getElementById('teacherNotes');

const inputs = {
  username: document.getElementById('cfgUsername'),
  password: document.getElementById('cfgPassword'),
  url: document.getElementById('cfgUrl'),
  targetUrl: document.getElementById('cfgTargetUrl'),
  menuText: document.getElementById('cfgMenuText'),
  browserPath: document.getElementById('cfgBrowserPath'),
  timeout: document.getElementById('cfgTimeout'),
  headful: document.getElementById('cfgHeadful'),
  reuse: document.getElementById('cfgReuse'),
  remember: document.getElementById('cfgRemember'),
};

const state = {
  selectedRunId: '',
  pollTimer: null,
  pollIntervalMs: 3200,
  artifacts: null,
  summary: null,
  currentRun: null,
  teacherGuide: null,
  messageTimer: null,
  autofillSubmitting: false,
  selectedTeacher: loadSelectedTeacher(),
  sealOptions: [...DEFAULT_SEAL_OPTIONS],
};

boot().catch((error) => {
  renderError(error.message);
});

async function boot() {
  bindEvents();
  renderSealTypeOptions();
  renderSelectedAttachments();
  await Promise.all([loadConfig(), refreshStatus()]);
  startPolling();
}

function bindEvents() {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveConfig();
    } catch (error) {
      renderError(error.message);
    }
  });

  autofillForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await submitAutofill();
    } catch (error) {
      renderError(error.message);
    }
  });

  reloadConfigBtn.addEventListener('click', () => {
    loadConfig().catch((error) => renderError(error.message));
  });

  openTeacherModalBtn.addEventListener('click', () => {
    teacherModal.showModal();
  });

  openConfigModalBtn.addEventListener('click', () => {
    configModal.showModal();
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      const dialogId = button.getAttribute('data-close-dialog');
      const dialog = dialogId ? document.getElementById(dialogId) : null;
      if (dialog && typeof dialog.close === 'function') {
        dialog.close();
      }
    });
  });

  refreshStatusBtn.addEventListener('click', () => {
    refreshStatus().catch((error) => renderError(error.message));
  });

  stopRunBtn.addEventListener('click', () => {
    stopRun().catch((error) => renderError(error.message));
  });

  togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
  teacherSearchInput.addEventListener('input', renderTeacherGuide);
  [subjectInput, descriptionInput, phoneInput, contractAmountInput, remarkInput, actionInput, attachmentsInput]
    .forEach((control) => {
      control.addEventListener('input', handleAutofillInput);
      control.addEventListener('change', handleAutofillInput);
    });
  sealTypeList.addEventListener('change', handleAutofillInput);

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      runAction(button.dataset.action || '').catch((error) => renderError(error.message));
    });
  });
}

function loadSelectedTeacher() {
  try {
    const raw = localStorage.getItem(SELECTED_TEACHER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSelectedTeacher() {
  try {
    if (!state.selectedTeacher) {
      localStorage.removeItem(SELECTED_TEACHER_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SELECTED_TEACHER_STORAGE_KEY, JSON.stringify(state.selectedTeacher));
  } catch {
    // Ignore storage errors.
  }
}

async function loadConfig() {
  const data = await api('/api/config');
  const cfg = data.config || {};

  inputs.username.value = cfg.USCOA_USERNAME || '';
  inputs.password.value = cfg.USCOA_PASSWORD || '';
  inputs.url.value = cfg.USCOA_URL || '';
  inputs.targetUrl.value = cfg.USCOA_TARGET_URL || '';
  inputs.menuText.value = cfg.USCOA_MENU_TEXT || RESEARCH_SEAL_KEY;
  inputs.browserPath.value = cfg.USCOA_BROWSER_PATH || '';
  inputs.timeout.value = cfg.USCOA_TIMEOUT_MS || '';
  inputs.headful.value = cfg.USCOA_HEADFUL || '0';
  inputs.reuse.value = cfg.USCOA_REUSE_SESSION || '1';
  inputs.remember.value = cfg.USCOA_REMEMBER_ME || '0';

  configHint.textContent = '已从 .env 加载';
}

async function saveConfig() {
  configHint.textContent = '淇濆瓨涓?..';

  const config = {
    USCOA_USERNAME: inputs.username.value.trim(),
    USCOA_PASSWORD: inputs.password.value.trim(),
    USCOA_URL: inputs.url.value.trim(),
    USCOA_TARGET_URL: '',
    USCOA_MENU_TEXT: RESEARCH_SEAL_KEY,
    USCOA_BROWSER_PATH: inputs.browserPath.value.trim(),
    USCOA_TIMEOUT_MS: inputs.timeout.value.trim(),
    USCOA_HEADFUL: inputs.headful.value,
    USCOA_REUSE_SESSION: inputs.reuse.value,
    USCOA_REMEMBER_ME: inputs.remember.value || '0',
  };

  await api('/api/config', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });

  configHint.textContent = '已写入 .env';
  flash('配置已保存。', 'success');
  await Promise.all([loadConfig(), refreshStatus()]);
}

async function runAction(action) {
  const args = buildArgs(action);
  if (!args) {
    return;
  }

  const response = await api('/api/run', {
    method: 'POST',
    body: JSON.stringify({ args }),
  });

  state.selectedRunId = response.run ? response.run.id : '';
  flash(`已启动任务：${actionLabel(action)}`, 'info');
  await refreshStatus();
}

async function submitAutofill() {
  state.autofillSubmitting = true;
  syncAutofillControls(Boolean(state.currentRun && state.currentRun.status === 'running'));
  clearAutofillErrors();
  setAutofillStatus('正在校验并提交自动填写任务...', 'info');
  flash('正在提交自动填写任务...', 'info');

  try {
    const payload = buildAutofillPayload();
    const formData = new FormData();
    formData.append('guide_key', payload.guide_key);
    formData.append('subject', payload.subject);
    formData.append('contract_amount', payload.contract_amount);
    formData.append('description', payload.description);
    formData.append('phone', payload.phone);
    formData.append('remark', payload.remark);
    formData.append('action', payload.action);
    payload.seal_types.forEach((item) => formData.append('seal_types', item));
    payload.attachments.forEach((file) => formData.append('attachments', file, file.name));
    const response = await api('/api/autofill', {
      method: 'POST',
      body: formData,
    });

    state.selectedRunId = response.run ? response.run.id : '';
    setAutofillStatus('自动填写任务已启动，请查看右侧实时状态。', 'success');
    flash('已启动自动填写流程。', 'success');
    await refreshStatus();
  } catch (error) {
    if (error && error.autofillField) {
      markAutofillFieldError(error.autofillField);
    }
    setAutofillStatus(error.message || '自动填写任务提交失败。', 'error');
    throw error;
  } finally {
    state.autofillSubmitting = false;
    syncAutofillControls(Boolean(state.currentRun && state.currentRun.status === 'running'));
  }
}

function buildAutofillPayload() {
  const subject = subjectInput.value.trim();
  const description = descriptionInput.value.trim();
  const phone = phoneInput.value.trim();
  const sealTypes = getSelectedSealTypes();
  const attachments = getSelectedAttachmentFiles();
  const action = attachments.length ? 'save_draft' : actionInput.value;

  if (!subject) {
    throw createAutofillValidationError('请先填写文件标题 / 用印内容。', subjectInput);
  }

  if (!description) {
    throw createAutofillValidationError('请先填写事项说明。', descriptionInput);
  }

  if (!phone) {
    throw createAutofillValidationError('请先填写联系电话。', phoneInput);
  }

  if (!sealTypes.length) {
    throw createAutofillValidationError('请至少选择一个用印类别。', sealTypeList);
  }

  return {
    guide_key: RESEARCH_SEAL_GUIDE_KEY,
    subject,
    seal_types: sealTypes,
    contract_amount: contractAmountInput.value.trim(),
    description,
    phone,
    remark: remarkInput.value.trim(),
    action,
    attachments,
  };
}

function getSelectedAttachmentFiles() {
  return Array.from(attachmentsInput.files || []).filter((file) => file && file.name);
}

function renderSelectedAttachments() {
  const files = getSelectedAttachmentFiles();

  if (attachmentsSelected) {
    attachmentsSelected.textContent = files.length
      ? `已选择 ${files.length} 个文件: ${files.map((file) => file.name).join('，')}`
      : '未选择附件';
  }

  if (attachmentsMeta) {
    attachmentsMeta.textContent = files.length
      ? '检测到附件，执行方式将锁定为“保存草稿”，随后进入 OA 附件页上传。'
      : '直接选择本地文件即可，系统会先保存草稿，再进入 OA 附件页上传。';
  }
}

function getSelectedSealTypes() {
  return Array.from(sealTypeList.querySelectorAll('input[type="checkbox"]:checked'))
    .map((input) => input.value)
    .filter(Boolean);
}

function createAutofillValidationError(message, field) {
  const error = new Error(message);
  error.autofillField = field || null;
  return error;
}

function handleAutofillInput(event) {
  if (event && event.currentTarget) {
    clearAutofillFieldError(event.currentTarget);
  }

  clearAutofillFieldError(sealTypeList);

  const isRunning = Boolean(state.currentRun && state.currentRun.status === 'running');
  if (!state.autofillSubmitting && !isRunning) {
    renderSelectedAttachments();
    if (getSelectedAttachmentFiles().length) {
      actionInput.value = 'save_draft';
      setAutofillStatus('检测到合同附件，系统会先保存草稿，再点表单顶部“附件”进入上传。', 'info');
    } else {
      setAutofillStatus('参数已更新，可以直接触发自动填写。', 'info');
    }
  }
}

function clearAutofillErrors() {
  [subjectInput, descriptionInput, phoneInput, contractAmountInput, remarkInput, actionInput, attachmentsInput, sealTypeList]
    .forEach((field) => clearAutofillFieldError(field));
  renderSelectedAttachments();
}

function clearAutofillFieldError(field) {
  if (!field || !field.classList) {
    return;
  }

  if (field === sealTypeList) {
    if (getSelectedSealTypes().length) {
      field.classList.remove('field-error');
    }
    return;
  }

  field.classList.remove('field-error');
}

function markAutofillFieldError(field) {
  if (!field || !field.classList) {
    return;
  }

  field.classList.add('field-error');

  if (field === sealTypeList) {
    const firstOption = sealTypeList.querySelector('input[type="checkbox"]');
    if (firstOption) {
      firstOption.focus();
    }
    return;
  }

  if (typeof field.focus === 'function') {
    field.focus();
  }
}

function setAutofillStatus(message, kind = 'info') {
  if (!autofillStatus) {
    return;
  }

  autofillStatus.textContent = message;
  autofillStatus.className = `autofill-status ${kind}`;
}

function syncAutofillControls(isRunning) {
  const disabled = state.autofillSubmitting || isRunning;
  const hasAttachments = getSelectedAttachmentFiles().length > 0;
  autofillSubmitBtn.disabled = disabled;
  actionInput.disabled = disabled || hasAttachments;
  if (hasAttachments) {
    actionInput.value = 'save_draft';
  }
  renderSelectedAttachments();

  if (state.autofillSubmitting) {
    autofillSubmitBtn.textContent = '提交中...';
    return;
  }

  if (isRunning) {
    autofillSubmitBtn.textContent = '鎵ц涓?..';
    setAutofillStatus('任务执行中，请查看右侧实时浏览器状态。', 'info');
    return;
  }

  autofillSubmitBtn.textContent = '自动填写表单';
}

async function stopRun() {
  await api('/api/run/stop', { method: 'POST' });
  flash('已请求停止当前任务。', 'warning');
  await refreshStatus();
}

function buildArgs(action) {
  if (action === 'probe') return ['--probe'];
  if (action === 'login') return [];
  if (action === 'headful') return ['--headful'];
  if (action === 'fresh') return ['--fresh-login'];
  if (action === 'refresh-teachers') return ['--extract-guide-json', RESEARCH_SEAL_KEY];
  if (action === 'open-research-seal-form') return ['--open-research-seal-form'];

  renderError(`未知动作：${action}`);
  return null;
}

async function refreshStatus() {
  const data = await api('/api/status');
  serverTime.textContent = `服务器时间: ${formatTime(data.now)}`;

  state.artifacts = data.artifacts || {};
  state.summary = data.summary || {};
  state.teacherGuide = state.artifacts.researchSealGuide || null;

  const activeRun = pickRunToDisplay(data);
  state.currentRun = activeRun;

  renderSummary(state.summary, state.teacherGuide, state.artifacts.browserState);
  renderTeacherGuide();
  renderMonitor(state.artifacts, state.summary, activeRun);

  const isRunning = Boolean(data.currentRun);
  updateActionAvailability(isRunning);

  state.pollIntervalMs = isRunning ? 1200 : 3200;
  restartPolling();
}

function pickRunToDisplay(data) {
  const runs = data.runs || [];
  const current = data.currentRun || null;
  const fallback = data.lastRun || null;

  if (state.selectedRunId) {
    const selected = runs.find((item) => item.id === state.selectedRunId);
    if (selected) {
      return current && current.id === selected.id ? current : selected;
    }
  }

  if (current) {
    state.selectedRunId = current.id;
    return current;
  }

  if (fallback) {
    state.selectedRunId = fallback.id;
    return fallback;
  }

  state.selectedRunId = '';
  return null;
}

function renderSummary(summary, guide, browserState) {
  summaryConfigValue.textContent = summary.configReady ? '已就绪' : '待完善';
  summaryConfigMeta.textContent = summary.configReady
    ? '可以直接执行科研事项用印流程'
    : '至少补齐账号、密码和入口 URL';

  summarySessionValue.textContent = summary.hasSession ? '已缓存' : '未缓存';
  summarySessionMeta.textContent = summary.hasSession
    ? '存在可复用 storage-state'
    : '首次执行会重新登录';

  const teacherCount = Array.isArray(guide && guide.responsibles) ? guide.responsibles.length : 0;
  summaryTeacherValue.textContent = String(teacherCount);
  summaryTeacherMeta.textContent = teacherCount
    ? `最近更新 ${formatTime(guide.extractedAt || guide.modifiedAt || '')}`
    : '点击“进入科研事项用印说明”获取相关老师信息';

  const monitorReady = browserState && browserState.updatedAt;
  summaryMonitorValue.textContent = monitorReady ? phaseLabel(browserState.phase) : '离线';
  summaryMonitorMeta.textContent = monitorReady
    ? `最近上报 ${formatTime(browserState.updatedAt)}`
    : '尚未接收到浏览器实时状态';
}

function renderMonitor(artifacts, summary, run) {
  const browserState = artifacts && artifacts.browserState ? artifacts.browserState : null;
  const livePreviewUrl = artifacts && artifacts.livePreviewUrl ? artifacts.livePreviewUrl : '';
  const livePreviewModifiedAt = artifacts && artifacts.livePreviewModifiedAt ? artifacts.livePreviewModifiedAt : '';
  const status = run ? run.status : 'idle';
  runState.textContent = statusLabel(status);
  runState.className = `badge ${status}`;

  if (!browserState) {
    pageStageBadge.textContent = summary && summary.hasSession ? '已登录' : '未开始';
    pageStageBadge.className = `stage-badge ${summary && summary.hasSession ? 'ready' : 'pending'}`;
    pageStageText.textContent = summary && summary.hasSession ? '浏览器会话已缓存' : '等待开始';
    browserCurrentMessage.textContent = '暂无浏览器运行信息';
    browserUpdatedAt.textContent = '-';
    browserActionText.textContent = '动作: -';
    browserActivePageTitle.textContent = '暂无页面';
    browserPageStateText.textContent = '等待浏览器状态上报。';
    browserPageCount.textContent = '0 个页面';
    livePreviewMeta.textContent = '尚未接收到实时画面';
    livePreviewImage.style.display = 'none';
    livePreviewImage.removeAttribute('src');
    livePreviewEmpty.style.display = 'grid';
    renderFeedList(browserNoticeList, browserNoticeMeta, [], 'notice', '当前没有提取到通知公告。');
    renderFeedList(browserTodoList, browserTodoMeta, [], 'todo', '当前没有提取到待办待阅。');
    renderChipList(browserVisibleButtons, []);
    renderInputSummary([]);
    renderPageList([]);
    return;
  }

  pageStageBadge.textContent = phaseLabel(browserState.phase);
  pageStageBadge.className = `stage-badge ${browserStageKind(browserState.status, browserState.phase)}`;
  pageStageText.textContent = phaseLabel(browserState.phase);
  browserCurrentMessage.textContent = browserState.currentMessage || '浏览器运行中';
  browserUpdatedAt.textContent = formatTime(browserState.updatedAt);
  browserActionText.textContent = `动作: ${browserState.action || '-'}`;

  if (livePreviewUrl) {
    livePreviewMeta.textContent = `实时画面更新于 ${formatTime(livePreviewModifiedAt)}`;
    livePreviewImage.src = livePreviewUrl;
    livePreviewImage.style.display = 'block';
    livePreviewEmpty.style.display = 'none';
  } else {
    livePreviewMeta.textContent = '当前任务尚未输出实时画面';
    livePreviewImage.style.display = 'none';
    livePreviewImage.removeAttribute('src');
    livePreviewEmpty.style.display = 'grid';
  }

  const snapshot = browserState.activeSnapshot || {};
  browserActivePageTitle.textContent = snapshot.title || '页面已打开';
  browserPageStateText.textContent = buildPageStateText(browserState, snapshot);

  const pages = Array.isArray(browserState.pages) ? browserState.pages : [];
  browserPageCount.textContent = `${pages.length} 个页面`;
  renderPageList(pages, browserState.activePageId);
  renderFeedList(
    browserNoticeList,
    browserNoticeMeta,
    Array.isArray(snapshot.notices) ? snapshot.notices : [],
    'notice',
    '当前没有提取到通知公告。'
  );
  renderFeedList(
    browserTodoList,
    browserTodoMeta,
    Array.isArray(snapshot.todoItems) ? snapshot.todoItems : [],
    'todo',
    '当前没有提取到待办待阅。'
  );
  renderChipList(browserVisibleButtons, snapshot.buttons || []);
  renderInputSummary(snapshot.inputs || []);
}

function renderPageList(pages, activePageId = '') {
  browserPageList.innerHTML = '';

  if (!pages.length) {
    browserPageList.appendChild(createEmptyState('当前没有已跟踪页面。'));
    return;
  }

  for (const page of pages) {
    const card = document.createElement('article');
    card.className = `page-card${page.id === activePageId ? ' active' : ''}`;

    const title = document.createElement('strong');
    title.textContent = page.title || page.label || '未命名页面';

    const url = document.createElement('p');
    url.className = 'url-text';
    url.textContent = page.url || '-';

    const meta = document.createElement('span');
    meta.className = 'hint';
    meta.textContent = page.closed
      ? '已关闭'
      : `最近更新 ${formatTime(page.updatedAt || '')}`;

    card.appendChild(title);
    card.appendChild(url);
    card.appendChild(meta);
    browserPageList.appendChild(card);
  }
}

function renderFeedList(container, metaNode, items, kind, emptyText) {
  container.innerHTML = '';

  const normalized = Array.isArray(items) ? items.filter((item) => item && (item.title || item.text)) : [];
  if (metaNode) {
    metaNode.textContent = `${normalized.length} 条`;
  }

  if (!normalized.length) {
    container.appendChild(createEmptyState(emptyText));
    return;
  }

  for (const item of normalized.slice(0, 8)) {
    const card = document.createElement('article');
    card.className = `feed-item is-${kind}`;

    const title = document.createElement('strong');
    title.textContent = item.title || item.text || '-';

    const meta = document.createElement('span');
    meta.className = 'hint';
    meta.textContent = item.meta || item.time || item.source || '-';

    const text = document.createElement('p');
    text.textContent = item.text || item.detail || item.title || '-';

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(text);
    container.appendChild(card);
  }
}
function renderChipList(container, items) {
  container.innerHTML = '';

  if (!items.length) {
    container.appendChild(createEmptyState('当前页面没有提取到可见按钮。'));
    return;
  }

  for (const item of items) {
    const chip = document.createElement('span');
    chip.className = 'data-chip';
    chip.textContent = item;
    container.appendChild(chip);
  }
}

function renderInputSummary(items) {
  browserVisibleInputs.innerHTML = '';

  if (!items.length) {
    browserVisibleInputs.appendChild(createEmptyState('当前页面没有提取到输入框摘要。'));
    return;
  }

  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'input-summary-card';

    const head = document.createElement('strong');
    head.textContent = item.id || item.name || item.type || '杈撳叆鎺т欢';

    const meta = document.createElement('p');
    meta.className = 'hint';
    meta.textContent = `${item.type || 'field'} | ${item.placeholder || '无占位提示'}`;

    const value = document.createElement('p');
    value.className = 'body-preview compact';
    value.textContent = item.valuePreview || '当前值为空';

    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(value);
    browserVisibleInputs.appendChild(row);
  }
}

function buildPageStateText(browserState, snapshot) {
  if (browserState.currentMessage) {
    return browserState.currentMessage;
  }

  if (snapshot && snapshot.title) {
    return '当前页面已就绪。';
  }

  return '浏览器运行中。';
}

function renderEventList(container, items, emptyText) {
  container.innerHTML = '';

  if (!items.length) {
    container.appendChild(createEmptyState(emptyText));
    return;
  }

  for (const item of items.slice(0, 18)) {
    const row = document.createElement('article');
    row.className = 'event-item';

    const head = document.createElement('div');
    head.className = 'event-head';

    const title = document.createElement('strong');
    title.textContent = item.title || '-';

    const meta = document.createElement('span');
    meta.className = 'hint';
    meta.textContent = item.meta || '-';

    const text = document.createElement('p');
    text.className = 'event-text';
    text.textContent = item.text || '-';

    head.appendChild(title);
    head.appendChild(meta);
    row.appendChild(head);
    row.appendChild(text);
    container.appendChild(row);
  }
}

function renderTeacherGuide() {
  const guide = state.teacherGuide;
  const filter = teacherSearchInput.value.trim().toLowerCase();

  teacherList.innerHTML = '';
  teacherNotes.innerHTML = '';

  if (!guide || !Array.isArray(guide.responsibles) || !guide.responsibles.length) {
    teacherGuideState.textContent = '未找到 guide';
    selectedTeacherCard.className = 'selected-teacher empty';
    selectedTeacherCard.textContent = '尚未读取到事务说明，请点击“进入科研事项用印说明”。';
    return;
  }

  const responsibles = guide.responsibles.filter((item) => {
    const owner = String(item.owner || '').toLowerCase();
    const category = String(item.category || '').toLowerCase();
    return !filter || owner.includes(filter) || category.includes(filter);
  });

  teacherGuideState.textContent = `已加载 ${guide.responsibles.length} 位`;

  if (!responsibles.length) {
    teacherList.appendChild(createEmptyState('没有匹配的老师。'));
  }

  for (const item of responsibles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'teacher-item';
    if (isSameTeacher(item, state.selectedTeacher)) {
      button.classList.add('active');
    }

    const owner = document.createElement('strong');
    owner.textContent = item.owner || '-';

    const category = document.createElement('span');
    category.className = 'teacher-category';
    category.textContent = item.category || '-';

    button.appendChild(owner);
    button.appendChild(category);
    button.addEventListener('click', () => {
      state.selectedTeacher = { owner: item.owner || '', category: item.category || '' };
      persistSelectedTeacher();
      renderTeacherGuide();
      flash(`已选择老师：${item.owner || '-'}`, 'info');
    });

    teacherList.appendChild(button);
  }

  renderSelectedTeacher();

  const notes = Array.isArray(guide.notes) ? guide.notes.filter(Boolean) : [];
  if (notes.length) {
    for (const note of notes.slice(0, 4)) {
      const p = document.createElement('p');
      p.className = 'note-item';
      p.textContent = note;
      teacherNotes.appendChild(p);
    }
  }
}

function renderSelectedTeacher() {
  if (!state.selectedTeacher || !state.selectedTeacher.owner) {
    selectedTeacherCard.className = 'selected-teacher empty';
    selectedTeacherCard.textContent = '尚未选择老师';
    return;
  }

  selectedTeacherCard.className = 'selected-teacher';
  selectedTeacherCard.innerHTML = '';

  const label = document.createElement('span');
  label.textContent = '当前确认老师';

  const owner = document.createElement('strong');
  owner.textContent = state.selectedTeacher.owner;

  const category = document.createElement('p');
  category.textContent = state.selectedTeacher.category || '-';

  selectedTeacherCard.appendChild(label);
  selectedTeacherCard.appendChild(owner);
  selectedTeacherCard.appendChild(category);
}

function renderSealTypeOptions() {
  sealTypeList.innerHTML = '';

  for (const option of state.sealOptions) {
    const label = document.createElement('label');
    label.className = 'seal-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = option.value;

    const text = document.createElement('span');
    text.textContent = option.label;

    label.appendChild(input);
    label.appendChild(text);
    sealTypeList.appendChild(label);
  }
}

function updateActionAvailability(isRunning) {
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.disabled = isRunning;
  });

  syncAutofillControls(isRunning);
  stopRunBtn.disabled = !isRunning;
  refreshStatusBtn.disabled = false;
  reloadConfigBtn.disabled = false;
  autofillMeta.textContent = isRunning
    ? '任务执行中，右侧会实时刷新浏览器状态和过程'
    : '填写后可直接触发自动回填';
}

function togglePasswordVisibility() {
  const isPassword = inputs.password.type === 'password';
  inputs.password.type = isPassword ? 'text' : 'password';
  togglePasswordBtn.textContent = isPassword ? '隐藏' : '显示';
}

function renderError(message) {
  flash(message, 'error');
}

function flash(message, kind) {
  messageBar.textContent = message;
  messageBar.className = `message ${kind || 'info'}`;

  if (state.messageTimer) {
    clearTimeout(state.messageTimer);
  }

  state.messageTimer = setTimeout(() => {
    messageBar.textContent = '工作台已就绪。';
    messageBar.className = 'message info';
  }, 5000);
}

function createEmptyState(text) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = text;
  return empty;
}

function isSameTeacher(left, right) {
  if (!left || !right) {
    return false;
  }
  return (left.owner || '') === (right.owner || '') && (left.category || '') === (right.category || '');
}

function statusLabel(status) {
  if (status === 'running') return '执行中';
  if (status === 'stopping') return '停止中';
  if (status === 'stopped') return '已停止';
  if (status === 'succeeded') return '已完成';
  if (status === 'failed') return '已失败';
  return '空闲';
}

function actionLabel(action) {
  if (action === 'login') return '登录系统';
  if (action === 'open-research-seal-form') return '直接进入表单';
  return action || '任务';
}

function phaseLabel(phase) {
  const map = {
    booting: '初始化',
    launching: '启动浏览器',
    entry_ready: '入口页就绪',
    login_required: '需要登录',
    login_preparing: '准备登录',
    login_submitting: '提交登录',
    authenticated: '已认证',
    menu_expanding: '展开业务审批',
    menu_locating: '进入科研事项用印',
    list_ready: '列表页就绪',
    guide_loading: '打开温馨提示',
    guide_opened: '温馨提示页',
    guide_confirming: '确认提示',
    form_ready: '表单已打开',
    form_filling: '填写表单',
    form_filled: '填写完成',
    form_saving: '保存草稿',
    form_saved: '已保存',
    form_save_pending: '等待保存结果',
    attachments_uploading: '上传附件',
    attachment_page_ready: '附件页就绪',
    attachments_uploaded: '附件已上传',
    attachments_unverified: '附件待确认',
    target_ready: '目标页就绪',
    menu_ready: '菜单页就绪',
    completed: '已完成',
    failed: '失败',
  };

  return map[phase] || phase || '等待开始';
}

function browserStageKind(status, phase) {
  if (status === 'failed' || phase === 'failed') return 'failed';
  if (status === 'completed' || phase === 'completed' || phase === 'form_saved') return 'done';
  if (status === 'running') return 'active';
  if (phase === 'authenticated' || phase === 'form_ready') return 'ready';
  return 'pending';
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

async function api(path, options = {}) {
  const request = {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  };

  if (request.body && !(request.body instanceof FormData) && !request.headers['Content-Type']) {
    request.headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, request);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    if (data && typeof data === 'object' && data.error) {
      throw new Error(data.error);
    }
    throw new Error(typeof data === 'string' && data ? data : `请求失败：${response.status}`);
  }

  return data;
}

function startPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
  }

  state.pollTimer = setInterval(() => {
    refreshStatus().catch((error) => renderError(error.message));
  }, state.pollIntervalMs);
}

function restartPolling() {
  startPolling();
}

