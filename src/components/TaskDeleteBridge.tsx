"use client";

import { useEffect, useRef, useState } from "react";
import { deleteTask, fetchTasks, type Task } from "@/lib/taskService";

const BRIDGE_BUTTON_ID = "crss-delete-task-button";

export default function TaskDeleteBridge() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    function getTaskTitle(drawer: Element) {
      const title = drawer.querySelector("h2")?.textContent?.trim() || "";
      return title === "Dodaj zadanie" ? "" : title;
    }

    function findDrawer() {
      return Array.from(document.querySelectorAll("aside")).find((drawer) => Boolean(getTaskTitle(drawer))) || null;
    }

    async function handleDelete(drawer: Element) {
      if (busyRef.current) return;
      const taskTitle = getTaskTitle(drawer);
      if (!taskTitle) return;

      setBusy(true);
      const tasksResult = await fetchTasks();
      setBusy(false);

      if (tasksResult.error) {
        console.error("Błąd pobierania zadań przed usunięciem:", tasksResult.error);
        alert("Nie udało się sprawdzić zadania przed usunięciem.");
        return;
      }

      const matchingTasks = ((tasksResult.data || []) as Task[]).filter((task) => task.tytul === taskTitle);

      if (matchingTasks.length === 0) {
        alert("Nie udało się odnaleźć zadania do usunięcia.");
        return;
      }

      if (matchingTasks.length > 1) {
        alert("Istnieje więcej niż jedno zadanie o tej samej nazwie. Zmień tytuł zadania na unikalny i spróbuj ponownie.");
        return;
      }

      const task = matchingTasks[0];
      const confirmed = window.confirm(`Trwale usunąć zadanie "${task.tytul}"?\n\nUsunięte zostaną też dokumenty i wpisy czasu pracy powiązane z tym zadaniem.`);
      if (!confirmed) return;

      setBusy(true);
      const deleteResult = await deleteTask(task.id);
      setBusy(false);

      if (deleteResult.error) {
        console.error("Błąd usuwania zadania:", deleteResult.error);
        alert("Nie udało się usunąć zadania.");
        return;
      }

      window.location.reload();
    }

    function injectButton() {
      const drawer = findDrawer();
      if (!drawer || drawer.querySelector(`#${BRIDGE_BUTTON_ID}`)) return;

      const header = drawer.querySelector("header");
      if (!header) return;

      const closeButton = header.querySelector("button[aria-label='Zamknij']");
      const button = document.createElement("button");
      button.id = BRIDGE_BUTTON_ID;
      button.type = "button";
      button.textContent = busyRef.current ? "Usuwanie..." : "Usuń zadanie";
      button.style.border = "1px solid #fecdd3";
      button.style.borderRadius = "14px";
      button.style.padding = "11px 14px";
      button.style.background = "#fff1f2";
      button.style.color = "#dc2626";
      button.style.fontWeight = "800";
      button.style.cursor = "pointer";
      button.style.marginLeft = "auto";
      button.addEventListener("click", () => void handleDelete(drawer));

      if (closeButton?.parentElement === header) {
        header.insertBefore(button, closeButton);
      } else {
        header.appendChild(button);
      }
    }

    injectButton();
    const observer = new MutationObserver(injectButton);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
