# Jin Gyan (Next.js + Supabase)

Front-end trivia game with:
- Registration using `name` + `number`
- Language selection at signup (`English` or `Hindi`)
- Daily question sets (different questions per date)
- 5 fixed categories in order: `Easy -> Medium -> Hard -> Difficult -> Expert`
- Random question pick per category (from that day’s pool)
- Supports three question types: `mcq`, `image_puzzle`, and `fill_blank`
- Optional answer trivia after submission/solve, controlled per question
- In-game English/Hindi toggle with per-player language preference
- Progression only on correct answer
- Redirect to `/leaderboard` after correct `Expert` answer
- Daily score reset behavior (new date starts a fresh run)
- Device session persistence using stored `playerId` (resume after tab/browser close)
- Admin page at `/admin` (username `admin`, password `admin`) to add day-wise categorized questions

## Tech
- Next.js (App Router)
- React
- Supabase (`@supabase/supabase-js`)

## 1. Setup

```bash
npm install
cp .env.example .env.local
```

Add Supabase values to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BULK_IMPORT_API_KEY=
```

Run locally:

```bash
npm run dev
```

## 2. Supabase schema

Run SQL in Supabase SQL Editor:

- `/Users/rishabh.jain/Documents/personal/treasure-hunt/supabase-schema.sql`

Tables:
- `players`
  - `id`, `name`, `phone`, `preferred_language`, `current_stage_index`, `active_game_date`, `stage_question_ids`, `daily_completed_at`, `daily_total_time_seconds`, `created_at`, `last_login_at`, `completed_at`
- `questions`
  - `id`, `game_date`, `category`, `question_type`, `image_url`, `prompt`, `prompt_hi`, `show_trivia`, `trivia_text`, `trivia_text_hi`, `trivia_image_url`, `answer_text`, `answer_text_hi`, `option_a`, `option_a_hi`, `option_b`, `option_b_hi`, `option_c`, `option_c_hi`, `option_d`, `option_d_hi`, `correct_option_id`, `created_at`
- `attempts`
  - `id`, `player_id`, `game_date`, `category`, `question_id`, `question_prompt`, `selected_option_id`, `selected_option_label`, `correct`, `time_taken_seconds`, `submitted_at`

## 3. Admin page

- URL: `/admin`
- Credentials: `admin` / `admin`
- Add question for a specific `game_date` and `category`
- Bulk import questions from the browser by uploading a CSV file
- Choose question type:
  - `MCQ`: provide 4 options + correct option
  - `Image Puzzle`: upload an image file
  - `Fill In The Blank`: provide a single accepted answer in English and/or Hindi
- English fields are primary; Hindi fields are optional and fall back to English if omitted
- Optional trivia can be enabled per question with text and/or image content.
- For image uploads, create a public Supabase Storage bucket named `question-images`.
- Ensure storage policies allow `anon` upload/read for `question-images`.

## 4. Game flow

1. Player registers.
2. App loads today’s question set.
3. One random question is selected for each category and persisted for that player/day.
4. `MCQ` answers are single-attempt and immediately advance to the next category after submission.
5. `Fill In The Blank` and `Image Puzzle` advance only on correct submission/solve.
6. If enabled for the question, trivia text/image is shown before the next category or leaderboard.
7. On correct `Expert` answer, player is redirected to `/leaderboard`.
8. On date change, player daily progress and score are reset automatically.
9. Reopening the app resumes the same player session from local storage unless user starts a new player.

## 5. Deploy on Vercel

1. Push to GitHub.
2. Import repo in Vercel.
3. Add env vars in Vercel.
4. Deploy.

## 6. Bulk Import API

- Endpoint: `POST /api/bulk-questions`
- Auth header: `x-bulk-api-key: <BULK_IMPORT_API_KEY>`
- Content type: `multipart/form-data`
- File field name: `file`
- Sample CSV: `/Users/rishabh.jain/Documents/personal/treasure-hunt/sample-questions.csv`
- For `image_puzzle` and trivia images, CSV should contain public image URLs in `image_url` and `trivia_image_url`.

Matching behavior:
- If `id` is present, that row updates the existing question with that `id`.
- If `id` is empty, the importer looks for an existing question with the same `game_date`, `category`, `question_type`, and `prompt`.
- If a match is found, that row is updated.
- If no match is found, a new question is inserted.

Example:

```bash
curl -X POST http://localhost:3000/api/bulk-questions \
  -H "x-bulk-api-key: your_bulk_import_api_key" \
  -F "file=@/Users/rishabh.jain/Documents/personal/treasure-hunt/sample-questions.csv"
```

Response shape:

```json
{
  "ok": true,
  "inserted": 3,
  "updated": 0,
  "failed": 0,
  "errors": []
}
```

## 7. Bulk Import Setup

### `BULK_IMPORT_API_KEY`

This is your own secret value for protecting the bulk import endpoint.

Generate any strong random string, for example:

```bash
openssl rand -hex 32
```

Then set that value in:

- `.env.local` as `BULK_IMPORT_API_KEY`
- Vercel project environment variables as `BULK_IMPORT_API_KEY`

Use the same value in the `/admin` bulk import form.

### `SUPABASE_SERVICE_ROLE_KEY`

This comes from the Supabase dashboard and must stay server-side only.

Steps:
1. Open your Supabase project dashboard.
2. Go to `Project Settings`.
3. Open `API Keys`.
4. Copy the `service_role` key from the Legacy API Keys tab, or use a server-side secret key if you have moved to the newer key model.
5. Put that value in:
   - `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`
   - Vercel project environment variables as `SUPABASE_SERVICE_ROLE_KEY`

Never expose `SUPABASE_SERVICE_ROLE_KEY` in the browser.

## 8. Notes

- Gameplay is client-rendered. Bulk import uses a Next.js API route.
- Bulk import uses a server-side route with the Supabase service role key.
- Admin auth is client-side only and basic by design.
- Destructive database operations such as `delete from ...` or `drop table ...` should be run directly in Supabase SQL Editor.
- RLS policies are permissive for demo use; tighten before production.
