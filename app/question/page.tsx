"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Category = "easy" | "medium" | "hard" | "difficult" | "expert";
type QuestionType = "mcq" | "image_puzzle" | "fill_blank";
type Language = "english" | "hindi";

type PlayerSession = {
  id: string;
  name: string;
  phone: string;
  preferredLanguage: Language;
  currentStageIndex: number;
  activeGameDate: string | null;
  stageQuestionIds: Record<string, string>;
};

type AttemptRecord = {
  id: string;
  questionId: string;
  category: Category;
  questionType: QuestionType;
  selectedOptionLabel: string;
  correct: boolean;
  timeTakenSeconds: number;
  submittedAt: string;
};

type QuestionRow = {
  id: string;
  game_date: string;
  category: Category;
  question_type: QuestionType;
  image_url: string | null;
  prompt: string;
  prompt_hi: string | null;
  show_trivia: boolean | null;
  trivia_text: string | null;
  trivia_text_hi: string | null;
  trivia_image_url: string | null;
  answer_text: string | null;
  answer_text_hi: string | null;
  option_a: string | null;
  option_a_hi: string | null;
  option_b: string | null;
  option_b_hi: string | null;
  option_c: string | null;
  option_c_hi: string | null;
  option_d: string | null;
  option_d_hi: string | null;
  correct_option_id: "a" | "b" | "c" | "d";
};

type GameQuestion = {
  id: string;
  category: Category;
  questionType: QuestionType;
  imageUrl: string | null;
  prompt: Record<Language, string>;
  showTrivia: boolean;
  triviaText: Record<Language, string>;
  triviaImageUrl: string | null;
  options: { id: "a" | "b" | "c" | "d"; label: Record<Language, string> }[];
  acceptedAnswers: string[];
  correctOptionId: "a" | "b" | "c" | "d";
};

type PendingTrivia = {
  question: GameQuestion;
  nextStageIndex: number;
  nextStageQuestionIds: Record<string, string>;
  redirectToLeaderboard: boolean;
  message: string;
};

const STAGES: Category[] = ["easy", "medium", "hard", "difficult", "expert"];
const PLAYER_ID_STORAGE_KEY = "jin_gyan_player_id";
const PUZZLE_SIZE = 3;

const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const pickRandom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const shuffleTiles = (size: number) => {
  const items = Array.from({ length: size * size }, (_, index) => index);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  const solved = items.every((value, idx) => value === idx);
  if (solved) {
    [items[0], items[1]] = [items[1], items[0]];
  }

  return items;
};

