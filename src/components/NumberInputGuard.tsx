"use client";

import { useEffect } from "react";

export default function NumberInputGuard() {
  useEffect(() => {
    function isNumberInput(target: EventTarget | null): target is HTMLInputElement {
      return target instanceof HTMLInputElement && target.type === "number";
    }

    function preventArrowStep(event: KeyboardEvent) {
      if (isNumberInput(event.target) && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
      }
    }

    function preventWheelStep(event: WheelEvent) {
      if (isNumberInput(event.target) && document.activeElement === event.target && !event.ctrlKey) {
        event.preventDefault();
      }
    }

    // Delegation also covers fields mounted later in dialogs and dynamic forms.
    document.addEventListener("keydown", preventArrowStep, true);
    document.addEventListener("wheel", preventWheelStep, { capture: true, passive: false });
    return () => {
      document.removeEventListener("keydown", preventArrowStep, true);
      document.removeEventListener("wheel", preventWheelStep, true);
    };
  }, []);

  return null;
}
