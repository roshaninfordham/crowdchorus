"use client";
import { useRef, useState } from "react";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Player({ src, title, downloadName }: { src: string; title: string; downloadName: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  return (
    <div className="rounded-2xl border border-line bg-ink/60 p-4">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="btn-primary size-14 rounded-full p-0 text-xl"
          onClick={() => (playing ? ref.current?.pause() : void ref.current?.play())}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        >
          <span aria-hidden>{playing ? "❚❚" : "▶"}</span>
        </button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={(e) => {
              if (ref.current) ref.current.currentTime = Number(e.target.value);
            }}
            className="w-full accent-accent"
            aria-label="Seek"
          />
          <p className="mt-1 font-mono text-xs text-muted">
            {fmt(time)} / {duration ? fmt(duration) : "--:--"}
          </p>
        </div>
        <a href={src} download={downloadName} className="btn-ghost">
          Download
        </a>
      </div>
    </div>
  );
}
