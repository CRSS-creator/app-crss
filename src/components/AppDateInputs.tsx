"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { colors, radius, shadow } from "@/app/design";

const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const WEEKDAYS = ["pn", "wt", "śr", "cz", "pt", "sb", "nd"];

type PickerPosition = {
  top: number;
  left: number;
  width: number;
};

type CommonInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  required?: boolean;
  name?: string;
  readOnly?: boolean;
};

export function AppMonthInput({ value, onChange, disabled = false, style, ariaLabel, min, max, id, className, required, name, readOnly = false }: CommonInputProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = parseMonth(value);
  const [year, setYear] = useState(selected.year);

  usePickerPosition(open, buttonRef, menuRef, setPosition, setOpen, 260);

  return (
    <>
      <EditablePickerField
        anchorRef={buttonRef}
        mode="month"
        value={value} onChange={onChange} disabled={disabled} readOnly={readOnly}
        required={required} name={name} min={min} max={max}
        id={id} className={className} ariaLabel={ariaLabel} style={style}
        open={open} onOpen={() => {
          setYear(parseMonth(value).year);
          setOpen((current) => !current);
        }}
      />

      {open && !disabled && !readOnly && position && createPortal(
        <div ref={menuRef} style={{ ...pickerStyle, top: position.top, left: position.left, width: position.width }}>
          <div style={pickerHeaderStyle}>
            <button type="button" style={iconButtonStyle} onClick={() => setYear((current) => Math.max(100, current - 1))} aria-label="Poprzedni rok">
              <ChevronLeft size={16} />
            </button>
            <YearInput year={year} onChange={setYear} />
            <button type="button" style={iconButtonStyle} onClick={() => setYear((current) => Math.min(9999, current + 1))} aria-label="Następny rok">
              <ChevronRight size={16} />
            </button>
          </div>
          <div style={monthGridStyle}>
            {MONTHS.map((month, index) => {
              const monthValue = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
              const active = monthValue === value;
              const isToday = monthValue === currentMonthValue();
              const unavailable = Boolean((min && monthValue < min) || (max && monthValue > max));
              return (
                <button
                  key={month}
                  disabled={unavailable}
                  type="button"
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={active}
                  style={{ ...cellStyle, ...(isToday ? todayCellStyle : null), ...(active ? selectedCellStyle : null), ...(unavailable ? disabledStyle : null) }}
                  onClick={() => {
                    onChange(monthValue);
                    setOpen(false);
                  }}
                >
                  {month}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            style={todayButtonStyle}
            disabled={Boolean((min && currentMonthValue() < min) || (max && currentMonthValue() > max))}
            onClick={() => {
              onChange(currentMonthValue());
              setOpen(false);
            }}
          >
            Ten miesiąc
          </button>
        </div>, document.body
      )}
    </>
  );
}

export function AppDateInput({ value, onChange, disabled = false, style, ariaLabel, min, max, id, className, required, name, readOnly = false }: CommonInputProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [viewDate, setViewDate] = useState(() => parseDate(value) || new Date());

  usePickerPosition(open, buttonRef, menuRef, setPosition, setOpen, 292);

  const days = useMemo(() => calendarDays(viewDate), [viewDate]);
  const today = toDateValue(new Date());

  return (
    <>
      <EditablePickerField
        anchorRef={buttonRef}
        mode="date"
        value={value} onChange={onChange} disabled={disabled} readOnly={readOnly}
        required={required} name={name} min={min} max={max}
        id={id} className={className} ariaLabel={ariaLabel} style={style}
        open={open} onOpen={() => {
          setViewDate(parseDate(value) || new Date());
          setOpen((current) => !current);
        }}
      />

      {open && !disabled && !readOnly && position && createPortal(
        <div ref={menuRef} style={{ ...pickerStyle, top: position.top, left: position.left, width: position.width }}>
          <div style={pickerHeaderStyle}>
            <button type="button" style={iconButtonStyle} onClick={() => setViewDate(addMonths(viewDate, -1))} aria-label="Poprzedni miesiąc">
              <ChevronLeft size={16} />
            </button>
            <div style={{ display: "flex", gap: 4, minWidth: 0 }}>
              <select aria-label="Miesiąc kalendarza" value={viewDate.getMonth()} style={navigationInputStyle}
                onChange={event => setViewDate(new Date(viewDate.getFullYear(), Number(event.target.value), 1))}>
                {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
              </select>
              <YearInput year={viewDate.getFullYear()} onChange={year => setViewDate(new Date(year, viewDate.getMonth(), 1))} />
            </div>
            <button type="button" style={iconButtonStyle} onClick={() => setViewDate(addMonths(viewDate, 1))} aria-label="Następny miesiąc">
              <ChevronRight size={16} />
            </button>
          </div>
          <div style={weekdayGridStyle}>
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div style={dateGridStyle}>
            {days.map((day) => {
              const dayValue = toDateValue(day.date);
              const active = dayValue === value;
              const isToday = dayValue === today;
              const unavailable = Boolean((min && dayValue < min) || (max && dayValue > max));
              return (
                <button
                  key={dayValue}
                  disabled={unavailable}
                  type="button"
                  aria-label={formatDateLabel(dayValue)}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={active}
                  style={{
                    ...cellStyle,
                    ...(day.inMonth ? null : outsideMonthStyle),
                    ...(isToday ? todayCellStyle : null),
                    ...(active ? selectedCellStyle : null),
                    ...(unavailable ? disabledStyle : null),
                  }}
                  onClick={() => {
                    onChange(dayValue);
                    setOpen(false);
                  }}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            style={todayButtonStyle}
            disabled={Boolean((min && toDateValue(new Date()) < min) || (max && toDateValue(new Date()) > max))}
            onClick={() => {
              onChange(toDateValue(new Date()));
              setOpen(false);
            }}
          >
            Dzisiaj
          </button>
        </div>, document.body
      )}
    </>
  );
}

function usePickerPosition(
  open: boolean,
  buttonRef: RefObject<HTMLDivElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
  setPosition: (position: PickerPosition | null) => void,
  setOpen: (open: boolean) => void,
  minWidth: number
) {
  useEffect(() => {
    if (!open) return;

    function placeMenu() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, minWidth), Math.max(0, window.innerWidth - 24));
      const height = Math.min(menuRef.current?.getBoundingClientRect().height || (minWidth === 292 ? 360 : 250), Math.max(0, window.innerHeight - 24));
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = rect.bottom + 6;
      const top = below + height <= window.innerHeight - 12
        ? below
        : Math.max(12, Math.min(rect.top - height - 6, window.innerHeight - height - 12));
      setPosition({ top, left, width });
    }

    function closeOnOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setPosition(null);
      setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.querySelector("input")?.focus();
      }
    }

    placeMenu();
    const frame = window.requestAnimationFrame(placeMenu);
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [buttonRef, menuRef, minWidth, open, setOpen, setPosition]);
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match || Number(match[1]) < 100 || Number(match[2]) < 1 || Number(match[2]) > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) || toDateValue(date) !== value ? null : date;
}

function formatMonthLabel(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return "Wybierz miesiąc";
  const { year, month } = parseMonth(value);
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function formatDateLabel(value: string) {
  const date = parseDate(value);
  if (!date) return "Wybierz datę";
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function calendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return { date, inMonth: date.getMonth() === month };
  });
}

function addMonths(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return next.getFullYear() < 100 || next.getFullYear() > 9999 ? date : next;
}

function toDateValue(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const inputButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: "42px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  background: colors.white,
  color: colors.text,
  padding: "10px 12px",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "left",
  boxSizing: "border-box",
};

const disabledStyle: CSSProperties = {
  opacity: 0.72,
  cursor: "not-allowed",
};

const pickerStyle: CSSProperties = {
  position: "fixed",
  maxHeight: "calc(100vh - 24px)",
  overflowY: "auto",
  boxSizing: "border-box",
  zIndex: 1200,
  padding: "12px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  background: colors.card,
  boxShadow: shadow.card,
  color: colors.text,
};

const pickerHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "10px",
};

const iconButtonStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  background: colors.white,
  color: colors.navy,
  cursor: "pointer",
};

const monthGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "6px",
};

const dateGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: "5px",
};

const weekdayGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: "5px",
  marginBottom: "6px",
  color: colors.muted,
  fontSize: "11px",
  fontWeight: 800,
  textAlign: "center",
};

const cellStyle: CSSProperties = {
  minHeight: "34px",
  border: 0,
  borderRadius: "10px",
  background: "transparent",
  color: colors.text,
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
};

const todayCellStyle: CSSProperties = {
  ...cellStyle,
  background: colors.navy,
  color: colors.white,
};

const selectedCellStyle: CSSProperties = {
  outline: `2px solid ${colors.red}`,
  outlineOffset: "-2px",
};

const navigationInputStyle: CSSProperties = {
  minWidth: 0, padding: "5px", border: `1px solid ${colors.border}`,
  borderRadius: "6px", background: colors.white, color: colors.text, fontSize: "13px",
};

const outsideMonthStyle: CSSProperties = {
  color: "#94a3b8",
  fontWeight: 650,
};

const todayButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: "36px",
  marginTop: "10px",
  border: 0,
  borderRadius: "10px",
  background: "#e8eef8",
  color: colors.navy,
  fontWeight: 850,
  cursor: "pointer",
};


function YearInput({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  function commit(input: HTMLInputElement) {
    const next = Number(input.value);
    if (/^\d{3,4}$/.test(input.value) && next >= 100 && next <= 9999) onChange(next);
    else input.value = String(year);
  }
  return <input key={year} type="number" aria-label="Rok kalendarza" min={100} max={9999}
    defaultValue={year} style={{ ...navigationInputStyle, width: 76 }}
    onBlur={event => commit(event.currentTarget)}
    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(event.currentTarget); } }} />;
}

