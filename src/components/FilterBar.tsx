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
      className={`chip ${active ? "chip-active" : "hover:border-muted"}`}
      onClick={onClick}
      title={title}
      aria-pressed={active}
    >
      {label}
    </button>
  );

  return (
    <div className="card flex flex-wrap items-center gap-2 p-3">
      <input
        type="search"
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
        placeholder="搜索模型名 / ID / 标签…"
        className="w-56 rounded-md border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <select
        value={filters.provider}
        onChange={(e) => set({ provider: e.target.value })}
        className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
      >
        <option value="all">全部厂商</option>
        {providers.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <div className="mx-1 h-5 w-px bg-line" aria-hidden />
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
      <span className="num ml-auto text-xs text-muted">
        {matched} / {total} 个模型
      </span>
    </div>
  );
}
