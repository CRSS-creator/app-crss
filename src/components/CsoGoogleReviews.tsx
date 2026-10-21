"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { colors } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import styles from "./CsoGoogleReviews.module.css";

type Client = {
  id: string;
  nazwa: string | null;
  email: string | null;
  osoba_kontaktowa: string | null;
  opinia_dodana: boolean;
};

export default function CsoGoogleReviews() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState<string[]>([]);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [clientResult, statusResult] = await Promise.all([
          supabase.from("klienci").select("id,nazwa,email,osoba_kontaktowa").or("aktywny.eq.true,status_klienta.ilike.onboarding").order("nazwa"),
          supabase.from("cso_google_reviews").select("klient_id,opinia_dodana,ukryty"),
        ]);
        if (clientResult.error) throw clientResult.error;
        if (statusResult.error) throw statusResult.error;
        const statuses = new Map((statusResult.data || []).map(row => [row.klient_id, row.opinia_dodana]));
        const hidden = new Set((statusResult.data || []).filter(row => row.ukryty).map(row => row.klient_id));
        if (active) setClients((clientResult.data || []).filter(row => !hidden.has(row.id)).map(row => ({ ...row, opinia_dodana: statuses.get(row.id) ?? false })));
      } catch {
        if (active) setLoadError("Nie udało się pobrać klientów i statusów opinii. Odśwież stronę.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function save(client: Client, checked: boolean) {
    if (pending.current.has(client.id)) return;
    pending.current.add(client.id);
    setSaving(current => [...current, client.id]);
    setSaveError("");
    try {
      const { data, error } = await supabase.from("cso_google_reviews")
        .upsert({ klient_id: client.id, opinia_dodana: checked }, { onConflict: "klient_id" })
        .select("klient_id,opinia_dodana").single();
      if (error) throw error;
      setClients(current => current.map(row => row.id === data.klient_id ? { ...row, opinia_dodana: data.opinia_dodana } : row));
    } catch {
      setSaveError("Nie udało się zapisać oznaczenia dla klienta „" + (client.nazwa || "Klient bez nazwy") + "”. Spróbuj ponownie.");
    } finally {
      pending.current.delete(client.id);
      setSaving(current => current.filter(id => id !== client.id));
    }
  }

  async function remove(client: Client) {
    if (pending.current.has(client.id)) return;
    if (!window.confirm("Czy na pewno chcesz usunąć klienta „" + (client.nazwa || "Klient bez nazwy") + "” z listy Opinie Google? Klient pozostanie w aplikacji.")) return;
    pending.current.add(client.id);
    setSaving(current => [...current, client.id]);
    setSaveError("");
    try {
      const { error } = await supabase.from("cso_google_reviews")
        .upsert({ klient_id: client.id, opinia_dodana: client.opinia_dodana, ukryty: true }, { onConflict: "klient_id" })
        .select("klient_id").single();
      if (error) throw error;
      setClients(current => current.filter(row => row.id !== client.id));
    } catch {
      setSaveError("Nie udało się usunąć klienta z listy. Spróbuj ponownie.");
    } finally {
      pending.current.delete(client.id);
      setSaving(current => current.filter(id => id !== client.id));
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="google-reviews-title">
      <header className={styles.header}>
        <div>
          <h1 id="google-reviews-title">Opinie Google</h1>
          <p>Zaznacz klientów, którzy dodali opinię w Google.</p>
        </div>
        {!loading && !loadError && <span className={styles.counter}>{clients.filter(client => client.opinia_dodana).length} / {clients.length} z opinią</span>}
      </header>
      {saveError && <p className={styles.message} role="alert" style={{ color: colors.danger }}>{saveError}</p>}
      {loading ? <p className={styles.message} role="status">Ładowanie klientów…</p> : loadError ? (
        <p className={styles.message} role="alert" style={{ color: colors.danger }}>{loadError}</p>
      ) : clients.length === 0 ? <p className={styles.message}>Brak klientów.</p> : (
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Klienci — opinie Google">
          <table className={styles.table}>
            <thead><tr>
              <th scope="col">Nazwa klienta</th>
              <th scope="col">E-mail kontaktowy</th>
              <th scope="col">Osoba kontaktowa</th>
              <th scope="col">Opinia dodana</th>
              <th scope="col" aria-label="Akcje" />
            </tr></thead>
            <tbody>{clients.map(client => <tr key={client.id}>
              <td><strong>{client.nazwa || "Klient bez nazwy"}</strong></td>
              <td>{client.email?.trim() || "—"}</td>
              <td>{client.osoba_kontaktowa?.trim() || "—"}</td>
              <td><input type="checkbox"
                aria-label={"Opinia Google dodana — " + (client.nazwa || "Klient bez nazwy")}
                checked={client.opinia_dodana}
                disabled={saving.includes(client.id)}
                onChange={event => void save(client, event.target.checked)}
              /></td>
              <td><button type="button" className={styles.removeButton}
                aria-label={"Usuń z listy Opinie Google — " + (client.nazwa || "Klient bez nazwy")}
                title="Usuń z listy"
                disabled={saving.includes(client.id)}
                onClick={() => void remove(client)}
              ><Trash2 size={16} aria-hidden="true" /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
