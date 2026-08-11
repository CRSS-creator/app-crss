"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { colors, radius, shadow } from "@/app/design";

type SelectOption = {
  value: string;
  label: string;
  tone?: "success";
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
};

export default function AppSelect({
  value,
  options,
  onChange,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Szukaj...",
  style,
  menuStyle,
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  style?: CSSProperties;
  menuStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) || options[0];
  const selectedToneStyle = selected?.tone === "success" ? successTextStyle : null;
  const normalizedQuery = normalizeSelectText(query);
  const visibleOptions = normalizedQuery
    ? options.filter((option) => normalizeSelectText(option.label).includes(normalizedQuery))
    : options;

  useEffect(() => {
    if (!open) return;

    function placeMenu() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }

    function closeOnOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setQuery("");
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
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        style={{ ...selectButtonStyle, ...(disabled ? disabledSelectStyle : null), ...style }}
        onClick={() => setOpen((current) => {
          if (current) setQuery("");
          return !current;
        })}
      >
        <span style={{ ...selectLabelStyle, ...selectedToneStyle }}>{selected?.label || "Wybierz"}</span>
        <ChevronDown size={16} strokeWidth={2.5} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.16s ease" }} />
      </button>

      {open && position && (
        <div
          ref={menuRef}
          style={{
            ...selectMenuStyle,
            top: position.top,
            left: position.left,
            width: Math.max(position.width, 220),
            ...menuStyle,
          }}
        >
          {searchable ? (
            <input
              autoFocus
              value={query}
              placeholder={searchPlaceholder}
              style={searchInputStyle}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                  setOpen(false);
                }
                event.stopPropagation();
              }}
            />
          ) : null}
          {visibleOptions.length === 0 ? <span style={emptyOptionStyle}>Brak wyników</span> : null}
          {visibleOptions.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                style={{ ...(isSelected ? selectedOptionStyle : optionStyle), ...(option.tone === "success" ? successTextStyle : null) }}
                onClick={() => {
                  onChange(option.value);
                  setQuery("");
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function normalizeSelectText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace("ł", "l");
}

const selectButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: "42px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  background: colors.inputBackground,
  color: colors.text,
  padding: "10px 12px",
  fontSize: "14px",
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};

const selectLabelStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const disabledSelectStyle: CSSProperties = {
  opacity: 0.72,
  cursor: "not-allowed",
};

const selectMenuStyle: CSSProperties = {
  position: "fixed",
  zIndex: 1000,
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  maxHeight: "290px",
  overflowY: "auto",
  padding: "8px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  background: colors.card,
  boxShadow: shadow.card,
};

const searchInputStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  background: colors.white,
  color: colors.text,
  minHeight: "38px",
  padding: "8px 10px",
  fontSize: "14px",
  fontWeight: 750,
  outline: "none",
  marginBottom: "4px",
};

const emptyOptionStyle: CSSProperties = {
  color: colors.muted,
  padding: "10px 11px",
  fontSize: "13px",
  fontWeight: 750,
};

const optionStyle: CSSProperties = {
  border: 0,
  borderRadius: "10px",
  background: "transparent",
  color: colors.text,
  padding: "10px 11px",
  fontSize: "14px",
  fontWeight: 750,
  cursor: "pointer",
  textAlign: "left",
};

const selectedOptionStyle: CSSProperties = {
  ...optionStyle,
  background: "#e8eef8",
  color: colors.navy,
};

const successTextStyle: CSSProperties = {
  color: colors.success,
};
