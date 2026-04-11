import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Category = "easy" | "medium" | "hard" | "difficult" | "expert";
type QuestionType = "mcq" | "image_puzzle" | "fill_blank";

type CsvRow = Record<string, string>;

const REQUIRED_HEADERS = [
  "id",
  "game_date",
  "category",
  "question_type",
  "prompt",
  "prompt_hi",
  "show_trivia",
  "trivia_text",
  "trivia_text_hi",
  "trivia_image_url",
  "image_url",
  "answer_text",
  "answer_text_hi",
  "option_a",
  "option_a_hi",
  "option_b",
  "option_b_hi",
  "option_c",
  "option_c_hi",
  "option_d",
  "option_d_hi",
  "correct_option_id"
] as const;

const CATEGORIES: Category[] = ["easy", "medium", "hard", "difficult", "expert"];
const QUESTION_TYPES: QuestionType[] = ["mcq", "image_puzzle", "fill_blank"];
const OPTION_IDS = ["a", "b", "c", "d"] as const;
const bulkImportApiKey = process.env.BULK_IMPORT_API_KEY;

const normalizeValue = (value: string | undefined) => (value ?? "").trim();

const emptyToNull = (value: string | undefined) => {
  const normalized = normalizeValue(value);
  return normalized.length > 0 ? normalized : null;
};

const parseBoolean = (value: string | undefined) => {
  const normalized = normalizeValue(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const parseCsv = (content: string) => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => normalizeValue(cell).length > 0));
};

const validateHeaders = (headers: string[]) => {
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required CSV headers: ${missingHeaders.join(", ")}`);
  }
};

const validateDate = (value: string, rowNumber: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Row ${rowNumber}: game_date must be in YYYY-MM-DD format.`);
  }
};

const buildPayload = (row: CsvRow, rowNumber: number) => {
  const gameDate = normalizeValue(row.game_date);
  const category = normalizeValue(row.category).toLowerCase() as Category;
  const questionType = normalizeValue(row.question_type).toLowerCase() as QuestionType;
  const prompt = normalizeValue(row.prompt);
  const showTrivia = parseBoolean(row.show_trivia);
  const correctOptionId = normalizeValue(row.correct_option_id).toLowerCase();

  if (!gameDate || !prompt) {
    throw new Error(`Row ${rowNumber}: game_date and prompt are required.`);
  }

  validateDate(gameDate, rowNumber);

  if (!CATEGORIES.includes(category)) {
    throw new Error(`Row ${rowNumber}: invalid category "${row.category}".`);
  }

  if (!QUESTION_TYPES.includes(questionType)) {
    throw new Error(`Row ${rowNumber}: invalid question_type "${row.question_type}".`);
  }

  if (questionType === "mcq") {
    const optionValues = [row.option_a, row.option_b, row.option_c, row.option_d].map(normalizeValue);
    if (optionValues.some((value) => value.length === 0)) {
      throw new Error(`Row ${rowNumber}: MCQ rows require option_a through option_d.`);
    }

    if (!OPTION_IDS.includes(correctOptionId as (typeof OPTION_IDS)[number])) {
      throw new Error(`Row ${rowNumber}: MCQ rows require correct_option_id to be one of a, b, c, d.`);
    }
  }

  if (questionType === "fill_blank" && !normalizeValue(row.answer_text) && !normalizeValue(row.answer_text_hi)) {
    throw new Error(`Row ${rowNumber}: fill_blank rows require answer_text or answer_text_hi.`);
  }

  if (questionType === "image_puzzle" && !normalizeValue(row.image_url)) {
    throw new Error(`Row ${rowNumber}: image_puzzle rows require image_url.`);
  }

  if (
    showTrivia &&
    !normalizeValue(row.trivia_text) &&
    !normalizeValue(row.trivia_text_hi) &&
    !normalizeValue(row.trivia_image_url)
  ) {
    throw new Error(`Row ${rowNumber}: show_trivia is true but no trivia text/image was provided.`);
  }

  return {
    id: emptyToNull(row.id),
    game_date: gameDate,
    category,
    question_type: questionType,
    prompt,
    prompt_hi: emptyToNull(row.prompt_hi),
    show_trivia: showTrivia,
    trivia_text: showTrivia ? emptyToNull(row.trivia_text) : null,
    trivia_text_hi: showTrivia ? emptyToNull(row.trivia_text_hi) : null,
    trivia_image_url: showTrivia ? emptyToNull(row.trivia_image_url) : null,
    image_url: questionType === "image_puzzle" ? emptyToNull(row.image_url) : null,
    answer_text: questionType === "fill_blank" ? emptyToNull(row.answer_text) : null,
    answer_text_hi: questionType === "fill_blank" ? emptyToNull(row.answer_text_hi) : null,
    option_a: questionType === "mcq" ? emptyToNull(row.option_a) : null,
    option_a_hi: questionType === "mcq" ? emptyToNull(row.option_a_hi) : null,
    option_b: questionType === "mcq" ? emptyToNull(row.option_b) : null,
    option_b_hi: questionType === "mcq" ? emptyToNull(row.option_b_hi) : null,
    option_c: questionType === "mcq" ? emptyToNull(row.option_c) : null,
    option_c_hi: questionType === "mcq" ? emptyToNull(row.option_c_hi) : null,
    option_d: questionType === "mcq" ? emptyToNull(row.option_d) : null,
    option_d_hi: questionType === "mcq" ? emptyToNull(row.option_d_hi) : null,
    correct_option_id: questionType === "mcq" ? correctOptionId : "a"
  };
};

