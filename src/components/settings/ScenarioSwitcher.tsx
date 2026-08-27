import { MOCK_SCENARIOS } from "@/core/mockData";
import type { MockScenarioId } from "@/core/types";

type ScenarioSwitcherProps = {
  value: MockScenarioId;
  onChange: (scenario: MockScenarioId) => void;
  compact?: boolean;
  disabled?: boolean;
};

export function ScenarioSwitcher({
  value,
  onChange,
  compact = false,
  disabled = false
}: ScenarioSwitcherProps) {
  const selected = MOCK_SCENARIOS.find((scenario) => scenario.id === value);

  if (compact) {
    return (
      <label className="inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--aegis-line-soft)] bg-[rgba(118,146,188,0.04)] px-3 py-2 text-[11px] text-slate-500">
        <span className="shrink-0 uppercase tracking-[0.08em] text-slate-500">Lab case</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as MockScenarioId)}
          disabled={disabled}
          className="min-w-[10rem] rounded-[8px] border border-transparent bg-transparent pr-6 text-[13px] font-medium text-slate-100 outline-none transition focus:border-[#4b8dff]/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {MOCK_SCENARIOS.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="grid gap-1 text-[11px] text-slate-500">
      Lab case
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as MockScenarioId)}
        disabled={disabled}
        className="min-w-44 rounded-[10px] border border-[color:var(--aegis-line-soft)] bg-[rgba(118,146,188,0.04)] px-3 py-2 text-[13px] font-medium text-slate-100 outline-none transition focus:border-[#4b8dff]/60 focus:ring-2 focus:ring-[#4b8dff]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {MOCK_SCENARIOS.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.label}
          </option>
        ))}
      </select>
      {!compact && selected ? (
        <span className="text-[11px] text-slate-500">{selected.description}</span>
      ) : null}
    </label>
  );
}
