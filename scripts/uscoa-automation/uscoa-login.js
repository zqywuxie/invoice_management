'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright-core');

const PROJECT_ROOT = __dirname;
const OUTPUT_DIR = path.join(PROJECT_ROOT, '.output');
const GUIDES_DIR = path.join(OUTPUT_DIR, 'guides');
const FORMS_DIR = path.join(OUTPUT_DIR, 'forms');
const ATTACHMENTS_DIR = path.join(OUTPUT_DIR, 'attachments');
const STORAGE_STATE_PATH = path.join(OUTPUT_DIR, 'storage-state.json');
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, 'last-page.png');
const HTML_PATH = path.join(OUTPUT_DIR, 'last-page.html');
const META_PATH = path.join(OUTPUT_DIR, 'last-page.json');
const BROWSER_STATE_PATH = path.join(OUTPUT_DIR, 'browser-state.json');
const LIVE_PREVIEW_PATH = path.join(OUTPUT_DIR, 'live-page.jpg');
const DEFAULT_URL = 'http://uscoa.usc.edu.cn/page/index';
const DEFAULT_TIMEOUT_MS = 45_000;
const TEXTS = {
  accountLogin: '\u8d26\u53f7\u767b\u5f55',
  loginButton: '\u767b\u5f55',
  businessApproval: '\u4e1a\u52a1\u5ba1\u6279',
  sealMatters: '\u7528\u5370\u4e8b\u9879',
  researchSeal: '\u79d1\u7814\u4e8b\u9879\u7528\u5370',
  guideTitle: '\u6e29\u99a8\u63d0\u793a',
  guideSection: '\u79d1\u7814\u90e8\u76f8\u5173\u4e1a\u52a1\u8d1f\u8d23\u4eba\u4fe1\u606f\u5982\u4e0b',
  guideConfirm: '\u6211\u5df2\u9605\u8bfb\u5e76\u5b8c\u5168\u7406\u89e3\u4e0a\u8ff0\u5185\u5bb9',
};
const COMMON_BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const SEAL_TYPE_ALIASES = new Map([
  ['party_committee_seal', '学校党委章'],
  ['administration_seal', '学校行政章'],
  ['party_secretary_seal', '党委书记印'],
  ['president_seal', '校长印'],
  ['school_steel_seal', '学校钢印'],
  ['contract_seal', '合同用印'],
  ['party committee seal', '学校党委章'],
  ['administration seal', '学校行政章'],
  ['party secretary seal', '党委书记印'],
  ['president seal', '校长印'],
  ['school steel seal', '学校钢印'],
  ['contract seal', '合同用印'],
]);

loadDotEnv(path.join(PROJECT_ROOT, '.env'));

