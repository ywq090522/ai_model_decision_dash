import { RegistrySchema } from "../src/data/schema";
import type { GatewayProvider, Registry, RegistryModel } from "../src/types";
import registryJson from "../src/data/registry.json";

/**
 * Registry 加载与模型路由解析。
 * registry.json 是 provider 配置层 + 模型路由表的单一来源，
 * 前端（只读展示）与网关/管线（路由）共用同一份数据。
 */

export interface ResolvedModel {
  provider: GatewayProvider;
  model: RegistryModel;
}

let cached: Registry | null = null;

/** 加载并校验 registry：Zod 全量校验 + provider 引用完整性检查 */
export function loadRegistry(): Registry {
  if (cached) return cached;
  const parsed = RegistrySchema.safeParse(registryJson);
  if (!parsed.success) {
    throw new Error(`registry.json 校验失败：${parsed.error.message}`);
  }
  const registry = parsed.data;
  const providerKeys = new Set(registry.providers.map((p) => p.key));
  for (const m of registry.models) {
    if (!providerKeys.has(m.provider)) {
      throw new Error(`registry.json：模型 ${m.id} 引用了不存在的 provider "${m.provider}"`);
    }
  }
  const modelIds = new Set<string>();
  for (const m of registry.models) {
    if (modelIds.has(m.id)) throw new Error(`registry.json：模型 id 重复 "${m.id}"`);
    modelIds.add(m.id);
  }
  cached = registry;
  return registry;
}

/** 按请求里的 model 解析路由目标；未注册返回 null */
export function resolveModel(modelId: string, registry: Registry = loadRegistry()): ResolvedModel | null {
  const model = registry.models.find((m) => m.id === modelId);
  if (!model) return null;
  const provider = registry.providers.find((p) => p.key === model.provider);
  if (!provider) return null; // loadRegistry 已保证不会发生，防御性兜底
  return { provider, model };
}
