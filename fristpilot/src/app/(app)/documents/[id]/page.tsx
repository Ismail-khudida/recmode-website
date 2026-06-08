import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import { RiskBadge } from "@/components/RiskBadge";
import { CreateReminderButton } from "@/components/CreateReminderButton";
import { formatDate, formatDateTime, dueLabel } from "@/lib/format";
import type { DocumentRow } from "@/lib/types";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();
  const doc = data as DocumentRow;
  const analysis = doc.analysis_json;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-navy underline">
          ← Zurück zum Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{doc.file_name}</h1>
        <p className="mt-1 text-xs text-ink-soft">
          Hochgeladen am {formatDateTime(doc.created_at)}
        </p>
      </div>

      {!analysis ? (
        <div className="card">
          <p className="text-sm text-ink-soft">
            Für dieses Dokument liegt noch keine Analyse vor. Möglicherweise ist
            die automatische Auswertung fehlgeschlagen. Bitte lade das Dokument
            erneut hoch.
          </p>
        </div>
      ) : (
        <>
          {/* Übersicht */}
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-navy/10 px-3 py-1 text-xs font-medium text-navy">
                  {analysis.document_type}
                </span>
                <RiskBadge risk={analysis.risk_level} />
              </div>
              <span className="text-xs text-ink-soft">
                Sicherheit der Analyse: {Math.round((analysis.confidence ?? 0) * 100)}%
              </span>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-ink-soft">Absender</h2>
              <p className="text-ink">{analysis.sender || "Unbekannt"}</p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-ink-soft">
                Einfache Zusammenfassung
              </h2>
              <p className="leading-relaxed text-ink">
                {analysis.summary_simple || "Keine Zusammenfassung verfügbar."}
              </p>
            </div>
          </div>

          {/* Erkannte Fristen */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">
              Erkannte Fristen
            </h2>
            {analysis.deadlines.length === 0 ? (
              <div className="card">
                <p className="text-sm text-ink-soft">
                  In diesem Dokument wurde keine konkrete Frist erkannt. Bitte
                  prüfe das Dokument trotzdem selbst.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {analysis.deadlines.map((deadline, i) => (
                  <div key={i} className="card space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-base font-semibold text-ink">
                        {formatDate(deadline.date)}
                      </p>
                      {deadline.date && (
                        <span className="text-xs font-medium text-accent">
                          {dueLabel(deadline.date)}
                        </span>
                      )}
                    </div>
                    {deadline.description && (
                      <p className="text-sm text-ink">{deadline.description}</p>
                    )}
                    {deadline.required_action && (
                      <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-soft">
                        <span className="font-medium text-ink">Zu tun: </span>
                        {deadline.required_action}
                      </p>
                    )}
                    <CreateReminderButton
                      documentId={doc.id}
                      defaultTitle={
                        deadline.required_action ||
                        deadline.description ||
                        `Frist: ${doc.file_name}`
                      }
                      defaultDescription={deadline.description}
                      defaultDueDate={deadline.date}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Empfohlene Aktionen */}
          {analysis.recommended_actions.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-ink">
                Empfohlene nächste Schritte
              </h2>
              <ul className="card space-y-2">
                {analysis.recommended_actions.map((action, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink">
                    <span className="text-navy">•</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Disclaimer />
    </div>
  );
}
