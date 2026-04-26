# MDG 马督工

一个以马前卒（督工）写作风格生成回答的聊天 Web 应用。

核心提示词来自该项目：[Piracola/madugong-skill](https://github.com/Piracola/madugong-skill)

## 工作原理

```
用户提问 → 回答 Agent（生成初稿）→ 审查 Agent（风格修正）→ SSE 流式输出
```

采用双 Agent 流水线：

1. **回答 Agent** 根据 `answer-prompt.md` 中的风格规则生成初稿。
2. **审查 Agent** 依据 `critique-prompt.md` 对初稿进行风格审查并改写。
3. 后端通过 SSE 把最终文本流式推给前端。

技术栈：React 19 + TypeScript + Vite（前端），FastAPI + Python（后端），任意 OpenAI 兼容 API。

## 本地开发

环境要求：Python 3.10+、Node.js 18+、OpenAI 兼容 API Key。

Windows 一键启动：

```powershell
.\start.ps1   # 或 .\start.bat
```

脚本会创建虚拟环境、安装依赖、生成 `.env` 并拉起前后端。

更完整的本地开发说明见：[开发指南](./docs/development.md)

## 文档导航

- [开发指南](./docs/development.md)：本地启动、手动运行、开发代理说明
- [部署指南](./docs/deployment.md)：Linux VPS、systemd、Nginx、HTTPS 部署流程
- [注意事项](./docs/notes.md)：认证、CORS、反向代理、限流与生产安全配置

## 部署说明

部署到 VPS 或公网环境前，建议先阅读：

- [部署指南](./docs/deployment.md)
- [注意事项](./docs/notes.md)
