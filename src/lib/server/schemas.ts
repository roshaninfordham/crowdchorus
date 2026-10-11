import { z } from "zod";
import { MOODS } from "@/lib/music";
import { cleanText } from "@/lib/sanitize";
import { JOIN_CODE_RE } from "./tokens";

// Caps mirror the CHECK constraints in db/migrations/001_core.sql.
export const NICKNAME_MAX = 24;
export const THEME_MAX = 40;

const nickname = z
  .string()
  .transform((s) => cleanText(s, NICKNAME_MAX))
  .pipe(z.string().min(1, "Pick a nickname."));

const theme = z
  .string()
  .max(200)
  .nullish()
  .transform((s) => (s ? cleanText(s, THEME_MAX) || null : null));

/** Body for both room creation (host) and joining. */
export const participantBody = z.object({
  nickname,
  mood: z.enum(MOODS, "Pick one of the moods."),
  theme,
});

export const joinCode = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(JOIN_CODE_RE));

export const uuid = z.uuid();
