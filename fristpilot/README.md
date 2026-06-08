# FristPilot

FristPilot ist eine Web-App, die deutschsprachigen Nutzern hilft, wichtige
Fristen aus Dokumenten zu erkennen. Ein Dokument (PDF, JPG oder PNG) wird
hochgeladen, von einer KI ausgewertet und in einfacher Sprache erklärt –
inklusive erkannter Fristen, empfohlener nächster Schritte und speicherbarer
Erinnerungen.

> **Hinweis:** Die App liefert keine Rechtsberatung. Jede Analyse kann Fehler
> enthalten und sollte vom Nutzer selbst geprüft werden.

## Tech-Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS**
- **Supabase** – Auth, PostgreSQL, Storage
- **Anthropic Claude** (`claude-opus-4-8`) – serverseitige Dokumentanalyse

Dokumente werden direkt an Claude übergeben: PDFs als Dokument-Block, Bilder als
Bild-Block. Damit übernimmt das Modell Texterkennung (OCR) und Analyse in einem
Schritt – ein separates OCR-Tool ist nicht nötig.

## Setup

### 1. Abhängigkeiten installieren

```bash
cd fristpilot
npm install
```

### 2. Supabase-Projekt einrichten

1. Auf [supabase.com](https://supabase.com) ein Projekt erstellen.
2. Im **SQL Editor** das Skript `supabase/schema.sql` ausführen. Es legt die
   Tabellen `documents` und `reminders`, die Row-Level-Security-Policies und den
   Storage-Bucket `documents` an. Das Skript ist idempotent; für eine bereits
   bestehende Datenbank genügt erneutes Ausführen (oder die Migrationen in
   `supabase/migrations/`).
3. Unter **Settings → API** die Projekt-URL und die Keys kopieren.
4. Optional unter **Authentication → Providers → Email** einstellen, ob eine
   E-Mail-Bestätigung erforderlich ist (für lokale Tests kann sie deaktiviert
   werden).

### 3. Umgebungsvariablen

`.env.example` nach `.env.local` kopieren und ausfüllen:

```bash
cp .env.example .env.local
```

| Variable | Beschreibung |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Projekt-URL aus Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/Public Key |
| `SUPABASE_STORAGE_BUCKET` | Bucket-Name (Standard: `documents`) |
| `APP_ORIGIN` | Eigene App-Domain für den CSRF-Schutz (lokal `http://localhost:3000`) |
| `ANTHROPIC_API_KEY` | API-Key von Anthropic |
| `ANTHROPIC_MODEL` | optional, Standard `claude-opus-4-8` |

> Ein Service-Role-Key wird nicht mehr benötigt: Upload und Löschen laufen über
> den session-gebundenen Client, abgesichert durch RLS- und Storage-Policies.

### 4. Entwicklungsserver starten

```bash
npm run dev
```

Die App ist unter `http://localhost:3000` erreichbar.

## Hauptablauf

1. Registrieren oder anmelden (`/register`, `/login`).
2. Dashboard öffnen (`/dashboard`).
3. Dokument hochladen (`/upload`) – die Datei wird gespeichert und analysiert.
4. Ergebnisansicht (`/documents/[id]`): Dokumenttyp, Absender, Zusammenfassung,
   **mögliche** Fristen, empfohlene Schritte und Wichtigkeit. Jede mögliche
   Frist ist nachvollziehbar – mit Confidence, der zugrunde liegenden
   Textstelle (Evidence) und – falls bestimmbar – der Seitennummer.
5. Aus einer Frist eine Erinnerung erstellen.
6. Erinnerungen verwalten (`/reminders`) und im Dashboard im Blick behalten.
7. Dokumente bei Bedarf vollständig löschen (Datei im Storage, Datenbankeintrag,
   Analyse und verknüpfte Erinnerungen).

## Vertrauen & Datenschutz

- Fristen werden konsequent als **mögliche** Fristen formuliert – keine
  Rechtsberatung, keine vorgetäuschte Sicherheit.
- `<LegalDisclaimer />` (Haftung) und `<PrivacyNotice />` (KI-Hinweis)
  erscheinen überall dort, wo Analyseergebnisse angezeigt werden.
- Das Analyse-JSON wird serverseitig mit einem **Zod-Schema** validiert; bei
  fehlerhaften KI-Antworten greift ein sicherer Fallback (`src/lib/analysis-schema.ts`).
- Der Claude-Modellname kommt ausschließlich aus `ANTHROPIC_MODEL`
  (Fallback: `claude-opus-4-8`).

## Projektstruktur

```
fristpilot/
├── supabase/schema.sql        # Datenbank-Schema, RLS, Storage-Bucket
├── middleware.ts              # Session-Refresh + Routenschutz
└── src/
    ├── app/
    │   ├── login, register/   # Authentifizierung
    │   ├── auth/actions.ts     # Login/Register/Logout (Server Actions)
    │   ├── api/upload/         # Upload + Analyse (Route Handler)
    │   └── (app)/              # Geschützte Bereiche
    │       ├── dashboard/
    │       ├── upload/
    │       ├── documents/[id]/
    │       └── reminders/      # Liste + Server Actions
    ├── components/             # UI-Bausteine
    └── lib/
        ├── ai.ts               # Claude-Analyse
        ├── supabase/           # Client-/Server-/Middleware-Helfer
        ├── format.ts           # Datums-/Risiko-Formatierung
        └── types.ts
```

## Nicht im MVP enthalten

Kalenderintegration, Familienmodus, Vertragskündigung, Bankanbindung,
Gesundheitsdaten, Mobile App, Push Notifications, komplexe Rollen, Chatbot.
