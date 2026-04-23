import fs from "node:fs";
import path from "node:path";

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
];

const CATEGORIES = ["easy", "medium", "hard", "difficult", "expert"];
const QUESTION_TYPES = ["mcq", "image_puzzle", "fill_blank"];
const OPTION_IDS = ["a", "b", "c", "d"];

const normalizeValue = (value) => (value ?? "").trim();

const parseBoolean = (value) => {
  const normalized = normalizeValue(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const parseCsv = (content) => {
  const rows = [];
  let currentRow = [];
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

const buildRowMap = (headers, values) =>
  headers.reduce((accumulator, header, index) => {
    accumulator[header] = values[index] ?? "";
    return accumulator;
  }, {});

const pushIssue = (collection, rowNumber, message) => {
  collection.push(`Row ${rowNumber}: ${message}`);
};

const validateRow = (row, rowNumber, errors, warnings) => {
  const gameDate = normalizeValue(row.game_date);
  const category = normalizeValue(row.category).toLowerCase();
  const questionType = normalizeValue(row.question_type).toLowerCase();
  const prompt = normalizeValue(row.prompt);
  const promptHi = normalizeValue(row.prompt_hi);
  const showTrivia = parseBoolean(row.show_trivia);
  const correctOptionId = normalizeValue(row.correct_option_id).toLowerCase();
  const imageUrl = normalizeValue(row.image_url);
  const answerText = normalizeValue(row.answer_text);
  const answerTextHi = normalizeValue(row.answer_text_hi);
  const triviaText = normalizeValue(row.trivia_text);
  const triviaTextHi = normalizeValue(row.trivia_text_hi);
  const triviaImageUrl = normalizeValue(row.trivia_image_url);

  if (!gameDate || !prompt) {
    pushIssue(errors, rowNumber, "game_date and prompt are required.");
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
    pushIssue(errors, rowNumber, "game_date must be in YYYY-MM-DD format.");
  }

  if (!CATEGORIES.includes(category)) {
    pushIssue(errors, rowNumber, `invalid category "${row.category}".`);
  }

  if (!QUESTION_TYPES.includes(questionType)) {
    pushIssue(errors, rowNumber, `invalid question_type "${row.question_type}".`);
  }

  if (questionType === "mcq") {
    const optionValues = ["option_a", "option_b", "option_c", "option_d"].map((key) => normalizeValue(row[key]));
    if (optionValues.some((value) => value.length === 0)) {
      pushIssue(errors, rowNumber, "MCQ rows require option_a through option_d.");
    }

    if (!OPTION_IDS.includes(correctOptionId)) {
      pushIssue(errors, rowNumber, "MCQ rows require correct_option_id to be one of a, b, c, d.");
    }

    if (answerText || answerTextHi) {
      pushIssue(warnings, rowNumber, "MCQ rows should leave answer_text and answer_text_hi blank.");
    }

    if (imageUrl) {
      pushIssue(warnings, rowNumber, "MCQ rows should leave image_url blank.");
    }

    if (new Set(optionValues.map((value) => value.toLowerCase())).size !== optionValues.length) {
      pushIssue(warnings, rowNumber, "MCQ row has duplicate option labels.");
    }
  }

  if (questionType === "fill_blank") {
    if (!answerText && !answerTextHi) {
      pushIssue(errors, rowNumber, "fill_blank rows require answer_text or answer_text_hi.");
    }

    const optionFieldNames = [
      "option_a",
      "option_a_hi",
      "option_b",
      "option_b_hi",
      "option_c",
      "option_c_hi",
      "option_d",
      "option_d_hi"
    ];

    if (optionFieldNames.some((field) => normalizeValue(row[field]).length > 0)) {
      pushIssue(warnings, rowNumber, "fill_blank rows should leave all option_* fields blank.");
    }

    if (imageUrl) {
      pushIssue(warnings, rowNumber, "fill_blank rows should leave image_url blank.");
    }
  }

  if (questionType === "image_puzzle") {
    if (!imageUrl) {
      pushIssue(errors, rowNumber, "image_puzzle rows require image_url.");
    }

    const optionFieldNames = [
      "option_a",
      "option_a_hi",
      "option_b",
      "option_b_hi",
      "option_c",
      "option_c_hi",
      "option_d",
      "option_d_hi"
    ];

    if (answerText || answerTextHi) {
      pushIssue(warnings, rowNumber, "image_puzzle rows should leave answer_text and answer_text_hi blank.");
    }

    if (optionFieldNames.some((field) => normalizeValue(row[field]).length > 0)) {
      pushIssue(warnings, rowNumber, "image_puzzle rows should leave all option_* fields blank.");
    }
  }

  if (showTrivia && !triviaText && !triviaTextHi && !triviaImageUrl) {
    pushIssue(errors, rowNumber, "show_trivia is true but no trivia text/image was provided.");
  }

  if (!showTrivia && (triviaText || triviaTextHi || triviaImageUrl)) {
    pushIssue(warnings, rowNumber, "trivia fields are filled but show_trivia is false.");
  }

  if (!promptHi) {
    pushIssue(warnings, rowNumber, "prompt_hi is blank.");
  }

  if (normalizeValue(row.id) && !/^[0-9a-fA-F-]{36}$/.test(normalizeValue(row.id))) {
    pushIssue(warnings, rowNumber, "id is filled but does not look like a UUID. New rows should keep id blank.");
  }
};

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node scripts/validate-bulk-csv.mjs <path-to-csv>");
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), filePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`CSV file not found: ${resolvedPath}`);
  process.exit(1);
}

