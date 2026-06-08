import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase-Client für Server Components, Server Actions und Route Handler.
// Liest/schreibt die Session über Cookies.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` aus einer Server Component heraus aufgerufen – kann
            // ignoriert werden, wenn die Middleware die Session aktualisiert.
          }
        },
      },
    },
  );
}

// Service-Role-Client (serverseitig, umgeht RLS). Nur für Storage-Uploads
// und andere vertrauenswürdige Serveroperationen verwenden.
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // keine Cookies im Service-Client
        },
      },
    },
  );
}
