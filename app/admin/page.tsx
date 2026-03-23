"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Category = "easy" | "medium" | "hard" | "difficult" | "expert";
type QuestionType = "mcq" | "image_puzzle";

type QuestionRow = {
  id: string;
  game_date: string;
  category: Category;
  question_type: QuestionType;
  prompt: string;
  prompt_hi: string | null;
  image_url: string | null;
};

const IMAGE_BUCKET = "question-images";

export default function AdminPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [authError, setAuthError] = useState("");

  const [gameDate, setGameDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<Category>("easy");
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [promptHi, setPromptHi] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionAHi, setOptionAHi] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionBHi, setOptionBHi] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionCHi, setOptionCHi] = useState("");
  const [optionD, setOptionD] = useState("");
  const [optionDHi, setOptionDHi] = useState("");
  const [correctOption, setCorrectOption] = useState<"a" | "b" | "c" | "d">("a");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);

  const loadQuestions = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("id, game_date, category, question_type, prompt, prompt_hi, image_url")
      .order("game_date", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    setQuestions((data ?? []) as QuestionRow[]);
  };

  useEffect(() => {
    if (!isAuthed) {
      return;
    }

    void loadQuestions();
  }, [isAuthed]);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");

    if (username === "admin" && password === "admin") {
      setIsAuthed(true);
      return;
    }

    setAuthError("Invalid credentials.");
  };

  const uploadImageIfNeeded = async () => {
    if (questionType !== "image_puzzle") {
      return null;
    }

    if (!imageFile) {
      throw new Error("Please select an image for image puzzle question.");
    }

    const sanitizedName = imageFile.name.replace(/\s+/g, "-").toLowerCase();
    const filePath = `${gameDate}/${category}/${crypto.randomUUID()}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(filePath, imageFile, {
      cacheControl: "3600",
      upsert: false
    });

    if (uploadError) {
      throw new Error(`Image upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleAddQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError("");
    setSaveSuccess("");

    if (!gameDate || !prompt.trim()) {
      setSaveError("Please fill date and question prompt.");
      return;
    }

    if (questionType === "mcq") {
      if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
        setSaveError("Please fill all four options for MCQ.");
        return;
      }
    }

    setLoading(true);

    try {
      const imageUrl = await uploadImageIfNeeded();

      const payload = {
        id: crypto.randomUUID(),
        game_date: gameDate,
        category,
        question_type: questionType,
        image_url: imageUrl,
        prompt: prompt.trim(),
        prompt_hi: promptHi.trim() || null,
        option_a: questionType === "mcq" ? optionA.trim() : null,
        option_a_hi: questionType === "mcq" ? optionAHi.trim() || null : null,
        option_b: questionType === "mcq" ? optionB.trim() : null,
        option_b_hi: questionType === "mcq" ? optionBHi.trim() || null : null,
        option_c: questionType === "mcq" ? optionC.trim() : null,
        option_c_hi: questionType === "mcq" ? optionCHi.trim() || null : null,
        option_d: questionType === "mcq" ? optionD.trim() : null,
        option_d_hi: questionType === "mcq" ? optionDHi.trim() || null : null,
        correct_option_id: questionType === "mcq" ? correctOption : "a"
      };

      const { error } = await supabase.from("questions").insert(payload);

      if (error) {
        throw error;
      }

      setPrompt("");
      setPromptHi("");
      setOptionA("");
      setOptionAHi("");
      setOptionB("");
      setOptionBHi("");
      setOptionC("");
      setOptionCHi("");
      setOptionD("");
      setOptionDHi("");
      setCorrectOption("a");
      setImageFile(null);
      setSaveSuccess("Question added successfully.");
      await loadQuestions();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add question.";
      setSaveError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthed) {
    return (
      <main className="page">
        <section className="card">
          <h1>Admin Login</h1>
          <p>Use credentials to manage questions.</p>

          <form onSubmit={handleLogin} className="stack">
            <label htmlFor="username">Username</label>
            <input id="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} />

            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />

            <button type="submit">Login</button>
          </form>

          {authError && <p className="error">{authError}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card stack">
        <h1>Admin Panel</h1>
        <p>Add day-specific questions by category.</p>

        <form onSubmit={handleAddQuestion} className="stack">
          <label htmlFor="game-date">Game Date</label>
          <input id="game-date" type="date" value={gameDate} onChange={(event) => setGameDate(event.target.value)} />

          <label htmlFor="category">Category</label>
          <select id="category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="difficult">Difficult</option>
            <option value="expert">Expert</option>
          </select>

          <label htmlFor="question-type">Question Type</label>
          <select
            id="question-type"
            value={questionType}
            onChange={(event) => setQuestionType(event.target.value as QuestionType)}
          >
            <option value="mcq">MCQ</option>
            <option value="image_puzzle">Image Puzzle</option>
          </select>

          <label htmlFor="prompt">Question Prompt</label>
          <input id="prompt" type="text" value={prompt} onChange={(event) => setPrompt(event.target.value)} />

          <label htmlFor="prompt-hi">Question Prompt (Hindi)</label>
          <input id="prompt-hi" type="text" value={promptHi} onChange={(event) => setPromptHi(event.target.value)} />

          {questionType === "mcq" ? (
            <>
              <label htmlFor="option-a">Option A</label>
              <input id="option-a" type="text" value={optionA} onChange={(event) => setOptionA(event.target.value)} />

              <label htmlFor="option-a-hi">Option A (Hindi)</label>
              <input id="option-a-hi" type="text" value={optionAHi} onChange={(event) => setOptionAHi(event.target.value)} />

              <label htmlFor="option-b">Option B</label>
              <input id="option-b" type="text" value={optionB} onChange={(event) => setOptionB(event.target.value)} />

              <label htmlFor="option-b-hi">Option B (Hindi)</label>
              <input id="option-b-hi" type="text" value={optionBHi} onChange={(event) => setOptionBHi(event.target.value)} />

              <label htmlFor="option-c">Option C</label>
              <input id="option-c" type="text" value={optionC} onChange={(event) => setOptionC(event.target.value)} />

              <label htmlFor="option-c-hi">Option C (Hindi)</label>
              <input id="option-c-hi" type="text" value={optionCHi} onChange={(event) => setOptionCHi(event.target.value)} />

              <label htmlFor="option-d">Option D</label>
              <input id="option-d" type="text" value={optionD} onChange={(event) => setOptionD(event.target.value)} />

              <label htmlFor="option-d-hi">Option D (Hindi)</label>
              <input id="option-d-hi" type="text" value={optionDHi} onChange={(event) => setOptionDHi(event.target.value)} />

              <label htmlFor="correct-option">Correct Option</label>
              <select
                id="correct-option"
                value={correctOption}
                onChange={(event) => setCorrectOption(event.target.value as "a" | "b" | "c" | "d")}
              >
                <option value="a">A</option>
                <option value="b">B</option>
                <option value="c">C</option>
                <option value="d">D</option>
              </select>
            </>
          ) : (
            <>
              <label htmlFor="image-file">Puzzle Image</label>
              <input
                id="image-file"
                type="file"
                accept="image/*"
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
              />
              <p>Upload target bucket: <code>{IMAGE_BUCKET}</code></p>
            </>
          )}

          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Add Question"}
          </button>
        </form>

        {saveSuccess && <p className="success">{saveSuccess}</p>}
        {saveError && <p className="error">{saveError}</p>}

        <section className="attempts">
          <h3>Existing Questions ({questions.length})</h3>
          {questions.length === 0 ? (
            <p>No questions found.</p>
          ) : (
            <ul>
              {questions.map((question) => (
                <li key={question.id}>
                  <strong>{question.game_date}</strong> | {question.category.toUpperCase()} | {question.question_type} | {question.prompt}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
