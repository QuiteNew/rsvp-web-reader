import type { Range } from '../core/settings';
import dialogStyles from './Dialog.module.css';

interface RangeSettingProps {
  readonly label: string;
  readonly range: Range;
  readonly value: number;
  readonly unit?: string;
  readonly onChange: (value: number) => void;
}

// A whole-number setting with a slider, and the number shown beside it.
export function RangeSetting({ label, range, value, unit = '', onChange }: RangeSettingProps) {
  return (
    <label className={`${dialogStyles.note} ${dialogStyles.rangeRow}`}>
      <span>{label}</span>
      <input
        type="range"
        min={range[0]}
        max={range[1]}
        step={1}
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
      <span>
        {value}
        {unit}
      </span>
    </label>
  );
}
