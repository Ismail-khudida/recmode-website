import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { analyzeDocument, ALLOWED_MIME_TYPES } from "@/lib/ai";

export const runtime = "nodejs";
// KI-Analyse kann einige Sekunden dauern.
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "documents";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Ungültige Anfrage." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Bitte eine Datei auswählen." },
      { status: 400 },
    );
  }

  const mimeType = file.type;
  if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return NextResponse.json(
      { error: "Nur PDF, JPG oder PNG werden unterstützt." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Die Datei ist zu groß (max. 10 MB)." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 1. Datei in den Storage legen (Pfad beginnt mit der user_id für RLS).
  const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1];
  const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const service = createServiceClient();
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: "Die Datei konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }

  // 2. KI-Analyse durchführen.
  let analysis;
  try {
    analysis = await analyzeDocument({ data: buffer, mimeType });
  } catch (err) {
    console.error("Analyse fehlgeschlagen:", err);
    // Dokument trotzdem speichern, damit die Datei nicht verloren geht.
    const { data: inserted } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_url: storagePath,
        file_type: mimeType,
      })
      .select("id")
      .single();

    return NextResponse.json(
      {
        error:
          "Die Datei wurde gespeichert, aber die Analyse ist fehlgeschlagen. Bitte versuche es später erneut.",
        documentId: inserted?.id ?? null,
      },
      { status: 502 },
    );
  }

  // 3. Dokument samt Analyse speichern.
  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      file_name: file.name,
      file_url: storagePath,
      file_type: mimeType,
      extracted_text: analysis.extracted_text ?? null,
      analysis_json: analysis,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "Das Dokument konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }

  return NextResponse.json({ documentId: inserted.id });
}
