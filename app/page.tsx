"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const normalizePhone = (value: string) => value.replace(/\D/g, "");
const PLAYER_ID_STORAGE_KEY = "treasure_hunt_player_id";
type Language = "english" | "hindi";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<Language>("english");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingStorage, setCheckingStorage] = useState(true);

  useEffect(() => {
    const storedId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (storedId) {
      router.replace(`/question?playerId=${storedId}`);
      return;
    }
    setCheckingStorage(false);
  }, [router]);

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const cleanedPhone = normalizePhone(phone);
    const cleanedName = name.trim();

    if (!cleanedName) {
      setError("Name is required.");
      return;
    }

    if (cleanedPhone.length < 8) {
      setError("Enter a valid number.");
      return;
    }

    setLoading(true);

    try {
      const playerId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const todayIso = new Date().toISOString().slice(0, 10);

      const { data, error: insertError } = await supabase
        .from("players")
        .insert({
          id: playerId,
          name: cleanedName,
          phone: cleanedPhone,
          preferred_language: language,
          current_stage_index: 0,
          active_game_date: todayIso,
          stage_question_ids: {},
          daily_completed_at: null,
          daily_total_time_seconds: null,
          created_at: nowIso,
          last_login_at: nowIso
        })
        .select("id")
        .single();

      if (insertError || !data?.id) {
        throw new Error(insertError?.message || "Registration insert failed");
      }

      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, data.id);
      router.push(`/question?playerId=${data.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to register right now. Try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingStorage) {
    return (
      <main className="page">
        <section className="card">
          <p>Resuming session...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Treasure Hunt</h1>
        <p>Register with your name and number to begin.</p>

        <form onSubmit={handleRegister} className="stack">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
          />

          <label htmlFor="phone">Number</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone number"
          />

          <label htmlFor="language">Language</label>
          <select
            id="language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
          </select>

          <button type="submit" disabled={loading}>
            {loading ? "Registering..." : "Register"}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