type EditablePickerProps = CommonInputProps & {
  mode: "date" | "month";
  anchorRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  onOpen: () => void;
};

function typedValue(text: string, mode: "date" | "month"): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (mode === "month") {
    const polish = trimmed.match(/^(\d{2})[.\/-](\d{4})$/);
    const iso = polish ? `${polish[2]}-${polish[1]}` : trimmed;
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(iso) && Number(iso.slice(0, 4)) >= 100 ? iso : null;
  }
  const polish = trimmed.match(/^(\d{2})[.\/](\d{2})[.\/](\d{4})$/);
  const iso = polish ? `${polish[3]}-${polish[2]}-${polish[1]}` : trimmed;
  return parseDate(iso) && Number(iso.slice(0, 4)) >= 100 ? iso : null;
}

function editableLabel(value: string, mode: "date" | "month") {
  if (!value) return "";
  return mode === "month" ? `${value.slice(5, 7)}.${value.slice(0, 4)}` : formatDateLabel(value);
}

function EditablePickerField({ mode, anchorRef, open, onOpen, value, onChange, disabled, readOnly,
  required, name, min, max, style, ariaLabel, id, className }: EditablePickerProps) {
  const [draft, setDraft] = useState(() => editableLabel(value, mode));
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState({ value, mode, open });
  if (source.value !== value || source.mode !== mode || source.open !== open) {
    setSource({ value, mode, open });
    setDraft(editableLabel(value, mode));
    setError("");
  }
  useEffect(() => {
    inputRef.current?.setCustomValidity("");
  }, [value, mode, open]);

  function validation(text: string) {
    const parsed = typedValue(text, mode);
    if (parsed === null) return mode === "date" ? "Wpisz poprawną datę: DD.MM.RRRR." : "Wpisz poprawny miesiąc: MM.RRRR.";
    if (!parsed && required) return "Uzupełnij to pole.";
    if (parsed && min && parsed < min) return `Najwcześniejsza dozwolona wartość: ${editableLabel(min, mode)}.`;
    if (parsed && max && parsed > max) return `Najpóźniejsza dozwolona wartość: ${editableLabel(max, mode)}.`;
    return "";
  }
  function commit() {
    if (disabled || readOnly) return;
    const message = validation(draft);
    setError(message);
    inputRef.current?.setCustomValidity(message);
    if (message) return;
    const parsed = typedValue(draft, mode)!;
    setDraft(editableLabel(parsed, mode));
    if (parsed !== value) onChange(parsed);
  }
  return <div ref={anchorRef} style={{ minWidth: 0, width: "100%" }}>
    <div style={{ ...inputButtonStyle, padding: 0, ...(disabled ? disabledStyle : null), ...style,
      display: "flex", minWidth: 0, cursor: "text" }}>
      <input ref={inputRef} type="text" inputMode="numeric" value={draft}
        id={id} name={name} className={className} disabled={disabled} readOnly={readOnly} required={required}
        aria-label={ariaLabel || (mode === "date" ? "Data" : "Miesiąc")}
        aria-invalid={Boolean(error)} placeholder={mode === "date" ? "DD.MM.RRRR" : "MM.RRRR"}
        style={{ width: "100%", minWidth: 0, flex: 1, border: 0, background: "transparent", color: "inherit",
          font: "inherit", padding: "8px", borderRadius: "inherit", boxSizing: "border-box" }}
        onChange={event => {
          setDraft(event.target.value);
          const message = validation(event.target.value);
          event.target.setCustomValidity(message);
          if (error) setError(message);
        }}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); commit(); }
          if (event.key === "Escape") {
            setDraft(editableLabel(value, mode)); setError(""); event.currentTarget.setCustomValidity("");
          }
          if (event.key === "ArrowDown" && event.altKey) { event.preventDefault(); onOpen(); }
        }} />
      <button type="button" disabled={disabled || readOnly} aria-label="Otwórz kalendarz"
        aria-expanded={open} onClick={onOpen}
        style={{ ...iconButtonStyle, flexShrink: 0, border: 0, background: "transparent" }}>
        <Calendar size={16} />
      </button>
    </div>
    {error && <small role="alert" style={{ color: colors.danger, fontSize: 11 }}>{error}</small>}
  </div>;
}