const isSolvedTiles = (tiles: number[]) => tiles.every((value, idx) => value === idx);
const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function QuestionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryPlayerId = searchParams.get("playerId");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerIdResolved, setPlayerIdResolved] = useState(false);

  const [session, setSession] = useState<PlayerSession | null>(null);
  const [questionsById, setQuestionsById] = useState<Record<string, GameQuestion>>({});
  const [questionsByCategory, setQuestionsByCategory] = useState<Record<Category, GameQuestion[]>>({
    easy: [],
    medium: [],
    hard: [],
    difficult: [],
    expert: []
  });
  const [selectedOption, setSelectedOption] = useState("");
  const [fillBlankAnswer, setFillBlankAnswer] = useState("");
  const [language, setLanguage] = useState<Language>("english");
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [questionShownAtMs, setQuestionShownAtMs] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingTrivia, setPendingTrivia] = useState<PendingTrivia | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  const [puzzleTiles, setPuzzleTiles] = useState<number[]>([]);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [puzzleQuestionId, setPuzzleQuestionId] = useState<string | null>(null);

  const today = getLocalDateString();

  const currentCategory = useMemo(() => {
    if (!session) {
      return null;
    }

    return STAGES[session.currentStageIndex] ?? null;
  }, [session]);

  const currentQuestion = useMemo(() => {
    if (!session || !currentCategory) {
      return null;
    }

    const questionId = session.stageQuestionIds[currentCategory];
    if (!questionId) {
      return null;
    }

    return questionsById[questionId] ?? null;
  }, [session, currentCategory, questionsById]);

  const hasCompleted = !!session && session.currentStageIndex >= STAGES.length;

  const ensureStageQuestion = (
    stageIndex: number,
    existingIds: Record<string, string>,
    byCategory: Record<Category, GameQuestion[]>,
    byId: Record<string, GameQuestion>
  ) => {
    if (stageIndex >= STAGES.length) {
      return { updatedIds: existingIds, missingCategory: null as Category | null };
    }

    const stage = STAGES[stageIndex];
    const alreadySelected = existingIds[stage];
    if (alreadySelected && byId[alreadySelected]) {
      return { updatedIds: existingIds, missingCategory: null as Category | null };
    }

    const pool = byCategory[stage] ?? [];
    if (pool.length === 0) {
      return { updatedIds: existingIds, missingCategory: stage };
    }

    const chosen = pickRandom(pool);
    return {
      updatedIds: {
        ...existingIds,
        [stage]: chosen.id
      },
      missingCategory: null as Category | null
    };
  };

  const loadAttempts = async (id: string) => {
    const { data, error: attemptsError } = await supabase
      .from("attempts")
      .select("id, question_id, category, selected_option_id, selected_option_label, correct, time_taken_seconds, submitted_at")
      .eq("player_id", id)
      .eq("game_date", today)
      .order("submitted_at", { ascending: true });

    if (attemptsError) {
      throw attemptsError;
    }

    const rows: AttemptRecord[] = (data ?? []).map((item) => ({
      id: item.id,
      questionId: item.question_id,
      category: item.category,
      questionType:
        item.selected_option_id === "solved"
          ? "image_puzzle"
          : item.selected_option_id === "fill_blank"
            ? "fill_blank"
            : "mcq",
      selectedOptionLabel: item.selected_option_label,
      correct: item.correct,
      timeTakenSeconds: item.time_taken_seconds,
      submittedAt: item.submitted_at
    }));

    setAttempts(rows);
    return rows;
  };

  const loadTodayQuestions = async () => {
    const { data, error: questionsError } = await supabase
      .from("questions")
      .select(
        "id, game_date, category, question_type, image_url, prompt, prompt_hi, show_trivia, trivia_text, trivia_text_hi, trivia_image_url, answer_text, answer_text_hi, option_a, option_a_hi, option_b, option_b_hi, option_c, option_c_hi, option_d, option_d_hi, correct_option_id"
      )
      .eq("game_date", today)
      .order("created_at", { ascending: true });

    if (questionsError) {
      throw questionsError;
    }

    const rows = (data ?? []) as QuestionRow[];
    const byId: Record<string, GameQuestion> = {};
    const byCategory: Record<Category, GameQuestion[]> = {
      easy: [],
      medium: [],
      hard: [],
      difficult: [],
      expert: []
    };

    for (const row of rows) {
      const mapped: GameQuestion = {
        id: row.id,
        category: row.category,
        questionType: row.question_type,
        imageUrl: row.image_url,
        prompt: {
          english: row.prompt,
          hindi: row.prompt_hi ?? row.prompt
        },
        showTrivia: !!row.show_trivia,
        triviaText: {
          english: row.trivia_text ?? "",
          hindi: row.trivia_text_hi ?? row.trivia_text ?? ""
        },
        triviaImageUrl: row.trivia_image_url,
        options: [
          {
            id: "a",
            label: {
              english: row.option_a ?? "",
              hindi: row.option_a_hi ?? row.option_a ?? ""
            }
          },
          {
            id: "b",
            label: {
              english: row.option_b ?? "",
              hindi: row.option_b_hi ?? row.option_b ?? ""
            }
          },
          {
            id: "c",
            label: {
              english: row.option_c ?? "",
              hindi: row.option_c_hi ?? row.option_c ?? ""
            }
          },
          {
            id: "d",
            label: {
              english: row.option_d ?? "",
              hindi: row.option_d_hi ?? row.option_d ?? ""
            }
          }
        ],
        acceptedAnswers: [row.answer_text, row.answer_text_hi]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => normalizeText(value)),
        correctOptionId: row.correct_option_id
      };

      byId[row.id] = mapped;
      byCategory[row.category].push(mapped);
    }

    setQuestionsById(byId);
    setQuestionsByCategory(byCategory);
    return { byId, byCategory };
  };

  useEffect(() => {
    const hydrate = async () => {
      if (!playerIdResolved) {
        return;
      }

      if (!playerId) {
        setError("Missing player ID. Please register again.");
        setBootstrapping(false);
        return;
      }

      try {
        setBootstrapping(true);
        const [questionData, playerResp, attemptRows] = await Promise.all([
          loadTodayQuestions(),
          supabase
            .from("players")
            .select("id, name, phone, preferred_language, current_stage_index, active_game_date, stage_question_ids")
            .eq("id", playerId)
            .single(),
          loadAttempts(playerId)
        ]);

        const { data: playerData, error: playerError } = playerResp;

        if (playerError || !playerData) {
          window.localStorage.removeItem(PLAYER_ID_STORAGE_KEY);
          setError("Player not found. Please register again.");
          setBootstrapping(false);
          return;
        }

        const needsDailyReset = playerData.active_game_date !== today;
        const isFreshForToday = attemptRows.length === 0;

        let currentStageIndex = needsDailyReset || isFreshForToday ? 0 : Math.max(0, playerData.current_stage_index ?? 0);
        if (currentStageIndex > STAGES.length) {
          currentStageIndex = STAGES.length;
        }

        let stageQuestionIds = (needsDailyReset ? {} : playerData.stage_question_ids ?? {}) as Record<string, string>;

        const ensured = ensureStageQuestion(currentStageIndex, stageQuestionIds, questionData.byCategory, questionData.byId);
        stageQuestionIds = ensured.updatedIds;

        if (ensured.missingCategory) {
          setError(`No ${ensured.missingCategory.toUpperCase()} questions found for ${today}.`);
        }

        const shouldPersist =
          needsDailyReset ||
          isFreshForToday ||
          JSON.stringify(stageQuestionIds) !== JSON.stringify((playerData.stage_question_ids ?? {}) as Record<string, string>) ||
          currentStageIndex !== (playerData.current_stage_index ?? 0);

        if (shouldPersist) {
          const { error: syncError } = await supabase
            .from("players")
            .update({
              active_game_date: today,
              current_stage_index: currentStageIndex,
              stage_question_ids: stageQuestionIds,
              daily_completed_at: needsDailyReset ? null : undefined,
              daily_total_time_seconds: needsDailyReset ? null : undefined,
              last_login_at: new Date().toISOString()
            })
            .eq("id", playerId);

          if (syncError) {
            throw syncError;
          }
        }

        setSession({
          id: playerData.id,
          name: playerData.name,
          phone: playerData.phone,
          preferredLanguage: (playerData.preferred_language ?? "english") as Language,
          currentStageIndex,
          activeGameDate: today,
          stageQuestionIds
        });
        setLanguage((playerData.preferred_language ?? "english") as Language);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load your game.";
        setError(message);
      } finally {
        setBootstrapping(false);
      }
    };

    void hydrate();
  }, [playerId, playerIdResolved, today]);

  useEffect(() => {
    if (queryPlayerId) {
      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, queryPlayerId);
      setPlayerId(queryPlayerId);
      setPlayerIdResolved(true);
      return;
    }

    const storedId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (storedId) {
      setPlayerId(storedId);
      router.replace(`/question?playerId=${storedId}`);
      setPlayerIdResolved(true);
      return;
    }

    setPlayerId(null);
    setPlayerIdResolved(true);
  }, [queryPlayerId, router]);

  useEffect(() => {
    if (!currentQuestion || hasCompleted) {
      return;
    }

    setQuestionShownAtMs(Date.now());
    setSelectedOption("");
    setFillBlankAnswer("");
    setSuccessMessage("");

    if (currentQuestion.questionType === "image_puzzle") {
      if (puzzleQuestionId !== currentQuestion.id) {
        setPuzzleQuestionId(currentQuestion.id);
        setPuzzleTiles(shuffleTiles(PUZZLE_SIZE));
        setSelectedTileIndex(null);
      }
    }
  }, [currentQuestion, hasCompleted, puzzleQuestionId]);

  const totalSolvedSeconds = attempts
    .filter((attempt) => attempt.correct)
    .reduce((total, attempt) => total + attempt.timeTakenSeconds, 0);

  const submitProgress = async (
    selectedOptionId: string,
    selectedOptionLabel: string,
    isCorrect: boolean,
    advanceOnWrong: boolean
  ) => {
    if (!session || !currentQuestion || !currentCategory) {
      return;
    }

    const now = Date.now();
    const timeTakenSeconds = questionShownAtMs ? Math.max(1, Math.round((now - questionShownAtMs) / 1000)) : 0;

    const { error: attemptError } = await supabase.from("attempts").insert({
      id: crypto.randomUUID(),
      player_id: session.id,
      game_date: today,
      category: currentCategory,
      question_id: currentQuestion.id,
      question_prompt: currentQuestion.prompt[language],
      selected_option_id: selectedOptionId,
      selected_option_label: selectedOptionLabel,
      correct: isCorrect,
      time_taken_seconds: timeTakenSeconds,
      submitted_at: new Date().toISOString()
    });

    if (attemptError) {
      throw attemptError;
    }

    if (!isCorrect && !advanceOnWrong) {
      setError("Wrong answer. Try again.");
      await loadAttempts(session.id);
      return;
    }

    const nextStageIndex = session.currentStageIndex + 1;
    let nextStageQuestionIds = { ...session.stageQuestionIds };

    const ensuredNext = ensureStageQuestion(nextStageIndex, nextStageQuestionIds, questionsByCategory, questionsById);
    nextStageQuestionIds = ensuredNext.updatedIds;

    const solvedTotalAfter = totalSolvedSeconds + timeTakenSeconds;
    const updates: Record<string, unknown> = {
      current_stage_index: nextStageIndex,
      stage_question_ids: nextStageQuestionIds,
      last_login_at: new Date().toISOString(),
      daily_total_time_seconds: solvedTotalAfter
    };

    if (nextStageIndex >= STAGES.length) {
      updates.daily_completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase.from("players").update(updates).eq("id", session.id);

    if (updateError) {
      throw updateError;
    }

    if (ensuredNext.missingCategory) {
      setError(`No ${ensuredNext.missingCategory.toUpperCase()} questions found for ${today}.`);
    }

    const message = advanceOnWrong ? "Answer recorded. Next category unlocked." : "Correct answer. Next category unlocked.";
    const hasTrivia =
      currentQuestion.showTrivia &&
      (!!currentQuestion.triviaText.english.trim() ||
        !!currentQuestion.triviaText.hindi.trim() ||
        !!currentQuestion.triviaImageUrl);

    await loadAttempts(session.id);

    if (hasTrivia) {
      setPendingTrivia({
        question: currentQuestion,
        nextStageIndex,
        nextStageQuestionIds,
        redirectToLeaderboard: nextStageIndex >= STAGES.length,
        message
      });
      return;
    }

    if (nextStageIndex >= STAGES.length) {
      router.push(`/leaderboard?playerId=${session.id}`);
      return;
    }

    setSession((prev) =>
      prev
        ? {
            ...prev,
            currentStageIndex: nextStageIndex,
            stageQuestionIds: nextStageQuestionIds
          }
        : prev
    );

    setSuccessMessage(message);
  };

  const continueAfterTrivia = () => {
    if (!pendingTrivia || !session) {
      return;
    }

    const { nextStageIndex, nextStageQuestionIds, redirectToLeaderboard, message } = pendingTrivia;
    setPendingTrivia(null);

    if (redirectToLeaderboard) {
      router.push(`/leaderboard?playerId=${session.id}`);
      return;
    }

    setSession((prev) =>
      prev
        ? {
            ...prev,
            currentStageIndex: nextStageIndex,
            stageQuestionIds: nextStageQuestionIds
          }
        : prev
    );
    setSuccessMessage(message);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!session || !currentQuestion || !currentCategory) {
      return;
    }

    if (currentQuestion.questionType !== "mcq") {
      return;
    }

    if (!selectedOption) {
      setError("Please select one option.");
      return;
    }

    const chosenOption = currentQuestion.options.find((option) => option.id === selectedOption);
    if (!chosenOption) {
      setError("Invalid option selected.");
      return;
    }

    const isCorrect = selectedOption === currentQuestion.correctOptionId;

    setLoading(true);
    try {
      await submitProgress(chosenOption.id, chosenOption.label[language], isCorrect, true);
    } catch {
      setError("Could not submit answer. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleTileClick = async (index: number) => {
    if (!currentQuestion || currentQuestion.questionType !== "image_puzzle" || loading) {
      return;
    }

    if (selectedTileIndex === null) {
      setSelectedTileIndex(index);
      return;
    }

    if (selectedTileIndex === index) {
      setSelectedTileIndex(null);
      return;
    }

    const updated = [...puzzleTiles];
    [updated[selectedTileIndex], updated[index]] = [updated[index], updated[selectedTileIndex]];
    setSelectedTileIndex(null);
    setPuzzleTiles(updated);

    if (isSolvedTiles(updated)) {
      setLoading(true);
      setError("");
      setSuccessMessage("");
      try {
        await submitProgress("solved", "PUZZLE_SOLVED", true, false);
      } catch {
        setError("Could not submit puzzle result. Try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFillBlankSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!session || !currentQuestion || !currentCategory || currentQuestion.questionType !== "fill_blank") {
      return;
    }

    const submittedAnswer = fillBlankAnswer.trim();
    if (!submittedAnswer) {
      setError("Please enter an answer.");
      return;
    }

    const normalizedAnswer = normalizeText(submittedAnswer);
    const isCorrect = currentQuestion.acceptedAnswers.includes(normalizedAnswer);

    setLoading(true);
    try {
      await submitProgress("fill_blank", submittedAnswer, isCorrect, false);
    } catch {
      setError("Could not submit answer. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (bootstrapping) {
    return (
      <main className="page">
        <section className="card">
          <p>Loading your game...</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page">
        <section className="card stack">
          <h1>Jin Gyan</h1>
          <p className="error">{error || "Unable to start game."}</p>
          <button
            type="button"
            onClick={() => {
              window.localStorage.removeItem(PLAYER_ID_STORAGE_KEY);
              router.push("/");
            }}
          >
            Register Again
          </button>
        </section>
      </main>
    );
  }

  if (!currentQuestion && !hasCompleted) {
    return (
      <main className="page">
        <section className="card stack">
          <h1>Jin Gyan</h1>
          <p className="error">{error || `No ${currentCategory?.toUpperCase()} question available for ${today}.`}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <div className="header-row">
          <h1>Welcome, {session.name}</h1>
          <span>
            Stage {Math.min(session.currentStageIndex + 1, STAGES.length)} of {STAGES.length}
          </span>
        </div>
        <div className="header-row">
          <span><strong>Language:</strong> {language === "english" ? "English" : "Hindi"}</span>
          <div className="language-toggle">
            <button
              type="button"
              className={language === "english" ? "toggle-button active" : "toggle-button"}
              onClick={() => {
                setLanguage("english");
                setSession((prev) => (prev ? { ...prev, preferredLanguage: "english" } : prev));
                void supabase.from("players").update({ preferred_language: "english" }).eq("id", session.id);
              }}
            >
              English
            </button>
            <button
              type="button"
              className={language === "hindi" ? "toggle-button active" : "toggle-button"}
              onClick={() => {
                setLanguage("hindi");
                setSession((prev) => (prev ? { ...prev, preferredLanguage: "hindi" } : prev));
                void supabase.from("players").update({ preferred_language: "hindi" }).eq("id", session.id);
              }}
            >
              Hindi
            </button>
          </div>
        </div>

        {hasCompleted ? (
          <div className="stack">
            <h2>Jin Gyan Complete</h2>
            <p>You solved all categories for {today}.</p>
            <p>Total solve time: {Math.round(totalSolvedSeconds)} seconds.</p>
            <button type="button" onClick={() => router.push(`/leaderboard?playerId=${session.id}`)}>
              View Leaderboard
            </button>
          </div>
        ) : pendingTrivia ? (
          <div className="stack">
            <p><strong>Category:</strong> {pendingTrivia.question.category.toUpperCase()}</p>
            <h2>Answer Trivia</h2>
            {pendingTrivia.question.triviaText[language] && <p>{pendingTrivia.question.triviaText[language]}</p>}
            {pendingTrivia.question.triviaImageUrl && (
              <img
                className="trivia-image"
                src={pendingTrivia.question.triviaImageUrl}
                alt="Trivia related to the answer"
              />
            )}
            <button type="button" onClick={continueAfterTrivia}>
              Continue
            </button>
          </div>
        ) : currentQuestion?.questionType === "image_puzzle" ? (
          <div className="stack">
            <p><strong>Category:</strong> {currentQuestion.category.toUpperCase()}</p>
            <h2>{currentQuestion.prompt[language]}</h2>
            {!currentQuestion.imageUrl ? (
              <p className="error">Puzzle image is missing for this question.</p>
            ) : (
              <>
                <p>Rearrange tiles to complete the image.</p>
                <div className="puzzle-grid">
                  {puzzleTiles.map((tile, index) => {
                    const row = Math.floor(tile / PUZZLE_SIZE);
                    const col = tile % PUZZLE_SIZE;
                    const selected = selectedTileIndex === index;

                    return (
                      <button
                        key={`${tile}-${index}`}
                        type="button"
                        className={selected ? "puzzle-tile selected" : "puzzle-tile"}
                        onClick={() => {
                          void handleTileClick(index);
                        }}
                        style={{
                          backgroundImage: `url(${currentQuestion.imageUrl})`,
                          backgroundSize: `${PUZZLE_SIZE * 100}% ${PUZZLE_SIZE * 100}%`,
                          backgroundPosition: `${(col / (PUZZLE_SIZE - 1)) * 100}% ${(row / (PUZZLE_SIZE - 1)) * 100}%`
                        }}
                        aria-label={`Tile ${index + 1}`}
                      />
                    );
                  })}
                </div>
                {loading && <p>Checking puzzle...</p>}
              </>
            )}
          </div>
        ) : currentQuestion?.questionType === "fill_blank" ? (
          <form onSubmit={handleFillBlankSubmit} className="stack">
            <p><strong>Category:</strong> {currentQuestion.category.toUpperCase()}</p>
            <h2>{currentQuestion.prompt[language]}</h2>
            <label htmlFor="fill-blank-answer">Your Answer</label>
            <input
              id="fill-blank-answer"
              type="text"
              value={fillBlankAnswer}
              onChange={(event) => setFillBlankAnswer(event.target.value)}
              placeholder={language === "english" ? "Type your answer" : "अपना उत्तर लिखें"}
              autoComplete="off"
            />
            <button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit Answer"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="stack">
            <p><strong>Category:</strong> {currentQuestion?.category.toUpperCase()}</p>
            <h2>{currentQuestion?.prompt[language]}</h2>
            <fieldset className="options-grid">
              <legend className="sr-only">Choose one option</legend>
              {currentQuestion?.options.map((option) => (
                <label key={option.id} className="option-card">
                  <input
                    type="radio"
                    name="answer"
                    value={option.id}
                    checked={selectedOption === option.id}
                    onChange={(event) => setSelectedOption(event.target.value)}
                  />
                  <span>{option.label[language]}</span>
                </label>
              ))}
            </fieldset>

            <button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit Answer"}
            </button>
          </form>
        )}

        {successMessage && <p className="success">{successMessage}</p>}
        {error && <p className="error">{error}</p>}

        <section className="attempts">
          <h3>Today&apos;s Attempt History</h3>
          {attempts.length === 0 ? (
            <p>No attempts yet.</p>
          ) : (
            <ul>
              {attempts.map((attempt) => (
                <li key={attempt.id}>
                  <strong>{attempt.category.toUpperCase()}</strong>:{" "}
                  {attempt.questionType === "image_puzzle"
                    ? `Puzzle solved | ${Math.round(attempt.timeTakenSeconds)}s`
                    : attempt.questionType === "fill_blank"
                      ? `${attempt.correct ? "Correct" : "Wrong"} | ${Math.round(attempt.timeTakenSeconds)}s`
                      : `Answer submitted | ${Math.round(attempt.timeTakenSeconds)}s`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

export default function QuestionPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <section className="card">
            <p>Loading your game...</p>
          </section>
        </main>
      }
    >
      <QuestionContent />
    </Suspense>
  );
}
