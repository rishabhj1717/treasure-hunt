# Treasure Hunt (Next.js + Supabase)

Front-end treasure hunt game with:
- Registration using `name` + `number`
- Language selection at signup (`English` or `Hindi`)
- Daily question sets (different questions per date)
- 5 fixed categories in order: `Easy -> Medium -> Hard -> Difficult -> Expert`
- Random question pick per category (from that day’s pool)
- Supports two question types: `mcq` and `image_puzzle`
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
  - `id`, `game_date`, `category`, `question_type`, `image_url`, `prompt`, `prompt_hi`, `option_a`, `option_a_hi`, `option_b`, `option_b_hi`, `option_c`, `option_c_hi`, `option_d`, `option_d_hi`, `correct_option_id`, `created_at`
- `attempts`
  - `id`, `player_id`, `game_date`, `category`, `question_id`, `question_prompt`, `selected_option_id`, `selected_option_label`, `correct`, `time_taken_seconds`, `submitted_at`

## 3. Admin page

- URL: `/admin`
- Credentials: `admin` / `admin`
- Add question for a specific `game_date` and `category`
- Choose question type:
  - `MCQ`: provide 4 options + correct option
  - `Image Puzzle`: upload an image file
- English fields are primary; Hindi fields are optional and fall back to English if omitted
- For image uploads, create a public Supabase Storage bucket named `question-images`.
- Ensure storage policies allow `anon` upload/read for `question-images`.

## 4. Game flow

1. Player registers.
2. App loads today’s question set.
3. One random question is selected for each category and persisted for that player/day.
4. Player advances only after a correct answer.
5. On correct `Expert` answer, player is redirected to `/leaderboard`.
6. On date change, player daily progress and score are reset automatically.
7. Reopening the app resumes the same player session from local storage unless user starts a new player.

## 5. Deploy on Vercel

1. Push to GitHub.
2. Import repo in Vercel.
3. Add env vars in Vercel.
4. Deploy.

## 6. Notes

- App is fully front-end; no custom backend API routes.
- Admin auth is client-side only and basic by design.
- RLS policies are permissive for demo use; tighten before production.
