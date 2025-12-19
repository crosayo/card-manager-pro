import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseEnabled = !!supabaseUrl && !!supabaseAnonKey;

export const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (undefined as any);
