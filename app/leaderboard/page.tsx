"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PlayerRow = {
  id: string;
  name: string;
  phone: string;
  daily_completed_at: string | null;
  daily_total_time_seconds: number | null;
};

type AttemptRow = {
  player_id: string;
  correct: boolean;
  time_taken_seconds: number;
};

type LeaderboardRow = {
  playerId: string;
  name: string;
  phone: string;
  score: number;
  totalTime: number;
  completed: boolean;
};

const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function LeaderboardContent() {
  const searchParams = useSearchParams();
  const playerId = searchParams.get("playerId");

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const today = getLocalDateString();

  useEffect(() => {
    const load = async () => {
      setError("");
      setLoading(true);

      try {
        const [{ data: playersData, error: playersError }, { data: attemptsData, error: attemptsError }] = await Promise.all([
          supabase
            .from("players")
            .select("id, name, phone, daily_completed_at, daily_total_time_seconds")
            .eq("active_game_date", today),
          supabase.from("attempts").select("player_id, correct, time_taken_seconds").eq("game_date", today)
        ]);

        if (playersError) {
          throw playersError;
        }

        if (attemptsError) {
          throw attemptsError;
        }

        const players = (playersData ?? []) as PlayerRow[];
        const attempts = (attemptsData ?? []) as AttemptRow[];

        const attemptsByPlayer = new Map<string, AttemptRow[]>();
        for (const attempt of attempts) {
          const list = attemptsByPlayer.get(attempt.player_id) ?? [];
          list.push(attempt);
          attemptsByPlayer.set(attempt.player_id, list);
        }

        const leaderboard: LeaderboardRow[] = players.map((player) => {
          const playerAttempts = attemptsByPlayer.get(player.id) ?? [];
          const correctAttempts = playerAttempts.filter((attempt) => attempt.correct);
          const score = correctAttempts.length;
          const totalTimeFromAttempts = correctAttempts.reduce((sum, attempt) => sum + attempt.time_taken_seconds, 0);

          return {
            playerId: player.id,
            name: player.name,
            phone: player.phone,
            score,
            totalTime: player.daily_total_time_seconds ?? totalTimeFromAttempts,
            completed: Boolean(player.daily_completed_at)
          };
        });

        leaderboard.sort((a, b) => {
          if (a.score !== b.score) {
            return b.score - a.score;
          }

          return a.totalTime - b.totalTime;
        });

        setRows(leaderboard);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load leaderboard.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [today]);

  const myRank = useMemo(() => {
    if (!playerId) {
      return null;
    }

    const index = rows.findIndex((row) => row.playerId === playerId);
    return index >= 0 ? index + 1 : null;
  }, [rows, playerId]);

  return (
    <main className="page">
      <section className="card stack">
        <h1>Leaderboard</h1>
        <p>Daily ranking for {today}.</p>
        {myRank && <p><strong>Your rank:</strong> #{myRank}</p>}

        {loading ? (
          <p>Loading leaderboard...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : rows.length === 0 ? (
          <p>No scores yet for today.</p>
        ) : (
          <section className="attempts">
            <ul>
              {rows.map((row, index) => (
                <li key={row.playerId}>
                  <strong>#{index + 1}</strong> {row.name} ({row.phone}) | Score: {row.score} | Time: {row.totalTime}s |{" "}
                  {row.completed ? "Completed" : "In Progress"}
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </main>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <section className="card">
            <p>Loading leaderboard...</p>
          </section>
        </main>
      }
    >
      <LeaderboardContent />
    </Suspense>
  );
}