const csvContent = fs.readFileSync(resolvedPath, "utf8");
const parsedRows = parseCsv(csvContent);

if (parsedRows.length < 2) {
  console.error("CSV must include a header row and at least one data row.");
  process.exit(1);
}

const headers = parsedRows[0].map((header) => normalizeValue(header));
const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

if (missingHeaders.length > 0) {
  console.error(`Missing required CSV headers: ${missingHeaders.join(", ")}`);
  process.exit(1);
}

const errors = [];
const warnings = [];
const duplicateRows = [];
const seenImportKeys = new Map();
const perDateCategoryCount = new Map();

for (let index = 1; index < parsedRows.length; index += 1) {
  const rowNumber = index + 1;
  const row = buildRowMap(headers, parsedRows[index]);
  validateRow(row, rowNumber, errors, warnings);

  const key = [
    normalizeValue(row.game_date),
    normalizeValue(row.category).toLowerCase(),
    normalizeValue(row.question_type).toLowerCase(),
    normalizeValue(row.prompt)
  ].join("||");

  if (seenImportKeys.has(key)) {
    duplicateRows.push(
      `Row ${rowNumber}: duplicate import key with row ${seenImportKeys.get(key)} (${normalizeValue(row.game_date)} | ${normalizeValue(
        row.category
      )} | ${normalizeValue(row.question_type)} | ${normalizeValue(row.prompt)})`
    );
  } else {
    seenImportKeys.set(key, rowNumber);
  }

  const date = normalizeValue(row.game_date);
  const category = normalizeValue(row.category).toLowerCase();
  if (date && CATEGORIES.includes(category)) {
    const current = perDateCategoryCount.get(date) ?? {
      easy: 0,
      medium: 0,
      hard: 0,
      difficult: 0,
      expert: 0
    };
    current[category] += 1;
    perDateCategoryCount.set(date, current);
  }
}

if (duplicateRows.length > 0) {
  errors.push(...duplicateRows);
}

for (const [date, counts] of perDateCategoryCount.entries()) {
  for (const category of CATEGORIES) {
    if (counts[category] === 0) {
      warnings.push(`Date ${date}: no questions found for category ${category}.`);
    }
  }

  const categoriesWithEnoughQuestions = CATEGORIES.filter((category) => counts[category] >= 2);
  if (categoriesWithEnoughQuestions.length < CATEGORIES.length) {
    warnings.push(`Date ${date}: fewer than 2 questions in one or more categories, which may not fully support the 10-question daily flow.`);
  }
}

console.log(`File: ${resolvedPath}`);
console.log(`Rows checked: ${parsedRows.length - 1}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);

if (errors.length > 0) {
  console.log("\nErrors:");
  for (const error of errors) {
    console.log(`- ${error}`);
  }
}

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length === 0) {
  console.log("\nValidation passed.");
  process.exit(0);
}

console.log("\nValidation failed.");
process.exit(1);
