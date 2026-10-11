"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { CopyButton } from "@/components/CopyButton";

/** Share link + QR, simulated participants, finalize. Host token required server-side. */
export function HostPanel({
  code,
  shareUrl,
  qrSvg,
  submittedCount,
}: {
  code: string;
  shareUrl: string;
  qrSvg: string;
  submittedCount: number;
}) {
  const [busy, setBusy] = useState<"sim" | "final" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "sim" | "final") {
    setBusy(kind);
    setError(null);
    try {
      await api(`/api/rooms/${code}/${kind === "sim" ? "simulate" : "finalize"}`, { method: "POST", code });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-5 border-accent/30" aria-labelledby="host-h">
      <h2 id="host-h" className="text-lg font-semibold">
        Host controls
      </h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="w-36 shrink-0 overflow-hidden rounded-xl bg-white p-2"
          role="img"
          aria-label={`QR code for ${shareUrl}`}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted">Share this link or code:</p>
          <p className="font-mono text-3xl tracking-[0.3em]">{code}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="truncate rounded-md bg-ink/70 px-2 py-1 text-xs">{shareUrl}</code>
            <CopyButton text={shareUrl} label="Copy link" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-ghost" onClick={() => act("sim")} disabled={busy !== null}>
          {busy === "sim" ? "Adding…" : "+ Add simulated participant"}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => act("final")}
          disabled={submittedCount < 1 || busy === "final"}
        >
          {busy === "final" ? "Closing the round…" : "Finalize and generate"}
        </button>
      </div>
      {submittedCount < 1 && <p className="text-xs text-muted">Finalize unlocks after the first submitted recording.</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
