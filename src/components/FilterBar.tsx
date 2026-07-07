export interface Filters {
  search: string;
  provider: string; // "all" 或 provider 名
  visionOnly: boolean;
  toolsOnly: boolean;
  verifiedOnly: boolean;
  freeOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  provider: "all",
  visionOnly: false,
  toolsOnly: false,
  verifiedOnly: false,
  freeOnly: false,
};

export function FilterBar({
  filters,
  onChange,
  providers,
  matched,
  total,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  providers: string[];
  matched: number;
  total: number;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const Toggle = ({
    label,
    active,
    onClick,
    title,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    title?: string;
  }) => (
    <button
      type="button"
      className={`chip ${active ? "chip-active" : "hover:border-muted"}`}
      onClick={onClick}
      title={title}
      aria-pressed={active}
    >
      {label}
    </button>
  );

  return (
    <div className="card p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="搜索模型名 / ID / 标签…"
            className="field min-w-0 flex-1 sm:max-w-md"
          />
          <select
            value={filters.provider}
            onChange={(e) => set({ provider: e.target.value })}
            className="field sm:w-44"
          >
            <option value="all">全部厂商</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Toggle
            label="支持图片"
            active={filters.visionOnly}
            onClick={() => set({ visionOnly: !filters.visionOnly })}
            title="只显示已确认支持图片输入的模型"
          />
          <Toggle
            label="支持工具调用"
            active={filters.toolsOnly}
            onClick={() => set({ toolsOnly: !filters.toolsOnly })}
          />
          <Toggle
            label="免费"
            active={filters.freeOnly}
            onClick={() => set({ freeOnly: !filters.freeOnly })}
          />
          <Toggle
            label="仅官方核实价"
            active={filters.verifiedOnly}
            onClick={() => set({ verifiedOnly: !filters.verifiedOnly })}
            title="只显示价格来自官方定价页的模型"
          />
        </div>

        <div className="num shrink-0 border-t border-line pt-2 text-left text-xs text-muted sm:text-right xl:border-l xl:border-t-0 xl:px-3 xl:py-1">
          <span className="font-semibold text-ink">{matched}</span> / {total} 个模型
        </div>
      </div>
    </div>
  );
}
