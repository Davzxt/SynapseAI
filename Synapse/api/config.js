import { adminEmail, groqModels, sendJson } from './_shared.js';

export default function handler(_req, res) {
  sendJson(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    adminEmail,
    models: groqModels.map(({ id, tier, strengths }) => ({ id, tier, strengths }))
  });
}
