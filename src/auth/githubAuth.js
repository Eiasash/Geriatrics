// GitHub OAuth for Shlav-A-Mega (Geriatrics)
//
// Prerequisites (Supabase Dashboard):
//   1. Go to Authentication > Providers > GitHub
//   2. Enable GitHub provider and add your OAuth App credentials
//   3. Set callback URL to: https://krmlzwwelqvlfslwltol.supabase.co/auth/v1/callback
//
// Usage in shlav-a-mega.html:
//   <script type="module" src="src/auth/githubAuth.js"></script>
//   Then call: window.signInWithGitHub()

// ⚠️ DUPLICATION — these two constants are ALSO defined inline at
// shlav-a-mega.html:1966-1967. If you rotate the Supabase key,
// update BOTH places. Single-file PWA architecture prevents true
// dedup; this comment is the drift-prevention contract.
const SUPA_URL = 'https://krmlzwwelqvlfslwltol.supabase.co';
const SUPA_ANON = 'sb_publishable_tUuqQQ8RKMvLDwTz5cKkOg_o_y-rHtw';

let _supabase = null;

async function getSupabase() {
  if (_supabase) return _supabase;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  _supabase = createClient(SUPA_URL, SUPA_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return _supabase;
}

/**
 * Sign in with GitHub OAuth.
 * Redirects to GitHub for authorization, then back to the app.
 */
window.signInWithGitHub = async function () {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
};

/** Sign out the current GitHub user. */
window.signOutGitHub = async function () {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

/** Get the current session (null if not logged in). */
window.getGitHubSession = async function () {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session ?? null;
};

/** Get the current user (null if not logged in). */
window.getGitHubUser = async function () {
  const session = await window.getGitHubSession();
  return session?.user ?? null;
};

// Auto-check session on load (handles OAuth callback redirect)
(async () => {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      // no console log — user email is PII
    }
  } catch (e) {
    // Silent — auth is optional
  }
})();
