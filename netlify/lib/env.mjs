// Settings the server functions need at run time.
// netlify.toml [build.environment] only applies while building, so public values
// have safe defaults here. The secret key must be set in Netlify's UI:
//   Project configuration > Environment variables > SUPABASE_SERVICE_ROLE_KEY
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dcdewpoigyadxaawmvqg.supabase.co'
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const SITE_URL = (process.env.SITE_URL || 'https://app.houseandhues.com.au').replace(/\/$/, '')
export const MISSING_KEY = 'The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Netlify: Project configuration > Environment variables, then redeploy.'
