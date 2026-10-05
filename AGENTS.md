# Cella 项目级约束（agent 开工必读）

## 项目概况

Cella：桌面端 xls/xlsx 表格查看器（pywebview + WebView2 + 原生 HTML/CSS/JS 前端，无框架），视图调整可写回原文件。开源仓库：https://github.com/Uky-Otonashi/Cella

- `src/main.py` — 入口：pywebview 外壳、js_api 桥（文件对话框/窗口控制/写回）、启动居中、`--dev` 调试服务器
- `src/xlio.py` — Excel 读写引擎（值+颜色；视图写回）
- `src/ui/{index.html, app.js, app.css}` — 前端全部逻辑（虚拟滚动/冻结/筛选/排序/搜索/多文件）
- `src/Cella.spec` — PyInstaller 打包配置
- 开发环境与打包命令见 `doc/cella/deploy.md`（本地目录，见下）

## 经验沉淀制度（核心约束，必须遵守）

本项目在 `doc/` 维护踩坑经验库（**本地目录，已被 .gitignore 排除，不随仓库分发**）：

1. **遇坑先查**：排障超过几分钟、或问题似曾相识、或涉及 桥/拖拽/行高/冻结/排序/打包/Windows 交互 → 先按 `doc/README.md` 的索引查经验文档再动手，避免重复踩坑。
2. **解决后必沉淀**：非平凡问题（反复试错、根因隐蔽、可泛化规律）解决后，按**可复用性分层**写入对应文件——判定口诀"**去掉 Cella 上下文后结论还成立吗**"：
   - 成立 → `doc/general/`（web-frontend / python-shell / windows-desktop / python-desktop-frameworks 之一，跨项目可复用）；
   - 不成立 → `doc/cella/`（data-model / rendering / interaction / testing / deploy 之一，项目专有）；
   - 条目格式：`坑标题（T 号）+ 现象/根因/正解/教训`；通用原理在 general 详写、cella 引用不重复展开。
3. **写完必提交**：每次更新/新增 doc 内容后**立即**在 doc/ 内执行 `git add -A && git commit`（doc/ 是独立本地 git 仓库，提交是防丢与误删误改可恢复的唯一手段）；**永不给 doc 仓库配 remote、永不移入外层仓库**。

## 版本管理纪律

- **外层仓库是公开仓库**：严禁提交敏感数据、内部工单、测试样本、本机绝对路径；提交信息用英文；
- `doc/`（经验库）与 `.scratch/`（工单/handoff）仅本地，已 ignore；
- 关键节点（批次完成/可运行状态/文档落档）主动提交；例行提交不必逐次请示；
- **README 双语同步**：`README.md`（中文，GitHub 默认展示）与 `README.en.md`（英文）互为翻译，改内容必须两份同步改。

## 工单与交接

- 多步工作先落工单到 `.scratch/tickets/`（一事项一文件、带验收标准），流程=工单→实现→只读审查→自动回归→提交记账；
- T 工单号顺延（截至 2026-10-06 已用到 T023：界面 i18n，见 `.scratch/tickets/T023-ui-i18n.md`）；
- 会话状态恢复源：git log（外层+doc 两仓库）→ `.scratch/` 工单 → zcode 项目记忆。

## 界面语言（T023 已交付，2026-10-06）

- UI 支持**中/英**双语：`src/ui/lang.js` 持有 zh/en 两张字典 + `t(key, params)` 取词；默认跟随系统语言（`navigator.language`，非 en 回退 zh），选择持久化于 localStorage（`xv-lang`），标题栏按钮即时切换；
- **新增 UI 文案必须进字典**（zh/en 两份同加），禁止在 HTML/JS 里硬编码中文或英文；静态 HTML 用 `data-i18n`/`data-i18n-title`/`data-i18n-ph` 属性，动态文案在构建处调 `t()`；
- **数据内容永不翻译**：单元格、列名、文件名、sheet 名是用户数据；
- 后端返回的用户可见说明用**稳定码**（如 `note:xxx`，前端字典翻译，未知码原样透传）；原生对话框文案经 js_api 传语言参数（见 `pick_and_load(lang)`）；
- JS 全局函数名 `t` 是单字母——**app.js 内不得声明同名局部变量**（遮蔽后轻则取词失败、重则 TDZ 崩溃，T023 实踩已全量改名）。
