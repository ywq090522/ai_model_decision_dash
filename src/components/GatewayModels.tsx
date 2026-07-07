import registryJson from "../data/registry.json";
import type { Registry } from "../types";

/**
 * 多模型网关展示区：模型列表从 registry 生成（仅展示元数据）。
 * 网关本身是本地 Node 服务（npm run gateway），不随 Pages 部署；
 * registry 里只有环境变量名，任何 API Key 都不会出现在前端。
 */

const registry = registryJson as Registry;

const CURL_EXAMPLE = `# 启动网关（key 写在项目根目录 .env，见 .env.example）
npm run gateway

# 用同一份 Anthropic Messages 格式调用任意已注册模型
curl http://localhost:8788/v1/messages \\
  -H "content-type: application/json" \\
  -d '{
    "model": "deepseek-v4-flash",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "你好"}]
  }'

# stream: true 时 SSE 逐字节透传，与直连各厂商行为一致
curl http://localhost:8788/v1/models   # 模型清单（由 registry 生成）`;

export function GatewayModels() {
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
              <th className="px-3 py-2.5">网关模型 id</th>
              <th className="px-3 py-2.5">上游模型</th>
              <th className="px-3 py-2.5">Provider / 端点</th>
              <th className="px-3 py-2.5">鉴权</th>
              <th className="px-3 py-2.5">Key 环境变量</th>
            </tr>
          </thead>
          <tbody>
            {registry.providers.map((p) =>
              registry.models
                .filter((m) => m.provider === p.key)
                .map((m, i, arr) => (
                  <tr key={m.id} className="border-b border-line/60">
                    <td className="num px-3 py-2">
                      {m.id}
                      {m.notes && (
                        <span className="ml-2 font-sans text-[10px] text-muted">{m.notes}</span>
                      )}
                    </td>
                    <td className="num px-3 py-2 text-ink2">{m.upstreamModel}</td>
                    {i === 0 && (
                      <>
                        <td className="px-3 py-2" rowSpan={arr.length}>
                          <div className="font-medium">{p.label}</div>
                          <div className="num text-[11px] text-muted">
                            {p.baseUrl}
                            {p.messagesPath}
                          </div>
                        </td>
                        <td className="px-3 py-2" rowSpan={arr.length}>
                          <span className="num rounded bg-paper px-1.5 py-0.5 text-[11px]">
                            {p.auth === "x-api-key" ? "x-api-key" : "Bearer"}
                          </span>
                        </td>
                        <td className="num px-3 py-2 text-[12px]" rowSpan={arr.length}>
                          {p.apiKeyEnv}
                        </td>
                      </>
                    )}
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          用法（本地运行，key 只存在于网关进程环境变量）
        </div>
        <pre className="num overflow-x-auto whitespace-pre rounded bg-paper p-3 text-[12px] leading-relaxed text-ink2">
          {CURL_EXAMPLE}
        </pre>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          请求/返回均保持 Anthropic Messages 格式（不做 OpenAI 协议转换）；streaming 目前为 SSE
          原样透传，后续再做事件标准化。网关不随 GitHub Pages 部署 —— 此处仅展示 registry
          元数据，前端不含也不请求任何 API Key。
        </p>
      </div>
    </div>
  );
}
