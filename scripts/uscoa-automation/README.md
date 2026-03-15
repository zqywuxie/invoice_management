# USCOA 自动化脚本

这个目录保存南华大学 OA 站点 `http://uscoa.usc.edu.cn/page/index` 的浏览器自动化脚本。

当前能力：
- 自动跳转到 CAS 登录页
- 自动填充账号密码并点击登录
- 复用已保存的登录会话，减少重复登录
- 登录后按目标 URL 或菜单文字继续跳转
- 展开指定左侧菜单并导出当前可见下拉项
- 提取“新建”前置须知并保存为 JSON
- 自动点击须知确认并导出后续新建表单结构
- 保存最近一次页面截图、HTML 和会话状态

## 目录说明

- `uscoa-login.js`: 主脚本
- `.env.example`: 配置模板
- `.output/storage-state.json`: 已登录会话
- `.output/last-page.png`: 最近一次页面截图
- `.output/last-page.html`: 最近一次页面 HTML
- `.output/last-page.json`: 最近一次页面元信息
- `.output/guides/*.json`: 导出的须知结构化数据
- `.output/forms/*.json`: 导出的表单结构化数据

## 配置

复制 `.env.example` 为 `.env`，填写本地账号密码。

```env
USCOA_USERNAME=你的学号或工号
USCOA_PASSWORD=你的密码
USCOA_URL=http://uscoa.usc.edu.cn/page/index
USCOA_TARGET_URL=
USCOA_MENU_TEXT=
USCOA_HEADFUL=0
USCOA_REUSE_SESSION=1
USCOA_REMEMBER_ME=0
USCOA_TIMEOUT_MS=45000
USCOA_BROWSER_PATH=
```

说明：
- `USCOA_TARGET_URL`: 登录后直接访问指定地址。
- `USCOA_MENU_TEXT`: 登录后按菜单文字点击，例如 `待办事宜`。
- `USCOA_REUSE_SESSION=1`: 如果已有 `.output/storage-state.json`，优先复用登录态。
- `USCOA_HEADFUL=1`: 用有界面浏览器运行，便于观察过程。

## 用法

探测当前页面：

```bash
npm run probe
```

正常登录：

```bash
npm run login
```

有界面登录：

```bash
npm run login:headful
```

强制重新登录：

```bash
node uscoa-login.js --fresh-login
```

按菜单文字进入指定页面：

```bash
node uscoa-login.js --menu 待办事宜
```

导出左侧菜单展开后的可见下拉项：

```bash
node uscoa-login.js --dump-menu 业务审批
```

导出“科研事项用印”新建前的须知 JSON：

```bash
node uscoa-login.js --extract-guide-json 科研事项用印
```

自动点击须知确认并导出“科研事项用印”新建表单：

```bash
node uscoa-login.js --inspect-form 科研事项用印
```

按目标 URL 直接跳转：

```bash
node uscoa-login.js --target-url http://uscoa.usc.edu.cn/common/WORK_TODO
```