const argv = process.argv.slice(2);
const args = new Set(argv);
const isProbeMode = args.has('--probe');
const isHeadful = args.has('--headful') || getEnvFlag('USCOA_HEADFUL');
const forceFreshLogin = args.has('--fresh-login');
const timeoutMs = getPositiveInt(process.env.USCOA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
const startUrl = process.env.USCOA_URL || DEFAULT_URL;
const targetUrl = getArgValue('--target-url') || process.env.USCOA_TARGET_URL || '';
const menuText = getArgValue('--menu') || process.env.USCOA_MENU_TEXT || '';
const dumpMenuText = getArgValue('--dump-menu') || '';
const extractGuideKey = getArgValue('--extract-guide-json') || '';
const inspectFormKey = getArgValue('--inspect-form') || '';
const openResearchSealFormMode = args.has('--open-research-seal-form');
const autofillJsonPath = getArgValue('--autofill-json') || '';
const shouldReuseSession = !forceFreshLogin && getOptionalFlag('USCOA_REUSE_SESSION', true);

main().catch((error) => {
  console.error(`[error] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  await fsp.mkdir(GUIDES_DIR, { recursive: true });
  await fsp.mkdir(FORMS_DIR, { recursive: true });
  await fsp.mkdir(ATTACHMENTS_DIR, { recursive: true });

  const monitor = createBrowserMonitor(resolveRunAction());
  await monitor.reset({
    headful: isHeadful,
    startUrl,
    timeoutMs,
  });

  const executablePath = resolveBrowserPath();
  console.log(`[info] Browser: ${executablePath}`);
  console.log(`[info] Start URL: ${startUrl}`);
  await monitor.setPhase('launching', 'Launching browser', null, {
    executablePath,
  });

  const browser = await chromium.launch({
    executablePath,
    headless: !isHeadful,
  });

  const contextOptions = {};
  if (shouldReuseSession && fs.existsSync(STORAGE_STATE_PATH)) {
    contextOptions.storageState = STORAGE_STATE_PATH;
    console.log('[info] Reusing saved session state');
  }

  try {
    const context = await browser.newContext(contextOptions);
    await monitor.attachContext(context);
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await monitor.watchPage(page, 'main');

    await gotoAndSettle(page, startUrl);
    await monitor.setPhase('entry_ready', 'Opened OA entry page', page);

    if (isProbeMode) {
      await saveArtifacts(context, page, monitor);
      const probeData = await collectProbeData(page);
      console.log(JSON.stringify(probeData, null, 2));
      console.log(`[info] Screenshot saved to ${SCREENSHOT_PATH}`);
      await monitor.complete(page, 'Collected probe data');
      return;
    }

    await ensureAuthenticated(page, monitor);

    if (openResearchSealFormMode) {
      const popup = await openResearchSealFormPopup(page, monitor);
      await popup.bringToFront().catch(() => {});
      await saveArtifacts(context, popup, monitor);
      console.log(JSON.stringify({
        success: true,
        guideKey: TEXTS.researchSeal,
        sourceUrl: popup.url(),
        title: await popup.title().catch(() => ''),
      }, null, 2));
      console.log(`[info] Storage state saved to ${STORAGE_STATE_PATH}`);
      console.log(`[info] Screenshot saved to ${SCREENSHOT_PATH}`);
      await monitor.complete(popup, 'Research seal form is ready');
      return;
    }

    if (dumpMenuText) {
      const items = await dumpExpandedMenu(page, dumpMenuText);
      await saveArtifacts(context, page, monitor);
      console.log(JSON.stringify({ menu: dumpMenuText, items }, null, 2));
      console.log(`[info] Screenshot saved to ${SCREENSHOT_PATH}`);
      await monitor.complete(page, 'Dumped menu items');
      return;
    }

    if (extractGuideKey) {
      const guide = await extractGuideJson(page, extractGuideKey, monitor);
      const outputPath = path.join(GUIDES_DIR, `${guide.fileKey}.json`);
      await fsp.writeFile(outputPath, JSON.stringify(guide, null, 2), 'utf8');
      await saveArtifacts(context, page, monitor);
      console.log(JSON.stringify({ savedTo: outputPath, guide }, null, 2));
      console.log(`[info] Guide JSON saved to ${outputPath}`);
      console.log(`[info] Screenshot saved to ${SCREENSHOT_PATH}`);
      await monitor.complete(page, 'Guide page extracted');
      return;
    }

    if (inspectFormKey) {
      const form = await inspectForm(page, inspectFormKey, monitor);
      const jsonPath = path.join(FORMS_DIR, `${form.fileKey}.json`);
      await fsp.writeFile(jsonPath, JSON.stringify(form, null, 2), 'utf8');
      await saveArtifacts(context, page, monitor);
      console.log(JSON.stringify({ savedTo: jsonPath, form }, null, 2));
      console.log(`[info] Form JSON saved to ${jsonPath}`);
      console.log(`[info] Screenshot saved to ${SCREENSHOT_PATH}`);
      await monitor.complete(page, 'Form structure inspected');
      return;
    }

    if (autofillJsonPath) {
      const result = await autofillResearchSeal(page, autofillJsonPath, monitor);
      await saveArtifacts(context, page, monitor);
      console.log(JSON.stringify(result, null, 2));
      await monitor.complete(page, 'Autofill flow completed');
      return;
    }

    if (targetUrl) {
      console.log(`[info] Visiting target URL: ${targetUrl}`);
      await gotoAndSettle(page, targetUrl);
      await monitor.setPhase('target_ready', 'Opened target URL', page, { targetUrl });
    } else if (menuText) {
      console.log(`[info] Opening menu: ${menuText}`);
      await openMenuLink(page, menuText);
      await monitor.setPhase('menu_ready', `Opened menu ${menuText}`, page);
    }

    await saveArtifacts(context, page, monitor);
    console.log(`[info] Storage state saved to ${STORAGE_STATE_PATH}`);
    console.log(`[info] Screenshot saved to ${SCREENSHOT_PATH}`);
    await monitor.complete(page, 'Run completed');
  } catch (error) {
    await monitor.fail(error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function ensureAuthenticated(page, monitor) {
  if (await isLoginRequired(page)) {
    const username = requiredEnv('USCOA_USERNAME');
    const password = requiredEnv('USCOA_PASSWORD');
    await monitor.setPhase('login_required', 'Login page detected', page);
    await performLogin(page, username, password, monitor);
    console.log(`[info] Login success: ${page.url()}`);
    await monitor.setPhase('authenticated', 'Login completed', page);
    return;
  }

  console.log('[info] Session is already authenticated');
  await monitor.setPhase('authenticated', 'Reused existing authenticated session', page);
}

async function performLogin(page, username, password, monitor) {
  await monitor.setPhase('login_preparing', 'Preparing CAS account login', page);
  await switchToAccountLogin(page);
  await page.locator('#userName').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.locator('#password').waitFor({ state: 'visible', timeout: timeoutMs });

  await page.locator('#userName').fill(username);
  await page.locator('#password').fill(password);

  const rememberMe = page.locator('#rememberMe');
  if (await rememberMe.count()) {
    const shouldRemember = getEnvFlag('USCOA_REMEMBER_ME');
    const isChecked = await rememberMe.isChecked().catch(() => false);

    if (shouldRemember && !isChecked) {
      await rememberMe.check().catch(() => {});
    }

    if (!shouldRemember && isChecked) {
      await rememberMe.uncheck().catch(() => {});
    }
  }

  const loginButton = await locateLoginButton(page);
  const previousUrl = page.url();
  await monitor.setPhase('login_submitting', 'Submitting login form', page);
  await loginButton.click();

  const result = await waitForLoginResult(page, previousUrl);
  if (!result.success) {
    await monitor.setPhase('login_failed', result.reason, page);
    throw new Error(
      `Login did not complete within ${timeoutMs} ms. ${result.reason} Screenshot: ${SCREENSHOT_PATH}`
    );
  }
}

async function switchToAccountLogin(page) {
  if (await page.locator('#userName').isVisible().catch(() => false)) {
    return;
  }

  const tabByText = page.getByText(TEXTS.accountLogin).first();
  if (await tabByText.isVisible().catch(() => false)) {
    await tabByText.click().catch(() => {});
    return;
  }

  const linkByText = page.locator('a,div,span').filter({ hasText: TEXTS.accountLogin }).first();
  if (await linkByText.isVisible().catch(() => false)) {
    await linkByText.click().catch(() => {});
  }
}

async function locateLoginButton(page) {
  const candidates = [
    page.locator('button.ant-btn-primary').first(),
    page.getByRole('button', { name: new RegExp(TEXTS.loginButton) }).first(),
    page.locator('button').filter({ hasText: new RegExp(TEXTS.loginButton) }).first(),
  ];

  for (const locator of candidates) {
    if (await locator.count()) {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
  }

  throw new Error('Unable to locate the login button on the CAS page.');
}

async function waitForLoginResult(page, previousUrl) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    const currentUrl = page.url();
    if (!(await isLoginRequired(page))) {
      return { success: true };
    }

    if (currentUrl !== previousUrl && !currentUrl.includes('cas.usc.edu.cn/lyuapServer/login')) {
      return { success: true };
    }

    const errorText = await extractVisibleError(page);
    if (errorText) {
      return { success: false, reason: `Visible error: ${errorText}` };
    }

    await page.waitForTimeout(1000);
  }

  return {
    success: false,
    reason: 'The page stayed on the CAS login screen. The site may require extra verification.',
  };
}

async function isLoginRequired(page) {
  if (page.url().includes('cas.usc.edu.cn/lyuapServer/login')) {
    return true;
  }

  return page.locator('#userName').isVisible().catch(() => false);
}

async function dumpExpandedMenu(page, text) {
  const menuBottomY = await expandMenu(page, text);

  return page.evaluate((bottomY) => {
    const pickText = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const visible = (node) => !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);

    return Array.from(document.querySelectorAll('a'))
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          index,
          text: pickText(node.innerText),
          href: node.href || '',
          className: node.className || '',
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          visible: visible(node),
        };
      })
      .filter((item) => item.visible && item.text && item.className.includes('tt3') && item.x <= 180 && item.y >= bottomY)
      .map(({ visible, ...item }) => item);
  }, menuBottomY);
}

async function extractGuideJson(page, guideKey, monitor) {
  if (normalizeGuideKey(guideKey) !== 'usc_yzgl_kyyy_guide') {
    throw new Error(`Unsupported guide key: ${guideKey}`);
  }

  const guideFrame = await openResearchSealGuide(page, monitor);
  await monitor.setPhase('guide_opened', 'Opened 温馨提示 page', page);
  return extractGuideDataFromFrame(guideFrame);
}

async function inspectForm(page, formKey, monitor) {
  if (normalizeGuideKey(formKey) !== 'usc_yzgl_kyyy_guide') {
    throw new Error(`Unsupported form key: ${formKey}`);
  }

  const popup = await openResearchSealFormPopup(page, monitor);
  const formData = await collectResearchSealFormData(popup);

  const screenshotPath = path.join(FORMS_DIR, `${formData.fileKey}.png`);
  const htmlPath = path.join(FORMS_DIR, `${formData.fileKey}.html`);

  await popup.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await fsp.writeFile(htmlPath, await popup.content(), 'utf8');

  formData.savedArtifacts = {
    screenshotPath,
    htmlPath,
  };

  return formData;
}

async function autofillResearchSeal(page, jsonPath, monitor) {
  const payload = await loadAutofillPayload(jsonPath);
  const normalizedKey = normalizeGuideKey(payload.guide_key || payload.guideKey || TEXTS.researchSeal);
  if (normalizedKey !== 'usc_yzgl_kyyy_guide') {
    throw new Error(`Unsupported autofill guide key: ${payload.guide_key || payload.guideKey || ''}`);
  }

  const popup = await openResearchSealFormPopup(page, monitor);
  popup.setDefaultTimeout(timeoutMs);

  await monitor.setPhase('form_filling', 'Filling research seal form fields', popup, {
    subject: payload.subject,
  });
  await fillResearchSealForm(popup, payload);
  await monitor.setPhase('form_filled', 'Finished writing form fields', popup);

  let attachmentResult = {
    attempted: false,
    success: true,
    files: (payload.attachments || []).map((item) => ({
      name: item.name,
      path: item.path,
      size: item.size || 0,
    })),
    dialogs: [],
  };

  let actionResult = {
    action: payload.action || 'save_draft',
    attempted: false,
    success: true,
    dialogs: [],
  };

  if ((payload.attachments || []).length) {
    await monitor.setPhase('attachments_uploading', 'Uploading form attachments', popup, {
      attachmentCount: payload.attachments.length,
    });
    attachmentResult = await uploadResearchSealAttachments(popup, payload.attachments, monitor);
    if (!attachmentResult.success) {
      throw new Error(attachmentResult.error || 'Attachment upload did not complete successfully.');
    }

    actionResult = {
      action: 'save_draft',
      attempted: true,
      success: true,
      dialogs: attachmentResult.dialogs || [],
      currentUrl: popup.url(),
      recordId: attachmentResult.recordId || '',
      savedByAttachmentFlow: true,
      pageSignals: {
        note: 'The record was saved automatically before opening the attachment page.',
      },
    };
  } else if ((payload.action || 'save_draft') === 'save_draft') {
    await monitor.setPhase('form_saving', 'Saving research seal form draft', popup);
    actionResult = await saveResearchSealDraft(popup, monitor);
  }

  const formData = await collectResearchSealFormData(popup);
  const runKey = buildRunKey('usc_yzgl_kyyy_autofill');
  const screenshotPath = path.join(FORMS_DIR, `${runKey}.png`);
  const htmlPath = path.join(FORMS_DIR, `${runKey}.html`);
  const jsonPathOut = path.join(FORMS_DIR, `${runKey}.json`);

  await popup.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await fsp.writeFile(htmlPath, await popup.content(), 'utf8');

  const result = {
    success: true,
    guideKey: TEXTS.researchSeal,
    sourceUrl: popup.url(),
    action: payload.action || 'save_draft',
    requested: {
      subject: payload.subject,
      seal_types: payload.seal_types,
      contract_amount: payload.contract_amount || '',
      description: payload.description,
      phone: payload.phone,
      remark: payload.remark || '',
      attachments: (payload.attachments || []).map((item) => ({
        name: item.name,
        path: item.path,
        size: item.size || 0,
      })),
    },
    actionResult,
    attachmentResult,
    form: {
      summary: formData.summary,
      stampOptions: formData.stampOptions,
      actionButtons: formData.actionButtons,
    },
    artifacts: {
      screenshotPath,
      htmlPath,
      jsonPath: jsonPathOut,
    },
    completedAt: new Date().toISOString(),
  };

  await fsp.writeFile(jsonPathOut, JSON.stringify(result, null, 2), 'utf8');
  return result;
}

async function openResearchSealGuide(page, monitor) {
  await monitor.setPhase('menu_expanding', 'Expanding 业务审批 menu', page);
  await expandMenu(page, TEXTS.businessApproval);
  await monitor.setPhase('menu_locating', 'Opening 用印事项 > 科研事项用印', page);
  await openNestedMenu(page, TEXTS.sealMatters, TEXTS.researchSeal);

  const listFrame = await findFrame(
    page,
    (frame) => frame.url().includes('USC_YZGL_KYYY') && !frame.url().includes('/other/guide?'),
    'research seal list'
  );

  await monitor.setPhase('list_ready', 'Research seal list page loaded', page);
  await listFrame.locator('#add').click();
  await page.waitForTimeout(1500);
  await monitor.setPhase('guide_loading', 'Clicked 新建 and waiting for 温馨提示 page', page);

  return findFrame(
    page,
    (frame) => frame.url().includes('/other/guide?') && frame.url().includes('USC_YZGL_KYYY'),
    'research seal guide'
  );
}

async function openResearchSealFormPopup(page, monitor) {
  const guideFrame = await openResearchSealGuide(page, monitor);
  const popupPromise = page.context().waitForEvent('page', { timeout: timeoutMs }).catch(() => null);

  await monitor.setPhase('guide_confirming', 'Clicking the 温馨提示 confirmation button', page);
  await guideFrame.locator('#next').click();

  const popup = await popupPromise;
  if (!popup) {
    throw new Error('No popup was opened after clicking the guide confirmation button.');
  }

  await popup.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
  await popup.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
  await monitor.watchPage(popup, 'research-seal-form');
  await monitor.setPhase('form_ready', 'Research seal form popup is ready', popup);
  return popup;
}

async function fillResearchSealForm(popup, payload) {
  await popup.locator('#WJBT').waitFor({ state: 'visible', timeout: timeoutMs });

  await fillTextField(popup.locator('#WJBT'), payload.subject);
  await setSealTypes(popup, payload.seal_types);
  await fillTextField(popup.locator('#HTJE'), payload.contract_amount || '');
  await fillTextField(popup.locator('#XGQK'), payload.description);
  await fillTextField(popup.locator('#LXDH'), payload.phone);

  if (await popup.locator('#BZXX').count()) {
    await fillTextField(popup.locator('#BZXX'), payload.remark || '');
  }

  await popup.waitForTimeout(500);
}

async function fillTextField(locator, value) {
  await locator.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
  await locator.fill('');
  if (value) {
    await locator.fill(String(value));
  }
}

async function setSealTypes(popup, sealTypes) {
  const desired = new Set(
    (sealTypes || [])
      .map((item) => normalizeSealType(item))
      .filter(Boolean)
  );
  if (!desired.size) {
    throw new Error('At least one seal type is required for autofill.');
  }

  const checkboxes = popup.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  const matched = new Set();

  for (let index = 0; index < count; index += 1) {
    const checkbox = checkboxes.nth(index);
    const value = (await checkbox.inputValue().catch(() => '')).trim();
    if (!value) {
      continue;
    }

    if (desired.has(value)) {
      await checkbox.check({ force: true }).catch(async () => {
        await checkbox.click({ force: true });
      });
      matched.add(value);
      continue;
    }

    if (await checkbox.isChecked().catch(() => false)) {
      await checkbox.uncheck({ force: true }).catch(async () => {
        await checkbox.click({ force: true });
      });
    }
  }

  const missing = Array.from(desired).filter((item) => !matched.has(item));
  if (missing.length) {
    throw new Error(`Unable to match seal type options: ${missing.join(', ')}`);
  }
}

function normalizeSealType(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const alias = SEAL_TYPE_ALIASES.get(raw.toLowerCase());
  if (alias) {
    return alias;
  }

  return raw;
}

async function saveResearchSealDraft(popup, monitor) {
  const dialogs = [];
  const dialogHandler = async (dialog) => {
    dialogs.push({
      type: dialog.type(),
      message: dialog.message(),
    });
    await dialog.accept().catch(() => {});
  };

  popup.on('dialog', dialogHandler);
  try {
    const saveButton = popup.locator('#bc');
    await saveButton.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
    await saveButton.click({ force: true });
    await popup.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await popup.waitForTimeout(2500);

    const pageSignals = await popup.evaluate(() => {
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const bodyText = clean(document.body.innerText);
      return {
        title: document.title,
        bodyTextPreview: bodyText.slice(0, 800),
        hasSuccessKeyword: /(\u4fdd\u5b58\u6210\u529f|\u63d0\u4ea4\u6210\u529f|\u6210\u529f)/.test(bodyText),
      };
    });

    const success = dialogs.some((item) => /\u6210\u529f/.test(item.message)) || pageSignals.hasSuccessKeyword;
    await monitor.setPhase(
      success ? 'form_saved' : 'form_save_pending',
      success ? 'Draft save finished' : 'Draft save did not produce a success signal',
      popup
    );

    return {
      action: 'save_draft',
      attempted: true,
      success,
      dialogs,
      pageSignals,
      currentUrl: popup.url(),
    };
  } finally {
    popup.off('dialog', dialogHandler);
  }
}

async function uploadResearchSealAttachments(popup, attachments, monitor) {
  const dialogs = [];
  const dialogHandler = async (dialog) => {
    dialogs.push({
      type: dialog.type(),
      message: dialog.message(),
    });
    await dialog.accept().catch(() => {});
  };

  popup.on('dialog', dialogHandler);
  try {
    const context = popup.context();
    const knownPages = new Set(context.pages());
    const attachmentPagePromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);

    await popup.locator('#fj').waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
    await popup.locator('#fj').click({ force: true });

    const recordId = await waitForPopupRecordId(popup);
    const attachmentPage = await resolveAttachmentPage(context, knownPages, attachmentPagePromise);
    if (!attachmentPage) {
      throw new Error('Unable to locate the attachment page after clicking the attachment button.');
    }

    attachmentPage.setDefaultTimeout(timeoutMs);
    await monitor.watchPage(attachmentPage, 'attachment');
    await attachmentPage.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
    await attachmentPage.waitForTimeout(1500);
    await monitor.setPhase('attachment_page_ready', 'Attachment upload page opened', attachmentPage);

    const beforeKey = buildRunKey('usc_yzgl_kyyy_attachment_before');
    const beforeArtifacts = await saveAttachmentPageArtifacts(attachmentPage, beforeKey);

    const filePaths = attachments.map((item) => item.path);
    const fileNames = attachments.map((item) => item.name || path.basename(item.path));
    const target = await locateAttachmentUploadTarget(attachmentPage, filePaths);

    if (target.inputLocator) {
      await target.inputLocator.setInputFiles(filePaths);
    }

    const actions = [
      ...(target.revealActions || []),
      ...(await clickAttachmentActionButtons(attachmentPage, [/\u5f00\u59cb\u4e0a\u4f20/, /^\u4e0a\u4f20$/, /^\u786e\u5b9a$/, /^\u786e\u8ba4$/, /^\u4fdd\u5b58$/])),
    ];

    await attachmentPage.waitForTimeout(3000);
    const verification = await verifyAttachmentUpload(attachmentPage, fileNames);
    if (verification.success) {
      await dismissAttachmentSuccessDialog(attachmentPage);
    }
    await monitor.setPhase(
      verification.success ? 'attachments_uploaded' : 'attachments_unverified',
      verification.success ? 'Attachment upload verified' : 'Attachment upload could not be verified',
      attachmentPage
    );
    const afterKey = buildRunKey('usc_yzgl_kyyy_attachment_after');
    const afterArtifacts = await saveAttachmentPageArtifacts(attachmentPage, afterKey);

    return {
      attempted: true,
      success: verification.success,
      error: verification.success ? '' : 'Unable to verify attachment upload on the OA attachment page.',
      files: attachments.map((item) => ({
        name: item.name || path.basename(item.path),
        path: item.path,
        size: item.size || 0,
      })),
      dialogs,
      recordId,
      sourceUrl: attachmentPage.url(),
      actions,
      pageSignals: verification,
      artifacts: {
        before: beforeArtifacts,
        after: afterArtifacts,
        jsonPath: afterArtifacts.jsonPath,
      },
    };
  } finally {
    popup.off('dialog', dialogHandler);
  }
}

async function waitForPopupRecordId(popup) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await popup.locator('#S_JLNM').inputValue().catch(() => '');
    if (value && value.trim()) {
      return value.trim();
    }
    await popup.waitForTimeout(500);
  }
  return '';
}

async function resolveAttachmentPage(context, knownPages, attachmentPagePromise) {
  const directPage = await attachmentPagePromise;
  if (directPage) {
    await directPage.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
    return directPage;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidate = context.pages().find((item) => {
      if (knownPages.has(item)) {
        return false;
      }
      const currentUrl = item.url();
      return !currentUrl || currentUrl.includes('toAccessoryMainPage');
    });

    if (candidate) {
      await candidate.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
      return candidate;
    }

    await context.pages()[0]?.waitForTimeout(500);
  }

  return null;
}

function getAttachmentScopes(page) {
  return [
    { context: page, label: 'page', sourceUrl: page.url() },
    ...page.frames().map((frame, index) => ({
      context: frame,
      label: `frame:${index}`,
      sourceUrl: frame.url(),
    })),
  ];
}

async function locateAttachmentUploadTarget(page, filePaths) {
  const directMatch = await findAttachmentFileInput(page);
  if (directMatch) {
    return directMatch;
  }

  const revealActions = await revealAttachmentInput(page, filePaths);
  const revealedMatch = await findAttachmentFileInput(page);
  if (revealedMatch) {
    revealedMatch.revealActions = revealActions;
    return revealedMatch;
  }

  throw new Error('Unable to find a file input on the attachment page.');
}

async function findAttachmentFileInput(page) {
  for (const scope of getAttachmentScopes(page)) {
    const locator = scope.context.locator('input[type="file"]').first();
    if (await locator.count()) {
      return {
        inputLocator: locator,
        scopeLabel: scope.label,
        sourceUrl: scope.sourceUrl,
        revealActions: [],
      };
    }
  }

  return null;
}

async function revealAttachmentInput(page, filePaths) {
  const actions = [];
  const patterns = [/\u4e0a\u4f20\u9644\u4ef6/, /\u6dfb\u52a0\u9644\u4ef6/, /^\u6dfb\u52a0$/, /^\u4e0a\u4f20$/, /\u9009\u62e9\u6587\u4ef6/, /\u6d4f\u89c8/];

  for (const scope of getAttachmentScopes(page)) {
    for (const pattern of patterns) {
      const trigger = scope.context
        .locator('button, a, input[type="button"], input[type="submit"], span')
        .filter({ hasText: pattern })
        .first();

      if (!(await trigger.count())) {
        continue;
      }
      if (!(await trigger.isVisible().catch(() => false))) {
        continue;
      }

      const chooserPromise = page.waitForEvent('filechooser', { timeout: 1500 }).catch(() => null);
      await trigger.click({ force: true }).catch(() => {});
      const chooser = await chooserPromise;
      const actionLabel = `reveal:${pattern}`;
      actions.push(actionLabel);
      if (chooser) {
        await chooser.setFiles(filePaths);
        return [{ action: actionLabel, usedFileChooser: true }];
      }

      await page.waitForTimeout(1000);
      if (await findAttachmentFileInput(page)) {
        return actions.map((item) => ({ action: item }));
      }
    }
  }

  return actions.map((item) => ({ action: item }));
}

async function clickAttachmentActionButtons(page, patterns) {
  const actions = [];

  for (const pattern of patterns) {
    const scopes = getAttachmentScopes(page);
    let clicked = false;

    for (const scope of scopes) {
      const button = scope.context
        .locator('button, a, input[type="button"], input[type="submit"]')
        .filter({ hasText: pattern })
        .first();

      if (!(await button.count())) {
        continue;
      }
      if (!(await button.isVisible().catch(() => false))) {
        continue;
      }

      await button.click({ force: true }).catch(() => {});
      actions.push({ action: `click:${pattern}`, scope: scope.label });
      clicked = true;
      await page.waitForTimeout(1000);
      break;
    }

    if (clicked) {
      break;
    }
  }

  return actions;
}

async function verifyAttachmentUpload(page, fileNames) {
  const snapshot = await collectAttachmentPageSnapshot(page);
  const combinedText = snapshot.scopes.map((item) => item.bodyTextPreview).join(' ');
  const matchedFiles = fileNames.filter((name) => combinedText.includes(name));
  const successPattern = /(\u4e0a\u4f20\u6210\u529f|\u5171\u6709\s*\d+\s*\u4e2a\u6587\u4ef6\u4e0a\u4f20\u6210\u529f|\u9644\u4ef6\u4e0a\u4f20\u6210\u529f)/;
  const successByText = successPattern.test(combinedText);
  const uploadedCountMatch = combinedText.match(/\u5171\u6709\s*(\d+)\s*\u4e2a\u6587\u4ef6\u4e0a\u4f20\u6210\u529f/);
  const uploadedCount = uploadedCountMatch ? Number(uploadedCountMatch[1]) : 0;
  const successByCount = uploadedCount > 0 && uploadedCount >= Math.min(fileNames.length || 0, 1);

  return {
    success: matchedFiles.length === fileNames.length || matchedFiles.length > 0 || successByText || successByCount,
    matchedFiles,
    uploadedCount,
    successByText,
    bodyTextPreview: combinedText.slice(0, 1200),
    snapshot,
  };
}

async function dismissAttachmentSuccessDialog(page) {
  const confirmPatterns = [/^\u786e\u5b9a$/, /^\u77e5\u9053\u4e86$/, /^\u5173\u95ed$/];
  for (const pattern of confirmPatterns) {
    for (const scope of getAttachmentScopes(page)) {
      const button = scope.context
        .locator('button, a, input[type="button"], input[type="submit"]')
        .filter({ hasText: pattern })
        .first();

      if (!(await button.count())) {
        continue;
      }
      if (!(await button.isVisible().catch(() => false))) {
        continue;
      }

      await button.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      return;
    }
  }
}

async function saveAttachmentPageArtifacts(page, runKey) {
  const screenshotPath = path.join(ATTACHMENTS_DIR, `${runKey}.png`);
  const htmlPath = path.join(ATTACHMENTS_DIR, `${runKey}.html`);
  const jsonPath = path.join(ATTACHMENTS_DIR, `${runKey}.json`);
  const snapshot = await collectAttachmentPageSnapshot(page);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await fsp.writeFile(htmlPath, await page.content(), 'utf8');
  await fsp.writeFile(jsonPath, JSON.stringify(snapshot, null, 2), 'utf8');

  return {
    screenshotPath,
    htmlPath,
    jsonPath,
  };
}

async function collectAttachmentPageSnapshot(page) {
  const title = await page.title().catch(() => '');
  const scopes = [];

  for (const scope of getAttachmentScopes(page)) {
    try {
      const details = await scope.context.evaluate((meta) => {
        const visible = (node) => !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        return {
          label: meta.label,
          sourceUrl: meta.sourceUrl,
          bodyTextPreview: clean(document.body.innerText).slice(0, 2000),
          buttons: Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
            .map((node, index) => ({
              index,
              tag: node.tagName,
              id: node.id || '',
              name: node.name || '',
              text: clean(node.innerText || node.value),
              className: node.className || '',
              visible: visible(node),
            }))
            .filter((item) => item.text),
          inputs: Array.from(document.querySelectorAll('input, textarea, select'))
            .map((node, index) => ({
              index,
              tag: node.tagName,
              type: node.type || '',
              id: node.id || '',
              name: node.name || '',
              value: node.value || '',
              placeholder: node.placeholder || '',
              className: node.className || '',
              visible: visible(node),
            })),
        };
      }, { label: scope.label, sourceUrl: scope.sourceUrl });
      scopes.push(details);
    } catch (error) {
      scopes.push({
        label: scope.label,
        sourceUrl: scope.sourceUrl,
        error: error.message,
      });
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    url: page.url(),
    title,
    scopes,
  };
}

async function loadAutofillPayload(jsonPath) {
  const absolutePath = path.resolve(PROJECT_ROOT, jsonPath);
  const raw = await fsp.readFile(absolutePath, 'utf8');
  const payload = JSON.parse(raw);
  const sealTypes = Array.isArray(payload.seal_types)
    ? payload.seal_types
    : String(payload.seal_types || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments.map((item) => normalizeAttachmentEntry(item)).filter(Boolean)
    : [];

  const normalized = {
    guide_key: payload.guide_key || payload.guideKey || TEXTS.researchSeal,
    subject: String(payload.subject || '').trim(),
    seal_types: sealTypes,
    contract_amount: String(payload.contract_amount || '').trim(),
    description: String(payload.description || '').trim(),
    phone: String(payload.phone || '').trim(),
    remark: String(payload.remark || '').trim(),
    action: String(payload.action || 'save_draft').trim() || 'save_draft',
    attachments,
  };

  if (!normalized.subject) {
    throw new Error('Autofill payload is missing "subject".');
  }
  if (!normalized.seal_types.length) {
    throw new Error('Autofill payload is missing "seal_types".');
  }
  if (!normalized.description) {
    throw new Error('Autofill payload is missing "description".');
  }
  if (!normalized.phone) {
    throw new Error('Autofill payload is missing "phone".');
  }
  if (!['fill_only', 'save_draft'].includes(normalized.action)) {
    throw new Error(`Unsupported autofill action: ${normalized.action}`);
  }
  if (normalized.attachments.length && normalized.action !== 'save_draft') {
    throw new Error('Attachments require the save_draft action because OA needs a saved record before opening the attachment page.');
  }

  return normalized;
}

function normalizeAttachmentEntry(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    const resolvedPath = path.resolve(PROJECT_ROOT, entry);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Attachment file does not exist: ${resolvedPath}`);
    }
    return {
      name: path.basename(resolvedPath),
      path: resolvedPath,
      size: 0,
    };
  }

  const rawPath = String(entry.path || '').trim();
  if (!rawPath) {
    return null;
  }

  const resolvedPath = path.resolve(PROJECT_ROOT, rawPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Attachment file does not exist: ${resolvedPath}`);
  }

  return {
    name: String(entry.name || path.basename(resolvedPath)).trim() || path.basename(resolvedPath),
    path: resolvedPath,
    size: Number(entry.size || 0),
  };
}

async function extractGuideDataFromFrame(frame) {
  return frame.evaluate((texts) => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const contentNode = document.querySelector('#content');
    const nextButton = document.querySelector('#next');
    const paragraphs = Array.from((contentNode || document).querySelectorAll('p'))
      .map((node) => clean(node.innerText))
      .filter(Boolean);

    const responsibles = [];
    const notes = [];

    for (const line of paragraphs) {
      const normalizedLine = line.replace(/^n\s*/, '');
      if (
        normalizedLine.startsWith('\u6ce8\uff1a') ||
        normalizedLine.startsWith('\u6ce8:') ||
        normalizedLine.startsWith('1.') ||
        normalizedLine.startsWith('2.')
      ) {
        notes.push(normalizedLine);
        continue;
      }

      const splitIndex = normalizedLine.lastIndexOf('\uff1a');
      if (splitIndex > 0) {
        const category = normalizedLine.slice(0, splitIndex);
        const owner = normalizedLine.slice(splitIndex + 1).trim();
        if (owner) {
          responsibles.push({ category, owner });
        }
      }
    }

    return {
      fileKey: 'usc_yzgl_kyyy_guide',
      guideKey: texts.researchSeal,
      sourceUrl: window.location.href,
      title: clean(document.querySelector('#title')?.innerText || document.title),
      sectionTitle: texts.guideSection,
      extractedAt: new Date().toISOString(),
      actionButton: {
        id: nextButton?.id || '',
        text: clean(nextButton?.value || nextButton?.innerText),
      },
      responsibles,
      notes,
      paragraphs,
      rawText: clean(document.body.innerText),
      rawHtml: contentNode?.innerHTML || '',
    };
  }, {
    researchSeal: TEXTS.researchSeal,
    guideSection: TEXTS.guideSection,
  });
}

async function collectResearchSealFormData(popup) {
  return popup.evaluate((texts) => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const visible = (node) => !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);

    const rows = Array.from(document.querySelectorAll('tr'))
      .map((tr, index) => {
        const cells = Array.from(tr.querySelectorAll('td,th')).map((cell, cellIndex) => ({
          cellIndex,
          text: clean(cell.innerText),
          className: cell.className || '',
        }));

        return {
          index,
          text: clean(tr.innerText),
          cells: cells.filter((cell) => cell.text),
        };
      })
      .filter((row) => row.text);

    const fields = Array.from(document.querySelectorAll('input, textarea, select'))
      .map((field, index) => {
        if (!visible(field)) {
          return null;
        }

        const row = field.closest('tr');
        const cell = field.closest('td,th');
        const cells = row ? Array.from(row.querySelectorAll('td,th')) : [];
        const cellIndex = cell ? cells.indexOf(cell) : -1;

        let label = '';
        for (let i = cellIndex - 1; i >= 0; i -= 1) {
          const candidate = clean(cells[i]?.innerText);
          if (candidate) {
            label = candidate;
            break;
          }
        }

        if (!label && cells.length) {
          label = clean(cells[0].innerText);
        }

        return {
          index,
          tag: field.tagName,
          type: field.type || '',
          id: field.id || '',
          name: field.name || '',
          label,
          rowText: clean(row?.innerText),
          value: field.value || '',
          placeholder: field.placeholder || '',
          checked: typeof field.checked === 'boolean' ? field.checked : undefined,
          disabled: !!field.disabled,
          readOnly: !!field.readOnly,
        };
      })
      .filter(Boolean);

    const actionButtons = Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"]'))
      .map((node, index) => ({
        index,
        tag: node.tagName,
        id: node.id || '',
        text: clean(node.innerText || node.value),
        className: node.className || '',
        visible: visible(node),
      }))
      .filter((item) => item.visible && item.text);

    const stampOptions = fields
      .filter((field) => field.type === 'checkbox')
      .map((field) => ({ label: field.value, checked: !!field.checked }));

    const summary = {
      formTitle: clean(document.querySelector('title')?.innerText || document.title),
      sheetTitle: rows[0]?.text || '',
      department: rows[1]?.text.replace(/^.*\uff1a/, '') || '',
      applyDate: rows[2]?.cells?.[1]?.text || '',
      registerNo: rows[2]?.cells?.[3]?.text || '',
      operator: rows[7]?.cells?.[1]?.text || '',
      note: rows[13]?.text || '',
    };

    return {
      fileKey: 'usc_yzgl_kyyy_form',
      formKey: texts.researchSeal,
      sourceUrl: window.location.href,
      title: document.title,
      openedAt: new Date().toISOString(),
      workflow: [
        texts.businessApproval,
        texts.sealMatters,
        texts.researchSeal,
        '\u65b0\u5efa',
        texts.guideConfirm,
      ],
      summary,
      actionButtons: actionButtons.map(({ visible, ...item }) => item),
      stampOptions,
      fields,
      rows,
      rawText: clean(document.body.innerText),
    };
  }, {
    businessApproval: TEXTS.businessApproval,
    sealMatters: TEXTS.sealMatters,
    researchSeal: TEXTS.researchSeal,
    guideConfirm: TEXTS.guideConfirm,
  });
}

async function expandMenu(page, text) {
  const locator = page.locator('a').filter({ hasText: text }).first();
  if (!(await locator.count())) {
    throw new Error(`Unable to find menu: ${text}`);
  }

  await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  const box = await locator.boundingBox();
  await locator.click();
  await page.waitForTimeout(1200);
  return box ? Math.round(box.y + box.height) : 0;
}

async function openNestedMenu(page, groupText, itemText) {
  const group = page.locator('a.tt3').filter({ hasText: groupText }).first();
  if (!(await group.count())) {
    throw new Error(`Unable to find nested menu group: ${groupText}`);
  }

  await group.click();
  await page.waitForTimeout(800);

  const item = page.locator('a.tt6').filter({ hasText: itemText }).first();
  if (!(await item.count())) {
    throw new Error(`Unable to find nested menu item: ${itemText}`);
  }

  await item.click();
  await page.waitForTimeout(1500);
}

async function openMenuLink(page, text) {
  const locator = page.locator('a').filter({ hasText: text }).first();
  if (!(await locator.count())) {
    throw new Error(`Unable to find a menu link that matches: ${text}`);
  }

  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const previousUrl = page.url();
  await locator.click();

  await page.waitForFunction(
    (oldUrl) => window.location.href !== oldUrl,
    previousUrl,
    { timeout: 15_000 }
  ).catch(() => {});

  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
}

async function gotoAndSettle(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
}

async function saveArtifacts(context, page, monitor) {
  const meta = {
    url: page.url(),
    title: await page.title(),
    capturedAt: new Date().toISOString(),
  };

  await context.storageState({ path: STORAGE_STATE_PATH });
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  await fsp.writeFile(HTML_PATH, await page.content(), 'utf8');
  await fsp.writeFile(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
  if (monitor) {
    await monitor.snapshotPage(page, 'Artifacts refreshed');
  }
}

async function collectProbeData(page) {
  return page.evaluate(() => {
    const text = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const take = (nodes, mapper, limit = 50) => Array.from(nodes).slice(0, limit).map(mapper);

    return {
      url: window.location.href,
      title: document.title,
      inputs: take(document.querySelectorAll('input'), (node, index) => ({
        index,
        id: node.id || '',
        name: node.name || '',
        type: node.type || '',
        placeholder: node.placeholder || '',
        value: node.value || '',
      })),
      buttons: take(
        document.querySelectorAll('button, input[type="button"], input[type="submit"]'),
        (node, index) => ({
          index,
          id: node.id || '',
          className: node.className || '',
          text: text(node.innerText || node.value),
        })
      ).filter((item) => item.text),
      links: take(document.querySelectorAll('a'), (node, index) => ({
        index,
        href: node.href || '',
        text: text(node.innerText),
      })).filter((item) => item.text),
      bodyText: text(document.body.innerText).slice(0, 2500),
    };
  });
}

async function findFrame(page, predicate, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = page.frames().find(predicate);
    if (frame) {
      return frame;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for frame: ${label}`);
}

