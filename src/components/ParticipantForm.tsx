"use client";
import { useId, useState } from "react";
import { MOODS } from "@/lib/music";

export type ParticipantInput = { nickname: string; mood: string; theme: string };

/** Nickname + one mood + optional theme. Used to create a room and to join one. */
export function ParticipantForm({
  submitLabel,
  onSubmit,
}: {
  submitLabel: string;
  onSubmit: (input: ParticipantInput) => Promise<void>;
}) {
  const id = useId();
  const [mood, setMood] = useState<string>(MOODS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ nickname: String(form.get("nickname")), mood, theme: String(form.get("theme") ?? "") });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-5">
      <div>
        <label htmlFor={`${id}-nick`} className="label">
          Your nickname
        </label>
        <input
          id={`${id}-nick`}
          name="nickname"
          className="field"
          required
          maxLength={24}
          autoComplete="nickname"
          placeholder="e.g. Sam"
        />
      </div>
      <fieldset>
        <legend className="label">Pick one mood</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MOODS.map((m) => (
            <label
              key={m}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-ink/60 px-3 text-sm capitalize transition
                has-checked:border-accent has-checked:bg-accent/15 has-checked:text-fg has-focus-visible:ring-2 has-focus-visible:ring-accent-2"
            >
              <input
                type="radio"
                name="mood"
                value={m}
                checked={mood === m}
                onChange={() => setMood(m)}
                className="sr-only"
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-theme`} className="label">
          Theme idea <span className="font-normal">(optional)</span>
        </label>
        <input
          id={`${id}-theme`}
          name="theme"
          className="field"
          maxLength={40}
          placeholder="e.g. late trains, first snow"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "One moment…" : submitLabel}
      </button>
    </form>
  );
}
