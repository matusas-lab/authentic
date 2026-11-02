import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
const rawKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY?.trim() ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
  "";

export const isSupabaseConfigured = rawUrl.length > 0 && rawKey.length > 0;

if (__DEV__ && !isSupabaseConfigured) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY is not set in environment variables.",
  );
}

const effectiveUrl = isSupabaseConfigured
  ? rawUrl
  : "https://placeholder.supabase.co";
const effectiveKey = isSupabaseConfigured ? rawKey : "placeholder-key";

export const supabase: SupabaseClient<Database> = createClient<Database>(
  effectiveUrl,
  effectiveKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