async function extractVisibleError(page) {
  const selectors = [
    '.ant-message-notice-content',
    '.ant-form-item-explain',
    '.ant-alert-message',
    '.ant-alert-description',
    '.error',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      const text = (await locator.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function resolveBrowserPath() {
  const configuredPath = process.env.USCOA_BROWSER_PATH;
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  for (const candidate of COMMON_BROWSER_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('No supported browser was found. Set USCOA_BROWSER_PATH to Chrome or Edge.');
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex === -1) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnvFlag(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
}

function getOptionalFlag(name, fallback) {
  const raw = String(process.env[name] || '').toLowerCase();
  if (!raw) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function getPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const direct = argv.find((item) => item.startsWith(prefix));
  if (direct) {
    return direct.slice(prefix.length);
  }

  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }

  return '';
}

function normalizeGuideKey(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const normalized = raw.toLowerCase();
  if (
    raw === TEXTS.researchSeal ||
    normalized === 'research-seal' ||
    normalized === 'usc_yzgl_kyyy_guide'
  ) {
    return 'usc_yzgl_kyyy_guide';
  }

  return raw;
}

function buildRunKey(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}_${stamp}`;
}

function resolveRunAction() {
  if (isProbeMode) return 'probe';
  if (openResearchSealFormMode) return 'open_form';
  if (extractGuideKey) return 'extract_guide';
  if (inspectFormKey) return 'inspect_form';
  if (autofillJsonPath) return 'autofill';
  if (dumpMenuText) return 'dump_menu';
  if (targetUrl) return 'open_target_url';
  if (menuText) return 'open_menu';
  if (forceFreshLogin) return 'fresh_login';
  if (isHeadful) return 'headful_login';
  return 'login';
}

function createBrowserMonitor(action) {
  const state = {
    action,
    status: 'starting',
    phase: 'booting',
    currentMessage: 'Preparing browser automation',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activePageId: '',
    lastError: '',
    details: {},
    pages: [],
    activeSnapshot: null,
    events: [],
  };

  const pageIds = new WeakMap();
  const trackedPages = new WeakSet();
  let pageSequence = 0;
  let previewClient = null;
  let previewPage = null;
  let previewPageId = '';
  let lastPreviewWriteAt = 0;

  const persist = async () => {
    state.updatedAt = new Date().toISOString();
    await fsp.writeFile(BROWSER_STATE_PATH, JSON.stringify(state, null, 2), 'utf8').catch(() => {});
  };

  const trimList = (items, limit) => items.slice(Math.max(0, items.length - limit));

  const getPageId = (page, fallbackLabel = 'page') => {
    const existing = pageIds.get(page);
    if (existing) {
      return existing;
    }

    const next = `${fallbackLabel}_${++pageSequence}`;
    pageIds.set(page, next);
    return next;
  };

  const updatePageEntry = (page, patch, label = 'page') => {
    const pageId = getPageId(page, label);
    const index = state.pages.findIndex((item) => item.id === pageId);
    const previous = index >= 0 ? state.pages[index] : { id: pageId, label };
    const next = {
      ...previous,
      ...patch,
      id: pageId,
      label: patch.label || previous.label || label,
      updatedAt: new Date().toISOString(),
    };

    if (index >= 0) {
      state.pages[index] = next;
    } else {
      state.pages.push(next);
    }

    state.pages = trimList(state.pages, 8);
    state.activePageId = pageId;
    return pageId;
  };

  const pushEvent = async (type, message, extra = {}) => {
    state.events.push({
      at: new Date().toISOString(),
      type,
      message,
      ...extra,
    });
    state.events = trimList(state.events, 60);
    await persist();
  };

  const collectLivePageState = async (page) => {
    if (!page || page.isClosed()) {
      return null;
    }

    const title = await page.title().catch(() => '');
    const snapshot = await page.evaluate(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const visible = (node) => !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
      const take = (nodes, mapper, limit = 10) => Array.from(nodes).filter(visible).slice(0, limit).map(mapper);
      const extractFeed = (patterns, limit = 8) => {
        const matchesPattern = (text) => patterns.some((pattern) => pattern.test(text));
        const seen = new Set();
        const items = [];

        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, span, div, td, th, li, a'))
          .filter(visible)
          .map((node) => ({ node, text: clean(node.innerText || node.textContent) }))
          .filter((item) => item.text && matchesPattern(item.text))
          .slice(0, 6);

        const collectEntries = (root, headingText = '') => {
          if (!root || !visible(root)) {
            return;
          }

          const candidates = Array.from(root.querySelectorAll('a, li, tr, p, div, span, td'))
            .filter(visible)
            .map((node) => clean(node.innerText || node.textContent))
            .filter((text) => text && text !== headingText && text.length >= 4 && text.length <= 120);

          for (const text of candidates) {
            if (seen.has(text)) {
              continue;
            }
            seen.add(text);
            items.push({
              title: text,
              text,
              source: headingText || '',
            });
            if (items.length >= limit) {
              return;
            }
          }
        };

        for (const heading of headings) {
          const root = heading.node.closest('section, article, table, .portlet, .panel, .card, .module, .box, .list')
            || heading.node.parentElement;
          collectEntries(root, heading.text);
          collectEntries(heading.node.nextElementSibling, heading.text);
          if (items.length >= limit) {
            break;
          }
        }

        return items.slice(0, limit);
      };

      return {
        url: window.location.href,
        bodyTextPreview: clean(document.body.innerText).slice(0, 1000),
        buttons: take(
          document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'),
          (node) => clean(node.innerText || node.value)
        ).filter(Boolean),
        inputs: take(
          document.querySelectorAll('input, textarea, select'),
          (node) => ({
            id: node.id || '',
            name: node.name || '',
            type: node.type || node.tagName || '',
            placeholder: node.placeholder || '',
            valuePreview: clean(node.value).slice(0, 60),
          }),
          12
        ),
        notices: extractFeed([/通知公告/, /公告通知/, /通知/]),
        todoItems: extractFeed([/待办待阅/, /待办事宜/, /待办事项/, /待办/, /待阅/]),
        frameCount: window.frames.length,
      };
    }).catch(() => null);

    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      title,
    };
  };

  const stopLivePreview = async () => {
    if (!previewClient) {
      previewClient = null;
      previewPage = null;
      previewPageId = '';
      return;
    }

    await previewClient.send('Page.stopScreencast').catch(() => {});
    await previewClient.detach().catch(() => {});
    previewClient = null;
    previewPage = null;
    previewPageId = '';
  };

  const connectLivePreview = async (page, label = 'page') => {
    if (!page || page.isClosed()) {
      return;
    }

    const pageId = getPageId(page, label);
    if (previewPage === page && previewClient) {
      previewPageId = pageId;
      return;
    }

    await stopLivePreview();

    const client = await page.context().newCDPSession(page).catch(() => null);
    if (!client) {
      await pushEvent('preview_unavailable', 'Unable to attach a live preview session.', { pageId });
      return;
    }

    previewClient = client;
    previewPage = page;
    previewPageId = pageId;

    client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      void (async () => {
        await client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});

        if (previewPage !== page) {
          return;
        }

        const now = Date.now();
        if (now - lastPreviewWriteAt < 450) {
          return;
        }
        lastPreviewWriteAt = now;

        await fsp.writeFile(LIVE_PREVIEW_PATH, Buffer.from(data, 'base64')).catch(() => {});
        state.livePreview = {
          pageId,
          updatedAt: new Date().toISOString(),
          width: metadata && metadata.deviceWidth ? metadata.deviceWidth : null,
          height: metadata && metadata.deviceHeight ? metadata.deviceHeight : null,
        };
        await persist();
      })();
    });

    await client.send('Page.enable').catch(() => {});
    const started = await client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 65,
      maxWidth: 1440,
      maxHeight: 960,
      everyNthFrame: 1,
    }).then(() => true).catch(() => false);

    if (!started) {
      await stopLivePreview();
      await pushEvent('preview_unavailable', 'Live preview could not be started for this page.', { pageId });
      return;
    }

    await pushEvent('preview_connected', `Live preview connected to ${label}`, { pageId });
  };

  const snapshotPage = async (page, reason = '') => {
    if (!page || page.isClosed()) {
      return;
    }

    const pageId = updatePageEntry(page, {
      url: page.url(),
      title: await page.title().catch(() => ''),
      closed: false,
    });

    const liveState = await collectLivePageState(page);
    if (liveState) {
      updatePageEntry(page, {
        url: liveState.url,
        title: liveState.title,
        bodyTextPreview: liveState.bodyTextPreview,
      });
      state.activeSnapshot = {
        pageId,
        reason,
        capturedAt: new Date().toISOString(),
        ...liveState,
      };
    }

    if (reason) {
      await pushEvent('page', reason, {
        pageId,
        url: page.url(),
      });
      return;
    }

    await persist();
  };

  const watchPage = async (page, label = 'page') => {
    const pageId = updatePageEntry(page, {
      label,
      url: page.url(),
      title: await page.title().catch(() => ''),
      closed: false,
    }, label);

    if (trackedPages.has(page)) {
      state.activePageId = pageId;
      await persist();
      return;
    }

    trackedPages.add(page);
    await connectLivePreview(page, label);

    page.on('domcontentloaded', () => {
      void snapshotPage(page, 'DOM content loaded');
    });

    page.on('load', () => {
      void snapshotPage(page, 'Page load event fired');
    });

    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) {
        return;
      }
      void snapshotPage(page, 'Main frame navigated');
    });

    page.on('dialog', (dialog) => {
      void pushEvent('dialog', dialog.message(), {
        pageId,
        dialogType: dialog.type(),
      });
    });

    page.on('close', () => {
      updatePageEntry(page, {
        closed: true,
      }, label);
      if (previewPage === page) {
        void stopLivePreview();
      }
      void pushEvent('page_closed', `${label} page closed`, { pageId });
    });

    await snapshotPage(page, `Tracking ${label} page`);
  };

  const attachContext = async (context) => {
    context.on('page', (page) => {
      void watchPage(page, 'popup');
    });
    await persist();
  };

  const reset = async (details = {}) => {
    state.status = 'starting';
    state.phase = 'booting';
    state.currentMessage = 'Preparing browser automation';
    state.details = { ...details };
    state.lastError = '';
    state.pages = [];
    state.activeSnapshot = null;
    state.events = [];
    state.livePreview = null;
    await stopLivePreview();
    await persist();
  };

  const setPhase = async (phase, message, page = null, extra = {}) => {
    state.status = 'running';
    state.phase = phase;
    state.currentMessage = message;
    state.details = {
      ...state.details,
      ...extra,
    };

    if (page) {
      await snapshotPage(page, message);
      await pushEvent('phase', message, {
        phase,
        pageId: state.activePageId,
      });
      return;
    }

    await pushEvent('phase', message, { phase });
  };

  const complete = async (page, message) => {
    state.status = 'completed';
    state.phase = 'completed';
    state.currentMessage = message;
    if (page) {
      await snapshotPage(page, message);
      await stopLivePreview();
      return;
    }
    await stopLivePreview();
    await persist();
  };

  const fail = async (error) => {
    state.status = 'failed';
    state.phase = 'failed';
    state.currentMessage = error && error.message ? error.message : 'Run failed';
    state.lastError = state.currentMessage;
    await stopLivePreview();
    await pushEvent('error', state.currentMessage);
  };

  return {
    attachContext,
    complete,
    fail,
    reset,
    setPhase,
    snapshotPage,
    stopLivePreview,
    watchPage,
  };
}




