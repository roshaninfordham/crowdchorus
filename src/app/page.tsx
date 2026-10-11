import { LandingActions } from "@/components/LandingActions";
import { MUSIC } from "@/lib/music";

export default function Home() {
  return (
    <div className="space-y-12 pt-6 sm:pt-12">
      <section className="max-w-3xl">
        <p className="mb-4 text-sm font-medium tracking-widest text-accent uppercase">A collaborative song in minutes</p>
        <h1 className="font-display text-5xl leading-[1.02] sm:text-7xl">
          One room. Many voices. <em className="text-accent-2">One original song.</em>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Gather your group in a browser room, no accounts or installs. Everyone hears the same short line and pitch
          guide, sings for {MUSIC.record_seconds} seconds, and the host closes the round. CrowdChorus writes an
          original instrumental and album cover for the room, then mixes everyone&apos;s real voices into one track
          you can play, download and share.
        </p>
        <ol className="mt-6 flex flex-wrap gap-2 text-sm text-muted" aria-label="How it works">
          {["Join with a nickname", "Sing the shown line", "Host finalizes", "Hear your single"].map((s, i) => (
            <li key={s} className="rounded-full border border-line bg-panel/60 px-3 py-1">
              <span className="mr-1.5 font-mono text-accent">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
      <LandingActions />
      <p className="text-xs text-muted">
        Your microphone is used only while you record. Clips are private, mixed into the room&apos;s song, and deleted
        after a short retention window. Please sing original material or the shown line.
      </p>
    </div>
  );
}
