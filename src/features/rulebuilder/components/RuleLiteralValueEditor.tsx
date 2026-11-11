import { useEffect, useId, useRef, useState } from 'react';

type LiteralValueType = 'number' | 'string' | 'boolean';
type LiteralValue = string | number | boolean | null;

type Props = {
  value: unknown;
  onChange: (value: LiteralValue) => void;
  inputClassName: string;
};

const NO_EMISSION = Symbol('no-emission');

function getValueType(value: unknown): LiteralValueType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function getTextValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function parseNumber(value: string | number | boolean): number | null {
  if (typeof value === 'boolean') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: string | number | boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return ['true', '1'].includes(value.trim().toLowerCase());
}

function getNumberText(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export default function RuleLiteralValueEditor({ value, onChange, inputClassName }: Props) {
  const typeId = useId();
  const valueId = useId();
  const lastEmittedValue = useRef<unknown>(NO_EMISSION);
  const [valueType, setValueType] = useState(() => getValueType(value));
  const [stringValue, setStringValue] = useState(() => getTextValue(value));
  const [numberValue, setNumberValue] = useState(() => getNumberText(value));
  const [booleanValue, setBooleanValue] = useState(() => (value === true ? 'true' : 'false'));

  useEffect(() => {
    if (lastEmittedValue.current !== NO_EMISSION && Object.is(value, lastEmittedValue.current)) {
      lastEmittedValue.current = NO_EMISSION;
      return;
    }

    setValueType(getValueType(value));
    setStringValue(getTextValue(value));
    setNumberValue(getNumberText(value));
    setBooleanValue(value === true ? 'true' : 'false');
  }, [value]);

  const emitValue = (nextValue: LiteralValue) => {
    lastEmittedValue.current = nextValue;
    onChange(nextValue);
  };

  const currentValue: string | number | boolean =
    valueType === 'number'
      ? numberValue
      : valueType === 'boolean'
        ? booleanValue === 'true'
        : stringValue;

  const handleTypeChange = (nextType: LiteralValueType) => {
    setValueType(nextType);

    if (nextType === 'number') {
      const parsed = parseNumber(currentValue);
      setNumberValue(parsed === null ? '' : String(parsed));
      emitValue(parsed);
    } else if (nextType === 'boolean') {
      const parsed = parseBoolean(currentValue);
      setBooleanValue(parsed ? 'true' : 'false');
      emitValue(parsed);
    } else {
      const parsed = String(currentValue);
      setStringValue(parsed);
      emitValue(parsed);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <label
          htmlFor={typeId}
          className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase"
        >
          Data type
        </label>
        <select
          id={typeId}
          aria-label="Value data type"
          value={valueType}
          onChange={(event) => handleTypeChange(event.target.value as LiteralValueType)}
          className={inputClassName}
        >
          <option value="number">Numeric</option>
          <option value="string">String</option>
          <option value="boolean">Boolean</option>
        </select>
      </div>

      {valueType === 'number' ? (
        <input
          id={valueId}
          aria-label="Number value"
          type="number"
          step="any"
          value={numberValue}
          onChange={(event) => {
            const text = event.target.value;
            setNumberValue(text);
            emitValue(parseNumber(text));
          }}
          className={inputClassName}
        />
      ) : valueType === 'boolean' ? (
        <select
          id={valueId}
          aria-label="Boolean value"
          value={booleanValue}
          onChange={(event) => {
            const nextValue = event.target.value === 'true';
            setBooleanValue(nextValue ? 'true' : 'false');
            emitValue(nextValue);
          }}
          className={inputClassName}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : (
        <input
          id={valueId}
          aria-label="String value"
          type="text"
          value={stringValue}
          onChange={(event) => {
            setStringValue(event.target.value);
            emitValue(event.target.value);
          }}
          className={inputClassName}
        />
      )}
    </div>
  );
}
