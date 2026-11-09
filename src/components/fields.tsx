import { useEffect, useRef, useState } from "react";
import { cmToM, formatCm, formatMm, mmToM } from "../domain/units";
import { useEditor } from "../state/store";

export function NumberField({
  label,
  valueM,
  minM,
  maxM,
  onPreview,
  testId,
  unit = "cm",
}: {
  label: string;
  valueM: number;
  minM: number;
  maxM: number;
  onPreview: (meters: number) => void;
  testId?: string;
  unit?: "cm" | "mm";
}) {
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const cancelGesture = useEditor((s) => s.cancelGesture);
  const shown = (meters: number) => (unit === "mm" ? formatMm(meters) : formatCm(meters));
  const [text, setText] = useState(() => shown(valueM));
  const focused = useRef(false);
  const origin = useRef(shown(valueM));

  useEffect(() => {
    if (!focused.current) setText(shown(valueM));
  }, [valueM, unit]);

  function parse(raw: string): number | null {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const meters = unit === "mm" ? mmToM(n) : cmToM(Math.round(n * 10) / 10);
    if (meters < minM - 1e-9 || meters > maxM + 1e-9) return null;
    return meters;
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        data-testid={testId}
        inputMode="decimal"
        value={text}
        onFocus={() => {
          focused.current = true;
          origin.current = shown(valueM);
          beginGesture();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const meters = parse(next);
          if (meters !== null) onPreview(meters);
        }}
        onBlur={(event) => {
          focused.current = false;
          const meters = parse(event.currentTarget.value);
          if (meters === null) {
            cancelGesture();
            setText(origin.current);
            return;
          }
          onPreview(meters);
          endGesture();
          setText(shown(meters));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="unit">{unit}</span>
    </label>
  );
}

export function NameField({
  label,
  value,
  onPreview,
  testId,
}: {
  label: string;
  value: string;
  onPreview: (name: string) => void;
  testId?: string;
}) {
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const cancelGesture = useEditor((s) => s.cancelGesture);
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const origin = useRef(value);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  const valid = (raw: string) => raw.trim().length > 0 && raw.length <= 80;

  return (
    <label className="field field-wide">
      <span>{label}</span>
      <input
        data-testid={testId}
        value={text}
        maxLength={80}
        onFocus={() => {
          focused.current = true;
          origin.current = value;
          beginGesture();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (valid(next)) onPreview(next);
        }}
        onBlur={(event) => {
          focused.current = false;
          const raw = event.currentTarget.value;
          if (!valid(raw)) {
            cancelGesture();
            setText(origin.current);
            return;
          }
          onPreview(raw);
          endGesture();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}
