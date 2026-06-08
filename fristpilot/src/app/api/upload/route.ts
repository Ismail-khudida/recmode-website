import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeDocument } from "@/lib/ai";
import { detectFileType, isAllowedOrigin } from "@/lib/upload";

export const runtime = "nodejs";
// KI-Analyse kann einige Sekunden dauern.
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "documents";

export async function POST(request: Request) {
  // 1. CSRF-Schutz: nur Anfragen von der eigenen App-Domain zulassen.
  //    Vor jeder Storage-/Claude-Aktion und vor dem Lesen des Bodys.
  if (!isAllowedOrigin(request)) {
    return NextResponse.json(
      { error: "Zugriff verweigert." },
      { status: 403 },
    );
  }

  // 2. Authentifizierung (session-gebundener Client, RLS aktiv).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // 3. Multipart-Body lesen.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Bitte eine Datei auswählen." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Die Datei ist zu groß (max. 10 MB)." },
      { status: 400 },
    );
  }

  // 4. Echten Dateityp anhand der Magic Bytes bestimmen (nicht file.type).
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectFileType(buffer);
  if (!detected) {
    return NextResponse.json(
      { error: "Nur echte PDF-, JPG- oder PNG-Dateien werden unterstützt." },
      { status: 400 },
    );
  }

  // 5. Dokumentzeile zuerst anlegen (status='processing'), damit eine spätere
  //    Datei stets durch eine Eigentümer-Zeile referenziert wird.
  const { data: created, error: createError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      file_name: file.name,
      file_type: detected.mime,
      status: "processing",
    })
    .select("id")
    .single();

  if (createError || !created) {
    return NextResponse.json(
      { error: "Das Dokument konnte nicht angelegt werden." },
      { status: 500 },
    );
  }

  const documentId = created.id as string;
  const storagePath = `${user.id}/${documentId}.${detected.ext}`;

  // Hilfsfunktionen für saubere Fehlerpfade.
  const cleanupStorage = async () => {
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (error) {
      console.error("Storage-Cleanup fehlgeschlagen:", error);
    }
  };
  const markFailed = async (message: string) => {
    const { error } = await supabase
      .from("documents")
      .update({ status: "failed", analysis_error: message, file_url: null })
      .eq("id", documentId)
      .eq("user_id", user.id);
    if (error) {
      console.error("Status 'failed' konnte nicht gesetzt werden:", error);
    }
  };

  // 6. Datei in den Storage legen (session-gebundener Client, RLS schützt
  //    den user_id/...-Ordner).
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: detected.mime,
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload fehlgeschlagen:", uploadError);
    await markFailed("Die Datei konnte nicht gespeichert werden.");
    return NextResponse.json(
      { error: "Die Datei konnte nicht gespeichert werden.", documentId },
      { status: 500 },
    );
  }

  // 7. Analyse durchführen. Jeder Fehler nach dem Upload räumt die Datei
  //    wieder ab und markiert das Dokument als fehlgeschlagen.
  try {
    const analysis = await analyzeDocument({
      data: buffer,
      mimeType: detected.mime,
    });

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        file_url: storagePath,
        extracted_text: analysis.extracted_text ?? null,
        analysis_json: analysis,
        status: "done",
        analysis_error: null,
      })
      .eq("id", documentId)
      .eq("user_id", user.id);

    if (updateError) {
      // Analyse war erfolgreich, ließ sich aber nicht speichern -> aufräumen.
      console.error("Speichern der Analyse fehlgeschlagen:", updateError);
      await cleanupStorage();
      await markFailed("Die Analyse konnte nicht gespeichert werden.");
      return NextResponse.json(
        { error: "Die Analyse konnte nicht gespeichert werden.", documentId },
        { status: 500 },
      );
    }

    return NextResponse.json({ documentId });
  } catch (err) {
    // Claude-, Parsing-/Validierungs- oder sonstige unerwartete Fehler.
    console.error("Analyse fehlgeschlagen:", err);
    await cleanupStorage();
    await markFailed(
      "Die automatische Analyse ist fehlgeschlagen. Bitte versuche es später erneut.",
    );
    return NextResponse.json(
      {
        error:
          "Die Analyse ist fehlgeschlagen. Das Dokument wurde als fehlgeschlagen markiert.",
        documentId,
      },
      { status: 502 },
    );
  }
}
