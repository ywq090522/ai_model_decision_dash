import type { z } from "zod";
import type {
  CuratedDataSchema,
  CuratedModelSchema,
  DataMetaSchema,
  GatewayProviderSchema,
  ModelDataSchema,
  ModelInfoSchema,
  ModelScoresSchema,
  PipelineMetaSchema,
  RegistryModelSchema,
  RegistrySchema,
  SourceStatusSchema,
} from "./data/schema";

// 类型从 Zod schema 推导（src/data/schema.ts 是唯一事实来源）

export type ModelScores = z.infer<typeof ModelScoresSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type DataMeta = z.infer<typeof DataMetaSchema>;
export type ModelData = z.infer<typeof ModelDataSchema>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export type PipelineMeta = z.infer<typeof PipelineMetaSchema>;
export type CuratedModel = z.infer<typeof CuratedModelSchema>;
export type CuratedData = z.infer<typeof CuratedDataSchema>;
export type GatewayProvider = z.infer<typeof GatewayProviderSchema>;
export type RegistryModel = z.infer<typeof RegistryModelSchema>;
export type Registry = z.infer<typeof RegistrySchema>;

export type ScenarioKey = "coding" | "longDoc" | "lowCost" | "chinese" | "vision" | "agent";

export type PresetKey = "student" | "developer" | "longdoc";
