# House & Hues

Inventory, jobs and bookings for a home staging business. React + Vite on Netlify, Supabase for data, login and photos. See `SCOPE.md` for what it does.

## Setup (about 30 minutes)

### 1. Supabase
1. Create a project at supabase.com (region: **Sydney**).
2. **SQL Editor → New query**, paste `supabase/migrations/001_init.sql`, **Run**.
   Optional: run `supabase/seed.sql` for sample stock.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up" (only invited people get in).
4. **Authentication → URL Configuration**: Site URL = your Netlify URL (e.g. `https://househues.netlify.app`). Add the same URL to Redirect URLs.
5. **Authentication → Users → Add user**: create the owner's login (email + password, tick auto-confirm).
6. Make her admin. In SQL Editor:
   ```sql
   update profiles set role = 'admin', full_name = 'Her Name'
   where id = (select id from auth.users where email = 'her@email.com');
   ```
7. **Project Settings → API**: copy the Project URL, `anon` key and `service_role` key.

### 2. GitHub
```bash
git init && git add . && git commit -m "House & Hues v1"
gh repo create house-hues --private --source=. --push
```

### 3. Netlify
1. **Add new site → Import from Git →** pick the repo. Build settings come from `netlify.toml`.
2. **Site configuration → Environment variables**, add:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret, functions only) |
| `SITE_URL` | the live site URL |
| `VITE_ERP` | leave unset for Phase 1 (inventory only). Set to `1` to switch on bookings, calendar, clients and money. |
| `NOTIFY_EMAIL` | where booking alerts go |
| `RESEND_API_KEY` | from resend.com (free tier is plenty) |
| `FROM_EMAIL` | optional, e.g. `House & Hues <hello@househues.com.au>` once her domain is verified in Resend. Also turns on the requester receipt email. |

3. Redeploy. Optionally add her custom domain.

Without Resend, booking requests still save and appear under **Requests**; she just won't get an email.

### Local dev
```bash
cp .env.example .env   # fill in the VITE_ values
npm install
npm run dev            # or `netlify dev` to run the functions too
```

## Using it

- **Add stock:** Stock → Add item → snap a photo. Identical pieces (chairs, cushions): set "How many identical?".
- **Labels:** Stock → filter/select → Print QR labels. Stick them somewhere hidden but reachable (underside, back leg, mattress tag).
- **New job:** Jobs → New job, or Requests → Create job. Add packing + install dates, save, then **Add furniture** (only free pieces appear).
- **Packing day:** crew open the job from their phone → tick or **Scan to pack**. A red warning means that item isn't for this house.
- **Collection / unpack:** pick list → **Bringing back** → scan each piece off the truck.
- **Booking link for agents:** `https://your-site/book`. Put it on her website, email signature and Instagram bio.
- **Crew:** Team → Invite. They only ever see Field Mode.
- **Install on phone:** open the site in Safari → Share → Add to Home Screen.

## How it's built

- `supabase/migrations/001_init.sql`: tables, row level security, and the `no_double_booking` exclusion constraint (one item can't be on two jobs with overlapping dates). Crew actions go through `scan_pack`, `scan_return`, `set_job_item_state`, `flag_item`.
- Money lives in `item_costs` and `job_finance`, admin-only, so crew can never load it.
- `netlify/functions/booking-request.mjs`: public form → database → email.
- `netlify/functions/invite-user.mjs`: admin-only user invites.
- QR codes encode `https://site/i/HH-0042`, so any phone camera opens the item.
