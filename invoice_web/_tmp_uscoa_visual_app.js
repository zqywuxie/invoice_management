(() => {
  const state = {
    meta: null,
    running: false,
  };

  const elements = {};
  const STEP_ORDER = ["prepare", "start", "run", "result", "done"];

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();
    resetSteps();
    await loadMeta();
    await refreshArtifacts();
  }

  function cacheElements() {
    elements.form = document.getElementById("autofillForm");
    elements.subject = document.getElementById("subject");
    elements.stampOptions = document.getElementById("stampOptions");
    elements.contractAmount = document.getElementById("contractAmount");
    elements.phone = document.getElementById("phone");
    elements.description = document.getElementById("description");
    elements.remark = document.getElementById("remark");
    elements.attachments = document.getElementById("attachments");
    elements.attachmentHint = document.getElementById("attachmentHint");
    elements.attachmentNames = document.getElementById("attachmentNames");
    elements.headful = document.getElementById("headful");
    elements.fillOnlyBtn = document.getElementById("fillOnlyBtn");
    elements.saveDraftBtn = document.getElementById("saveDraftBtn");
    elements.runStatusBadge = document.getElementById("runStatusBadge");
    elements.formError = document.getElementById("formError");
    elements.stdoutBox = document.getElementById("stdoutBox");
    elements.stderrBox = document.getElementById("stderrBox");
    elements.resultBox = document.getElementById("resultBox");
    elements.artifactList = document.getElementById("artifactList");
    elements.artifactsEmpty = document.getElementById("artifactsEmpty");
    elements.refreshArtifactsBtn = document.getElementById("refreshArtifactsBtn");
  }

  function bindEvents() {
    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await runAutofill("save_draft");
    });
    elements.fillOnlyBtn.addEventListener("click", async () => {
      await runAutofill("fill_only");
    });
    elements.attachments.addEventListener("change", () => {
      renderAttachmentNames();
      const hasFiles = getFiles().length > 0;
      elements.fillOnlyBtn.disabled = state.running || hasFiles;
    });
    elements.refreshArtifactsBtn.addEventListener("click", refreshArtifacts);
  }

  async function loadMeta() {
    const data = await requestJson("/api/meta");
    state.meta = data;
    renderStamps(data.form_template?.stamp_options || []);
    applyAttachmentRules(data.form_template?.attachment_constraints || {});
    renderAttachmentNames();
  }

  function renderStamps(options) {
    elements.stampOptions.innerHTML = "";
    (Array.isArray(options) ? options : []).forEach((item, index) => {
      const label = document.createElement("label");
      label.className = "stamp-item d-flex align-items-center gap-2";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "seal_types";
      input.value = item.label || "";
      input.id = `seal_${index}`;
      input.className = "form-check-input mt-0";
      const text = document.createElement("span");
      text.className = "small";
      text.textContent = item.label || "";
      label.appendChild(input);
      label.appendChild(text);
      elements.stampOptions.appendChild(label);
    });
  }

  function applyAttachmentRules(constraints) {
    const accept = constraints.accept || "";
    if (accept) {
      elements.attachments.setAttribute("accept", accept);
    }
    const parts = [];
    if (constraints.max_count) {
      parts.push(`最多 ${constraints.max_count} 个`);
    }
    if (constraints.max_file_size_mb) {
      parts.push(`单个 <= ${constraints.max_file_size_mb} MB`);
    }
    if (constraints.max_total_size_mb) {
      parts.push(`总计 <= ${constraints.max_total_size_mb} MB`);
    }
    if (Array.isArray(constraints.allowed_extensions) && constraints.allowed_extensions.length) {
      parts.push(`格式: ${constraints.allowed_extensions.map((x) => `.${x}`).join("、")}`);
    }
    if (parts.length) {
      elements.attachmentHint.textContent = parts.join("；");
    }
  }

  function renderAttachmentNames() {
    const files = getFiles();
    if (!files.length) {
      elements.attachmentNames.textContent = "未选择附件。";
      return;
    }
    elements.attachmentNames.textContent = `已选择: ${files.map((file) => file.name).join("；")}`;
  }

  function getFiles() {
    return Array.from(elements.attachments.files || []);
  }

  async function runAutofill(action) {
    if (state.running) {
      return;
    }

    hideError();
    resetSteps();
    setRunning(true);

    const payload = collectPayload(action);
    const validationError = validatePayload(payload);
    if (validationError) {
      markStep("prepare", "failed");
      showError(validationError);
      setRunning(false);
      return;
    }

    try {
      markStep("prepare", "success");
      markStep("start", "running");
      const response = await requestRun(payload);
      markStep("start", "success");
      markStep("run", "success");
      markStep("result", "success");
      markStep("done", "success");
      setBadge("成功", "success");

      elements.stdoutBox.textContent = response.run?.stdout || "无 stdout";
      const stderr = response.run?.stderr || "";
      if (stderr.trim()) {
        elements.stderrBox.classList.remove("d-none");
        elements.stderrBox.textContent = stderr;
      } else {
        elements.stderrBox.classList.add("d-none");
        elements.stderrBox.textContent = "";
      }
      elements.resultBox.textContent = JSON.stringify(response.run?.parsed_result || response, null, 2);
      await refreshArtifacts(response.run?.artifacts || []);
    } catch (error) {
      markStep("start", "success");
      markStep("run", "failed");
      markStep("result", "failed");
      markStep("done", "failed");
      setBadge("失败", "danger");
      showError(error.message || "执行失败");
      elements.resultBox.textContent = JSON.stringify({ success: false, message: error.message }, null, 2);
    } finally {
      setRunning(false);
    }
  }

  function collectPayload(action) {
    const sealTypes = Array.from(document.querySelectorAll('input[name="seal_types"]:checked'))
      .map((item) => item.value)
      .filter(Boolean);
    return {
      subject: elements.subject.value.trim(),
      seal_types: sealTypes,
      contract_amount: elements.contractAmount.value.trim(),
      description: elements.description.value.trim(),
      phone: elements.phone.value.trim(),
      remark: elements.remark.value.trim(),
      attachments: getFiles(),
      action,
      headful: elements.headful.checked,
    };
  }

  function validatePayload(payload) {
    if (!payload.subject) return "申办内容不能为空。";
    if (!payload.seal_types.length) return "至少选择一种用印类型。";
    if (!payload.description) return "事项说明不能为空。";
    if (!payload.phone) return "联系电话不能为空。";
    if (payload.attachments.length && payload.action !== "save_draft") {
      return "存在附件时只能选择“自动填报并保存草稿”。";
    }
    return "";
  }

  async function requestRun(payload) {
    const formData = new FormData();
    formData.append("subject", payload.subject);
    formData.append("contract_amount", payload.contract_amount);
    formData.append("description", payload.description);
    formData.append("phone", payload.phone);
    formData.append("remark", payload.remark);
    formData.append("action", payload.action);
    if (payload.headful) {
      formData.append("headful", "1");
    }
    payload.seal_types.forEach((item) => formData.append("seal_types", item));
    payload.attachments.forEach((file) => formData.append("attachments", file, file.name));

    markStep("run", "running");
    const response = await requestJson("/api/run", { method: "POST", body: formData });
    return response;
  }

  async function refreshArtifacts(prefetched = null) {
    const items = prefetched || (await requestJson("/api/artifacts")).items || [];
    elements.artifactList.innerHTML = "";
    if (!items.length) {
      elements.artifactsEmpty.classList.remove("d-none");
      return;
    }
    elements.artifactsEmpty.classList.add("d-none");
    items.forEach((item) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.name;
      const info = document.createElement("div");
      info.className = "small text-muted";
      info.textContent = `${item.updated_at} · ${formatSize(item.size)}`;
      li.appendChild(a);
      li.appendChild(info);
      elements.artifactList.appendChild(li);
    });
  }

  function formatSize(bytes) {
    const size = Number(bytes || 0);
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
  }

  function resetSteps() {
    STEP_ORDER.forEach((step) => markStep(step, "pending"));
    setBadge("未执行", "secondary");
    elements.stdoutBox.textContent = "暂无输出";
    elements.stderrBox.classList.add("d-none");
    elements.stderrBox.textContent = "";
  }

  function markStep(step, status) {
    const item = document.querySelector(`.step-item[data-step="${step}"]`);
    if (!item) return;
    item.classList.remove("pending", "running", "success", "failed");
    item.classList.add(status);
  }

  function setRunning(running) {
    state.running = running;
    const hasFiles = getFiles().length > 0;
    elements.fillOnlyBtn.disabled = running || hasFiles;
    elements.saveDraftBtn.disabled = running;
    elements.subject.disabled = running;
    elements.contractAmount.disabled = running;
    elements.phone.disabled = running;
    elements.description.disabled = running;
    elements.remark.disabled = running;
    elements.attachments.disabled = running;
    elements.headful.disabled = running;
    document.querySelectorAll('input[name="seal_types"]').forEach((input) => {
      input.disabled = running;
    });
    if (running) {
      setBadge("执行中", "warning");
    }
  }

  function setBadge(text, type) {
    elements.runStatusBadge.className = `badge text-bg-${type}`;
    elements.runStatusBadge.textContent = text;
  }

  function showError(message) {
    elements.formError.textContent = message;
    elements.formError.classList.remove("d-none");
  }

  function hideError() {
    elements.formError.textContent = "";
    elements.formError.classList.add("d-none");
  }

  async function requestJson(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : { message: await response.text() };
    if (!response.ok) {
      throw new Error(data.message || `请求失败(${response.status})`);
    }
    return data;
  }
})();
