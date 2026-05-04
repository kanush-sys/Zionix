// api/me.js — Get current Zionix user
// GET /api/me  Authorization: Bearer <token>
const supabase = require('./_supabase');
const { setCors, handleOptions, getUser, ok, err } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return err(res, 405, 'Use GET.');

  const user = await getUser(req);
  if (!user) return err(res, 401, 'Not authenticated.');

  let { data: profile } = await supabase
    .from('profiles').select('name, lifetime, lifetime_since, wake_name').eq('id', user.id).single();

  if (!profile) {
    const authName = user.user_metadata?.name || 'Sovereign';
    const { data: newProfile } = await supabase.from('profiles').upsert({
      id: user.id, email: user.email.toLowerCase().trim(),
      name: authName, lifetime: false, wake_name: 'NOVA',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'id' }).select('name, lifetime, lifetime_since, wake_name').single();
    profile = newProfile || { name: authName, lifetime: false, lifetime_since: null, wake_name: 'NOVA' };
  }

  return ok(res, {
    user: {
      id: user.id, email: user.email,
      name: profile.name,
      premium: profile.lifetime || false,
      lifetime: profile.lifetime || false,
      lifetime_since: profile.lifetime_since || null,
      wake_name: profile.wake_name || 'NOVA',
    },
  });
};
