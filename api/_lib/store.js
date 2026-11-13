// Database access for the AI endpoints, using the Supabase SERVICE ROLE key (server-side only).
// Every authorization decision is made in core.js before these are called.
import { createClient } from '@supabase/supabase-js';

export function createStore(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const one = async q => { const { data, error } = await q; if (error) throw new Error(error.message); return data; };

  return {
    async getCaller(token) {
      if (!token) return null;
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user) return null;
      const profile = await one(db.from('profiles').select('id, role').eq('id', data.user.id).maybeSingle());
      return profile || null;
    },
    getSettings: () => one(db.from('event_settings').select('ai_judging, ai_chatbot').eq('id', true).maybeSingle()),
    getSubmission: id => one(db.from('submissions').select('*').eq('id', id).maybeSingle()),
    async isTeamMember(teamId, userId) {
      const row = await one(db.from('team_members').select('team_id').eq('team_id', teamId).eq('user_id', userId).maybeSingle());
      return Boolean(row);
    },
    async teamOf(userId) {
      const row = await one(db.from('team_members').select('team_id').eq('user_id', userId).maybeSingle());
      return row?.team_id ?? null;
    },
    getRound: id => one(db.from('rounds').select('*').eq('id', id).maybeSingle()),
    getBrief: id => one(db.from('round_briefs').select('brief, update_text').eq('round_id', id).maybeSingle()),
    getJudgeNotes: id => one(db.from('round_judge_notes').select('notes').eq('round_id', id).maybeSingle()),
    getChatConfig: () => one(db.from('guardrail_config').select('bot_name, persona, rules, max_messages_per_team').eq('id', true).single()),
    getTranscript: teamId => one(db.from('guardrail_messages').select('role, content, created_at').eq('team_id', teamId).order('id', { ascending: true }).limit(200)),
    async countUserMessages(teamId) {
      const { count, error } = await db.from('guardrail_messages').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('role', 'user');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    addMessages: rows => one(db.from('guardrail_messages').insert(rows)),
    markSubmission: (id, status, message) => one(db.rpc('ai_mark_submission', { p_submission: id, p_status: status, p_error: message })),
    recordScores: (id, points, reasons, model, flagged) =>
      one(db.rpc('ai_record_scores', { p_submission: id, p_points: points, p_reasons: reasons, p_model: model, p_flagged: flagged }))
  };
}