const buildRowMap = (headers: string[], values: string[]): CsvRow =>
  headers.reduce<CsvRow>((accumulator, header, index) => {
    accumulator[header] = values[index] ?? "";
    return accumulator;
  }, {});

export async function POST(request: Request) {
  try {
    if (!bulkImportApiKey) {
      return NextResponse.json({ error: "BULK_IMPORT_API_KEY is not configured." }, { status: 500 });
    }

    const providedApiKey = request.headers.get("x-bulk-api-key");
    if (providedApiKey !== bulkImportApiKey) {
      return NextResponse.json({ error: "Unauthorized bulk import request." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing CSV file in field 'file'." }, { status: 400 });
    }

    const csvContent = await file.text();
    const parsedRows = parseCsv(csvContent);

    if (parsedRows.length < 2) {
      return NextResponse.json({ error: "CSV must include a header row and at least one data row." }, { status: 400 });
    }

    const headers = parsedRows[0].map((header) => normalizeValue(header));
    validateHeaders(headers);

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let index = 1; index < parsedRows.length; index += 1) {
      const rowNumber = index + 1;

      try {
        const row = buildRowMap(headers, parsedRows[index]);
        const payload = buildPayload(row, rowNumber);

        let existingId = payload.id;

        if (!existingId) {
          const { data: existingRow, error: lookupError } = await supabaseAdmin
            .from("questions")
            .select("id")
            .eq("game_date", payload.game_date)
            .eq("category", payload.category)
            .eq("question_type", payload.question_type)
            .eq("prompt", payload.prompt)
            .maybeSingle();

          if (lookupError) {
            throw lookupError;
          }

          existingId = existingRow?.id ?? null;
        }

        if (existingId) {
          const updatePayload = {
            game_date: payload.game_date,
            category: payload.category,
            question_type: payload.question_type,
            prompt: payload.prompt,
            prompt_hi: payload.prompt_hi,
            show_trivia: payload.show_trivia,
            trivia_text: payload.trivia_text,
            trivia_text_hi: payload.trivia_text_hi,
            trivia_image_url: payload.trivia_image_url,
            image_url: payload.image_url,
            answer_text: payload.answer_text,
            answer_text_hi: payload.answer_text_hi,
            option_a: payload.option_a,
            option_a_hi: payload.option_a_hi,
            option_b: payload.option_b,
            option_b_hi: payload.option_b_hi,
            option_c: payload.option_c,
            option_c_hi: payload.option_c_hi,
            option_d: payload.option_d,
            option_d_hi: payload.option_d_hi,
            correct_option_id: payload.correct_option_id
          };

          const { error: updateError } = await supabaseAdmin
            .from("questions")
            .update(updatePayload)
            .eq("id", existingId);

          if (updateError) {
            throw updateError;
          }

          updated += 1;
        } else {
          const { error: insertError } = await supabaseAdmin.from("questions").insert({
            ...payload,
            id: crypto.randomUUID()
          });

          if (insertError) {
            throw insertError;
          }

          inserted += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown import error.";
        errors.push(message);
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      inserted,
      updated,
      failed: errors.length,
      errors
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
