# Cloudflare Pages 部署指引（云模式：全流程操作台 · KV 存储版）

本仓库同时支持两种模式：
- **静态模式（GitHub Pages）**：只读展示，无执行能力（下载/提取按钮禁用）
- **云模式（Cloudflare Pages + Functions + KV）**：完整全流程操作台——选公司 → 下载/上传 PDF → AI 提取 → 入库 → 分析

存储使用 **Workers KV**（免费套餐自带，**无需绑定信用卡**），替代 R2。

> 本指引为「Dashboard 手动操作」版，全程不用 wrangler 命令行。

## 前置条件

1. Cloudflare 账号（已注册）
2. GitHub 仓库 `fangruoqing1005/insurance-annual-report`（代码需已推送本仓库）
3. DeepSeek API Key（`sk-` 开头，提取用）

## 一、创建 KV namespace（免费，无需绑卡）

1. 打开 https://dash.cloudflare.com 登录
2. 左侧导航 → **Workers 和 Pages** → **KV** 标签页
3. 点 **创建命名空间 / Create a namespace**：
   - 名称填 `insurance-kv`
   - 创建
4. 创建后记录页面上显示的 **Namespace ID**（形如 `a1b2c3d4...`，后续可选用于 wrangler 配置）

## 二、Git 方式创建 Pages 项目（关键：必须是 Git 连接，Direct Upload 不支持 Functions）

1. 左侧导航 → **Workers 和 Pages** → **创建 / Create** → **Pages**
2. 选 **连接到 Git / Connect to Git** → 授权 GitHub → 选仓库 `fangruoqing1005/insurance-annual-report`
3. 构建设置：
   - Framework preset：**None**
   - Build command：**`npm install`**（⚠️ 必填！否则 Functions 依赖 pdfjs-dist 不会安装，部署报 `Could not resolve "pdfjs-dist/legacy/build/pdf.mjs"`）
   - Build output directory：**留空**
4. 点 **保存并部署 / Save and Deploy**（首次部署静态页面）

> ⚠️ 若之前用「直接上传」创建过同名项目，请删除后重新以 Git 方式创建（否则 Functions 不生效）。

## 三、绑定 KV 到 Pages 项目

1. 进入项目 → **设置 / Settings** → **函数 / Functions** → **KV 命名空间绑定 / KV namespace bindings**
2. 点 **添加绑定 / Add binding**：
   - 变量名 / Variable name：`STORE`（必须与代码一致）
   - KV 命名空间：`insurance-kv`
3. 保存

## 四、设置环境变量

项目 **设置 / Settings** → **环境变量 / Environment variables** → **生产 / Production** → **添加变量**：

| 变量名 | 值 | 必填 |
|--------|-----|------|
| `AI_API_KEY` | 你的 DeepSeek API Key（sk- 开头） | ✅ |
| `ADMIN_PASS` | 自定义管理密码（页面删除/上传/提取需输入） | 建议 |
| `AI_MODEL` | 可选，默认 `deepseek-chat` | 否 |

保存后：**部署 / Deployments** → **重试部署 / Retry deployment**（环境变量与绑定在重新构建后生效）。

## 五、初始化数据（上传数据库与模板）

KV 是空的，首次部署后需要初始化：

1. 打开 `https://insurance-annual-report.pages.dev` → 数据库页 → 底部**数据管理**区
2. **上传导入**：选择本地 `database.json`（本项目根目录已有）→ 上传，页面提示合并行数
3. 智能提取页 → **模板管理** → **上传覆盖模板**：选择本地 `template_163.json` 上传
4. 完成后数据库页应有 37 家公司数据

> 或者直接调接口：`POST /api/data`（body: `{"rows":[...]}`）与 `POST /api/template`（body: `{"template":[...]}`），需带 `x-admin-pass` 请求头。

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

## 免费额度说明（KV）

| 项目 | 免费额度 | 本项目用量 |
|------|---------|-----------|
| 存储 | 1 GB | 数据库 ~3MB + 几十个 PDF ≈ 500MB |
| 读操作 | 10 万次/天 | 页面加载每次 1 次 |
| 写操作 | 1 千次/天 | 提取/删除操作每次 1-2 次 |

## 常见问题

- **执行按钮灰色**：未部署到 Cloudflare（静态模式），部署后自动启用
- **提取提示"未授权"**：设置了 ADMIN_PASS 后需在页面首次操作时输入一次
- **"未找到 PDF"**：该公司 PDF 未上传，先点「下载 PDF」或「上传 PDF」
- **勾稽 FAIL / 行名可疑**：AI 提取的个别指标需人工核对（提取报告会列出），可用数据库页范围删除后手动修正
- **自动下载地址**：`sources.json`（KV 中）可配置公司→PDF URL 映射实现全自动下载；未配置的公司走"上传 PDF"
- **单值大小限制**：KV 单值最大 25MB（年报 PDF 一般 5-20MB，可正常存储）
- **部署报 `Could not resolve "pdfjs-dist/...`**：Build command 未设置导致依赖未安装 → 把 Build command 设为 `npm install`
- **部署后运行时报 `Cannot read properties of undefined (reading 'has')`**：pdfjs-dist 4.x 与 Cloudflare 打包器不兼容 → 已降级为 3.11.174（不要升级回 4.x）
- **wrangler.jsonc 不生效**：配置文件必须包含 `pages_build_output_dir` 字段才会被 Git 集成读取（已配置为 "."）

## 文件结构

```
functions/            Cloudflare Pages Functions（后端）
  api/                data / download / extract / template 四个接口
  _lib/               db(KV/R2适配) / pdf(pdfjs解析) / extractor(AI提取) / deepseek / check(勾稽) / auth
wrangler.jsonc        KV 绑定与变量配置（Dashboard 手动绑定时无需填 id）
index.html            前端（静态 + 云模式自动切换）
data.js               静态数据库（云模式下被 /api/data 动态数据覆盖）
DEPLOY.md             本文件
```

## 本地调试后端

```bash
npm install
wrangler pages dev .   # 启动本地 Pages 环境，访问 http://localhost:8788
```
本地调试同样需要 `AI_API_KEY`。
