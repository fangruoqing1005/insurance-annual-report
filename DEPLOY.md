# Cloudflare Pages 部署指引（云模式：全流程操作台）

本仓库同时支持两种模式：
- **静态模式（GitHub Pages）**：只读展示，无执行能力（下载/提取按钮禁用）
- **云模式（Cloudflare Pages + Functions + R2）**：完整全流程操作台——选公司 → 下载/上传 PDF → AI 提取 → 入库 → 分析

以下步骤在你的电脑上执行一次即可。

## 前置条件

1. 注册 Cloudflare 账号（若已在用 `insurance-annual-report.pages.dev` 则跳过）
2. 本机安装 Node.js 18+（已有）
3. 准备 DeepSeek API Key（提取用，也可换其他 OpenAI 兼容接口）

## 一、安装 wrangler

```bash
npm install -g wrangler
```

## 二、登录 Cloudflare

```bash
wrangler login
```
浏览器会打开 Cloudflare 授权页，点 Allow 即可（自动获取 API Token，无需手动创建）。

## 三、创建 R2 存储桶（存 PDF / 数据库 / 模板）

```bash
wrangler r2 bucket create insurance-annual-report
```

## 四、设置环境变量（敏感信息，不进代码）

```bash
# DeepSeek API Key（必填）
wrangler pages secret put AI_API_KEY
# 输入你的 sk-xxx 即可

# 可选：管理密码（页面上的删除/上传/提取需要；不设置则无鉴权，建议设置）
wrangler pages secret put ADMIN_PASS

# 可选：换模型（默认 deepseek-chat）
wrangler pages secret put AI_MODEL
```

## 五、部署

```bash
# 项目根目录
npm install
wrangler pages deploy .
```

部署完成后输出 `https://insurance-annual-report.pages.dev/`（若已有该项目会覆盖更新）。

> 若已有 Cloudflare Pages 项目（`insurance-annual-report`），`wrangler pages deploy .` 会自动关联同名项目；
> 若想新建，加 `--project-name insurance-annual-report`。

## 六、验证云模式

1. 打开部署后的页面
2. 侧边栏「年报下载」页顶部出现 **云模式操作区**（目标公司 / 报告期 / 下载PDF / 上传PDF / AI提取入库）
3. 数据库页底部出现 **数据管理**（范围删除 / 上传导入）
4. 智能提取页顶部出现 **模板管理**（下载 / 上传覆盖 163 行模板）
5. 若设置了 ADMIN_PASS，首次操作会要求输入管理密码（保存在浏览器 localStorage）

## 使用流程

1. **年报下载**：输入公司名（如"中国人寿"）→ 点「下载 PDF」（若配置了自动下载地址）或「上传 PDF」手动提交文件
2. **AI 提取入库**：对已上传 PDF 的公司点「AI 提取入库」→ 后端自动完成 定位报表→逐页提取→勾稽验证→入库（3-8分钟）
3. **数据库/分析**：提取完成后自动刷新，40 张图表立即可用
4. **数据管理**：可范围删除误数据、上传 JSON 增量合并（测试/修正用）
5. **模板管理**：下载当前 163 行模板、上传新模板覆盖（下次提取生效）

## 常见问题

- **执行按钮灰色**：未部署到 Cloudflare（静态模式），部署后自动启用
- **提取提示"未授权"**：设置了 ADMIN_PASS 后需在页面首次操作时输入一次
- **"未找到 PDF"**：该公司 PDF 未上传，先点「下载 PDF」或「上传 PDF」
- **勾稽 FAIL / 行名可疑**：AI 提取的个别指标需人工核对（提取报告会列出），可用数据库页范围删除后手动修正
- **自动下载地址**：`sources.json`（R2 中）可配置公司→PDF URL 映射实现全自动下载；未配置的公司走"上传 PDF"

## 文件结构

```
functions/            Cloudflare Pages Functions（后端）
  api/                data / download / extract / template 四个接口
  _lib/               db(R2) / pdf(pdfjs解析) / extractor(AI提取) / deepseek / check(勾稽) / auth
wrangler.jsonc        R2 绑定与变量配置
index.html            前端（静态 + 云模式自动切换）
data.js               静态数据库（云模式下被 /api/data 动态数据覆盖）
DEPLOY.md             本文件
```

## 本地调试后端

```bash
npm install
wrangler pages dev .   # 启动本地 Pages 环境，访问 http://localhost:8788
```
本地调试同样需要 `AI_API_KEY`（可用 `wrangler pages secret put` 或在 dashboard 配置）。
