"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
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
};

export function AppMonthInput({ value, onChange, disabled = false, style, ariaLabel }: CommonInputProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = parseMonth(value);
  const [year, setYear] = useState(selected.year);

  usePickerPosition(open, buttonRef, menuRef, setPosition, setOpen, 260);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        style={{ ...inputButtonStyle, ...(disabled ? disabledStyle : null), ...style }}
        onClick={() => {
          setYear(parseMonth(value).year);
          setOpen((current) => !current);
        }}
      >
        <span>{formatMonthLabel(value)}</span>
        <Calendar size={16} />
      </button>

      {open && position && (
        <div ref={menuRef} style={{ ...pickerStyle, top: position.top, left: position.left, width: Math.max(position.width, 260) }}>
          <div style={pickerHeaderStyle}>
            <button type="button" style={iconButtonStyle} onClick={() => setYear((current) => current - 1)} aria-label="Poprzedni rok">
              <ChevronLeft size={16} />
            </button>
            <strong>{year}</strong>
            <button type="button" style={iconButtonStyle} onClick={() => setYear((current) => current + 1)} aria-label="Następny rok">
              <ChevronRight size={16} />
            </button>
          </div>
          <div style={monthGridStyle}>
            {MONTHS.map((month, index) => {
              const monthValue = `${year}-${String(index + 1).padStart(2, "0")}`;
              const active = monthValue === value;
              return (
                <button
                  key={month}
                  type="button"
                  style={active ? activeCellStyle : cellStyle}
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
            onClick={() => {
              onChange(currentMonthValue());
              setOpen(false);
            }}
          >
            Ten miesiąc
          </button>
        </div>
      )}
    </>
  );
}

export function AppDateInput({ value, onChange, disabled = false, style, ariaLabel }: CommonInputProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [viewDate, setViewDate] = useState(() => parseDate(value) || new Date());

  usePickerPosition(open, buttonRef, menuRef, setPosition, setOpen, 292);

  const days = useMemo(() => calendarDays(viewDate), [viewDate]);
  const monthValue = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        style={{ ...inputButtonStyle, ...(disabled ? disabledStyle : null), ...style }}
        onClick={() => {
          setViewDate(parseDate(value) || new Date());
          setOpen((current) => !current);
        }}
      >
        <span>{formatDateLabel(value)}</span>
        <Calendar size={16} />
      </button>

      {open && position && (
        <div ref={menuRef} style={{ ...pickerStyle, top: position.top, left: position.left, width: Math.max(position.width, 292) }}>
          <div style={pickerHeaderStyle}>
            <button type="button" style={iconButtonStyle} onClick={() => setViewDate(addMonths(viewDate, -1))} aria-label="Poprzedni miesiąc">
              <ChevronLeft size={16} />
            </button>
            <strong>{formatMonthLabel(monthValue)}</strong>
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
              return (
                <button
                  key={dayValue}
                  type="button"
                  style={{
                    ...(active ? activeCellStyle : cellStyle),
                    ...(day.inMonth ? null : outsideMonthStyle),
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
            onClick={() => {
              onChange(toDateValue(new Date()));
              setOpen(false);
            }}
          >
            Dzisiaj
          </button>
        </div>
      )}
    </>
  );
}

function usePickerPosition(
  open: boolean,
  buttonRef: RefObject<HTMLButtonElement | null>,
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
      const width = Math.max(rect.width, minWidth);
      const left = Math.min(rect.left, window.innerWidth - width - 12);
      setPosition({ top: rect.bottom + 6, left: Math.max(12, left), width: rect.width });
    }

    function closeOnOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setPosition(null);
      setOpen(false);
    }

    placeMenu();
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
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
  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
  fontWeight: 750,
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

const activeCellStyle: CSSProperties = {
  ...cellStyle,
  background: colors.navy,
  color: colors.white,
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
