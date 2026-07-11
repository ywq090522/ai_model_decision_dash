import type { PresetKey, ScenarioKey } from "../types";
import { DEFAULT_FILTERS, type Filters } from "../components/FilterBar";
import type { SortDirection, SortKey, SortState } from "../components/ModelTable";

export const QUERY_KEYS = {
  provider: "p",
  search: "q",
  scenario: "scene",
  preset: "preset",
  sort: "sort",
  direction: "dir",
  compareLeft: "a",
  compareRight: "b",
} as const;

export const DEFAULT_SORT: SortState = { key: "inputPrice", dir: 1 };
export const DEFAULT_SCENARIO: ScenarioKey = "coding";
export const DEFAULT_PRESET: PresetKey = "student";

export interface ShareableState {
  filters: Filters;
  scenario: ScenarioKey;
  preset: PresetKey;
  sort: SortState;
  compare: [string, string];
}

const SCENARIOS: ScenarioKey[] = ["coding", "longDoc", "lowCost", "chinese", "vision", "agent"];
const PRESETS: PresetKey[] = ["student", "developer", "longdoc"];
const SORT_KEYS: SortKey[] = ["name", "provider", "inputPrice", "outputPrice", "contextWindow", "coding", "longDoc", "chinese", "agent"];

export function defaultShareableState(modelIds: string[]): ShareableState {
  return {
    filters: DEFAULT_FILTERS,
    scenario: DEFAULT_SCENARIO,
    preset: DEFAULT_PRESET,
    sort: DEFAULT_SORT,
    compare: [modelIds[0] ?? "", modelIds[1] ?? ""],
  };
}

function validCompare(ids: string[], left: string | null, right: string | null): [string, string] {
  const a = left && ids.includes(left) ? left : ids[0] ?? "";
  let b = right && ids.includes(right) && right !== a ? right : "";
  if (!b) b = ids.find((id) => id !== a) ?? "";
  return [a, b];
}

export function decodeShareableState(search: string, providers: string[], modelIds: string[]): ShareableState {
  const p = new URLSearchParams(search);
  const defaults = defaultShareableState(modelIds);
  const provider = p.get(QUERY_KEYS.provider);
  const scenario = p.get(QUERY_KEYS.scenario);
  const preset = p.get(QUERY_KEYS.preset);
  const sort = p.get(QUERY_KEYS.sort);
  const direction = p.get(QUERY_KEYS.direction);
  return {
    filters: {
      ...defaults.filters,
      search: p.get(QUERY_KEYS.search) ?? "",
      provider: provider && providers.includes(provider) ? provider : "all",
    },
    scenario: SCENARIOS.includes(scenario as ScenarioKey) ? (scenario as ScenarioKey) : DEFAULT_SCENARIO,
    preset: PRESETS.includes(preset as PresetKey) ? (preset as PresetKey) : DEFAULT_PRESET,
    sort: {
      key: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_SORT.key,
      dir: (direction === "desc" ? -1 : 1) as SortDirection,
    },
    compare: validCompare(modelIds, p.get(QUERY_KEYS.compareLeft), p.get(QUERY_KEYS.compareRight)),
  };
}

export function encodeShareableState(state: ShareableState, modelIds: string[]): string {
  const defaults = defaultShareableState(modelIds);
  const p = new URLSearchParams();
  if (state.filters.provider !== defaults.filters.provider) p.set(QUERY_KEYS.provider, state.filters.provider);
  if (state.filters.search) p.set(QUERY_KEYS.search, state.filters.search);
  if (state.scenario !== DEFAULT_SCENARIO) p.set(QUERY_KEYS.scenario, state.scenario);
  if (state.preset !== DEFAULT_PRESET) p.set(QUERY_KEYS.preset, state.preset);
  if (state.sort.key !== DEFAULT_SORT.key) p.set(QUERY_KEYS.sort, state.sort.key);
  if (state.sort.dir !== DEFAULT_SORT.dir) p.set(QUERY_KEYS.direction, "desc");
  if (state.compare[0] !== defaults.compare[0]) p.set(QUERY_KEYS.compareLeft, state.compare[0]);
  if (state.compare[1] !== defaults.compare[1]) p.set(QUERY_KEYS.compareRight, state.compare[1]);
  const encoded = p.toString();
  return encoded ? `?${encoded}` : "";
}
