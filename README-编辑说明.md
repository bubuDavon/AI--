# 智多星官网 + 学习系统（Netlify 整合版）

## 打开网站

项目已合并为一个站点：`/` 是官网，`/learning/` 是学习系统。官网咨询与学习助教分别使用独立的 OpenHex Agent，因此请使用 Node.js 20+ 启动：

```bash
npm install
cp .env.example .env
# 编辑 .env，填写两套 OpenHex 配置
npm start
```

然后访问 `http://localhost:8787`，官网可直接跳转到 `http://localhost:8787/learning/`。未配置学习 Agent 时，其余学习流程仍可使用，知识助教会提供本地知识卡兜底。官网留资、账户、登录态与官网 Agent 的多轮 conversationId 全部保存在当前浏览器。

## 常用文件

- `official/`：官网页面、个人中心及两个分版落地页。
- `index.html`：学习工作台源页面，构建后位于 `/learning/`。
- `app.css`：页面颜色、尺寸、排版与响应式样式。
- `app.js`：学习流程、评分、报告、保存和交互逻辑。
- `server.mjs`：本地整合站点服务与 API 代理；API Key 只在服务端读取。
- `netlify/functions/`：官网 API、学习 Agent 状态与流式对话接口。
- `netlify/official/`：官网 Agent 接入逻辑。
- `netlify.toml`：Netlify 构建、发布目录、Functions 和响应头配置。
- `scripts/build-static.mjs`：只把公开网页资源复制到 `dist/`，避免发布 `.env` 和服务端源码。
- `.env.example`：两套 OpenHex 环境变量示例，复制为 `.env` 后填写。
- `flow-data.js`：摸底题、课程检查点、结课题和示例数据。
- `app-data.js`：知识卡数据。
- `knowledge.html`：知识库首页。
- `read/`：课程、案例、边界和资料说明页面。
- `zhiduoxing-icon.png`：左上角智多星助教图标。
- `favicon.png`：浏览器页签图标。

## 部署到 Netlify

1. 本地运行 `npm run check && npm run build`，确认 `dist/` 成功生成。
2. 将仓库连接到 Netlify。仓库内的 `netlify.toml` 会自动使用 `npm run build`，发布目录为 `dist`。
3. 在 Netlify 的 Project configuration → Environment variables 中添加：
   - `OPENHEX_OFFICIAL_API_KEY`、`OPENHEX_OFFICIAL_AGENT_ID`：官网咨询 Agent。
   - `OPENHEX_LEARNING_API_KEY`、`OPENHEX_LEARNING_AGENT_ID`：学习助教 Agent。
4. 不要让两套 OpenHex 变量共用同一个 Key 或 Agent ID，也不要把 `.env` 上传或提交到仓库。
5. 触发重新部署，检查 `/api/openhex/status` 和 `/api/official?action=status` 均返回 `{"configured":true}`。
6. 发布后依次检查官网咨询、本地登录/留资、官网到 `/learning/` 的跳转，以及学习助教的流式回答和多轮追问。

Netlify 流式 Function 最长执行 60 秒，本站会在约 52 秒主动停止单次回复并提示缩短问题。本地 `npm start` 仍使用 `server.mjs`，不受 Netlify 路由结构影响。

## 数据与功能边界

学习记录、账户、留资、登录态和对话 conversationId 都保存在访问者自己的浏览器中，不跨设备同步。官网问题与学习问题分别发送到对应的 OpenHex Agent，API Key 仍只保存在服务端。开放作品反馈仍使用页面内规则检查。源码包不应包含 API Key 或账号凭据，`.env` 已加入 `.gitignore`。
