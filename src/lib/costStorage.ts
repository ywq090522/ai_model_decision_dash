export const COST_STORAGE_KEY = "model-dashboard:cost:v1";

export interface CostInputs {
  cnyPerUsd: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

interface StoredCostInputs extends CostInputs { version: 1 }

export function availableStorage(target: Pick<Window, "localStorage"> | null): Storage | null {
  try {
    return target?.localStorage ?? null;
  } catch {
    return null;
  }
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function loadCostInputs(storage: Pick<Storage, "getItem"> | null, defaults: CostInputs): CostInputs {
  if (!storage) return defaults;
  try {
    const raw = storage.getItem(COST_STORAGE_KEY);
    if (!raw) return defaults;
    const value = JSON.parse(raw) as Partial<StoredCostInputs>;
    if (value.version !== 1 || !finiteNonNegative(value.cnyPerUsd) || value.cnyPerUsd === 0 ||
        !finiteNonNegative(value.inputTokens) || !finiteNonNegative(value.outputTokens) ||
        !finiteNonNegative(value.requests)) return defaults;
    return {
      cnyPerUsd: value.cnyPerUsd,
      inputTokens: value.inputTokens,
      outputTokens: value.outputTokens,
      requests: value.requests,
    };
  } catch {
    return defaults;
  }
}

export function saveCostInputs(storage: Pick<Storage, "setItem"> | null, value: CostInputs): void {
  if (!storage) return;
  try {
    storage.setItem(COST_STORAGE_KEY, JSON.stringify({ version: 1, ...value } satisfies StoredCostInputs));
  } catch {
    // 存储被禁用或已满不影响页面使用。
  }
}
