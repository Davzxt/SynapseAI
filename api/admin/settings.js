import { createClient } from '@supabase/supabase-js';
import { adminEmail, sanitizeText, sendJson } from '../_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Metodo nao permitido.' });

  const email = sanitizeText(req.body?.email, 320).toLowerCase();
  if (email !== adminEmail.toLowerCase()) return sendJson(res, 403, { error: 'Acesso negado.' });

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRole) {
    return sendJson(res, 501, { error: 'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel para escrita admin.' });
  }

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const key = sanitizeText(req.body?.key, 120);
  const value = req.body?.value || {};
  const { error } = await supabase.from('system_settings').upsert({ key, value, updated_by: email });

  if (error) return sendJson(res, 500, { error: error.message });
  sendJson(res, 200, { ok: true });
}
