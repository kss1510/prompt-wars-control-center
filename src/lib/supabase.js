import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Demo mode (npm run dev:demo) never creates a Supabase client, so it cannot touch event data.
export const demoMode = import.meta.env.VITE_DEMO_MODE === '1';
export const configured = !demoMode && Boolean(url && key && !url.includes('YOUR_PROJECT_REF') && !key.includes('YOUR_SUPABASE'));
export const supabase = configured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
