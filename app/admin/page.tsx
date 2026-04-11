"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Category = "easy" | "medium" | "hard" | "difficult" | "expert";
type QuestionType = "mcq" | "image_puzzle" | "fill_blank";

type QuestionRow = {
  id: string;
  game_date: string;
  category: Category;
  question_type: QuestionType;
  prompt: string;
  prompt_hi: string | null;
  show_trivia: boolean;
  image_url: string | null;
};

type BulkImportResult = {
  ok: boolean;
  inserted: number;
  updated: number;
  failed: number;
  errors: string[];
};

const IMAGE_BUCKET = "question-images";
const BULK_API_KEY_STORAGE_KEY = "jin_gyan_bulk_api_key";

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
  const [showTrivia, setShowTrivia] = useState(false);
  const [triviaText, setTriviaText] = useState("");
  const [triviaTextHi, setTriviaTextHi] = useState("");
  const [triviaImageFile, setTriviaImageFile] = useState<File | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [answerTextHi, setAnswerTextHi] = useState("");
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
  const [bulkApiKey, setBulkApiKey] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);

  const loadQuestions = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("id, game_date, category, question_type, prompt, prompt_hi, show_trivia, image_url")
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

    const storedBulkKey = window.localStorage.getItem(BULK_API_KEY_STORAGE_KEY);
    if (storedBulkKey) {
      setBulkApiKey(storedBulkKey);
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

  const uploadImage = async (file: File, folder: string) => {
    const sanitizedName = file.name.replace(/\s+/g, "-").toLowerCase();
    const filePath = `${gameDate}/${category}/${folder}/${crypto.randomUUID()}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

    if (uploadError) {
      throw new Error(`Image upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const uploadPuzzleImageIfNeeded = async () => {
    if (questionType !== "image_puzzle") {
      return null;
    }

    if (!imageFile) {
      throw new Error("Please select an image for image puzzle question.");
    }

    return uploadImage(imageFile, "puzzles");
  };

  const uploadTriviaImageIfNeeded = async () => {
    if (!showTrivia || !triviaImageFile) {
      return null;
    }

    return uploadImage(triviaImageFile, "trivia");
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

    if (questionType === "fill_blank" && !answerText.trim() && !answerTextHi.trim()) {
      setSaveError("Please provide at least one accepted answer for fill in the blank.");
      return;
    }

    if (showTrivia && !triviaText.trim() && !triviaTextHi.trim() && !triviaImageFile) {
      setSaveError("Please provide trivia text or a trivia image when trivia is enabled.");
      return;
    }

    setLoading(true);

    try {
      const imageUrl = await uploadPuzzleImageIfNeeded();
      const triviaImageUrl = await uploadTriviaImageIfNeeded();

      const payload = {
        id: crypto.randomUUID(),
        game_date: gameDate,
        category,
        question_type: questionType,
        image_url: imageUrl,
        prompt: prompt.trim(),
        prompt_hi: promptHi.trim() || null,
        show_trivia: showTrivia,
        trivia_text: showTrivia ? triviaText.trim() || null : null,
        trivia_text_hi: showTrivia ? triviaTextHi.trim() || null : null,
        trivia_image_url: showTrivia ? triviaImageUrl : null,
        answer_text: questionType === "fill_blank" ? answerText.trim() || null : null,
        answer_text_hi: questionType === "fill_blank" ? answerTextHi.trim() || null : null,
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
      setShowTrivia(false);
      setTriviaText("");
      setTriviaTextHi("");
      setTriviaImageFile(null);
      setAnswerText("");
      setAnswerTextHi("");
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

  const handleBulkImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBulkError("");
    setBulkResult(null);

    if (!bulkApiKey.trim()) {
      setBulkError("Bulk API key is required.");
      return;
    }

    if (!bulkFile) {
      setBulkError("Please choose a CSV file.");
      return;
    }

    setBulkLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", bulkFile);

      const response = await fetch("/api/bulk-questions", {
        method: "POST",
        headers: {
          "x-bulk-api-key": bulkApiKey.trim()
        },
        body: formData
      });

      const result = (await response.json()) as BulkImportResult | { error?: string };

      if (!response.ok) {
        throw new Error("error" in result ? result.error ?? "Bulk import failed." : "Bulk import failed.");
      }

      setBulkResult(result as BulkImportResult);
      window.localStorage.setItem(BULK_API_KEY_STORAGE_KEY, bulkApiKey.trim());
      await loadQuestions();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk import failed.";
      setBulkError(message);
    } finally {
      setBulkLoading(false);
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
            <option value="fill_blank">Fill In The Blank</option>
          </select>

          <label htmlFor="prompt">Question Prompt</label>
          <input id="prompt" type="text" value={prompt} onChange={(event) => setPrompt(event.target.value)} />

          <label htmlFor="prompt-hi">Question Prompt (Hindi)</label>
          <input id="prompt-hi" type="text" value={promptHi} onChange={(event) => setPromptHi(event.target.value)} />

          <label className="option-card" htmlFor="show-trivia">
            <input
              id="show-trivia"
              type="checkbox"
              checked={showTrivia}
              onChange={(event) => setShowTrivia(event.target.checked)}
            />
            <span>Show trivia after answer</span>
          </label>

          {showTrivia && (
            <>
              <label htmlFor="trivia-text">Trivia Text</label>
              <textarea id="trivia-text" value={triviaText} onChange={(event) => setTriviaText(event.target.value)} />

              <label htmlFor="trivia-text-hi">Trivia Text (Hindi)</label>
              <textarea id="trivia-text-hi" value={triviaTextHi} onChange={(event) => setTriviaTextHi(event.target.value)} />

              <label htmlFor="trivia-image-file">Trivia Image</label>
              <input
                id="trivia-image-file"
                type="file"
                accept="image/*"
                onChange={(event) => setTriviaImageFile(event.target.files?.[0] ?? null)}
              />
            </>
          )}

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
          ) : questionType === "fill_blank" ? (
            <>
              <label htmlFor="answer-text">Accepted Answer</label>
              <input
                id="answer-text"
                type="text"
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
              />

              <label htmlFor="answer-text-hi">Accepted Answer (Hindi)</label>
              <input
                id="answer-text-hi"
                type="text"
                value={answerTextHi}
                onChange={(event) => setAnswerTextHi(event.target.value)}
              />
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

        <section className="attempts stack">
          <h3>Bulk Import</h3>
          <p>Upload a CSV from the browser to insert or update questions in bulk.</p>

          <form onSubmit={handleBulkImport} className="stack">
            <label htmlFor="bulk-api-key">Bulk API Key</label>
            <input
              id="bulk-api-key"
              type="password"
              value={bulkApiKey}
              onChange={(event) => setBulkApiKey(event.target.value)}
              placeholder="Enter BULK_IMPORT_API_KEY"
            />

            <label htmlFor="bulk-file">CSV File</label>
            <input
              id="bulk-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setBulkFile(event.target.files?.[0] ?? null)}
            />

            <button type="submit" disabled={bulkLoading}>
              {bulkLoading ? "Uploading..." : "Upload CSV"}
            </button>
          </form>

          {bulkError && <p className="error">{bulkError}</p>}

          {bulkResult && (
            <div className="stack">
              <p className={bulkResult.ok ? "success" : "error"}>
                Import finished: {bulkResult.inserted} inserted, {bulkResult.updated} updated, {bulkResult.failed} failed.
              </p>
              {bulkResult.errors.length > 0 && (
                <ul>
                  {bulkResult.errors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="attempts">
          <h3>Existing Questions ({questions.length})</h3>
          {questions.length === 0 ? (
            <p>No questions found.</p>
          ) : (
            <ul>
              {questions.map((question) => (
                <li key={question.id}>
                  <strong>{question.game_date}</strong> | {question.category.toUpperCase()} | {question.question_type} |{" "}
                  {question.show_trivia ? "TRIVIA ON" : "TRIVIA OFF"} | {question.prompt}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
