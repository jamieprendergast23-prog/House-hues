# House & Hues: scope (v1)

A simple, foolproof inventory tracker with bookings and a calendar, built around how House & Hues already works. It replaces the spreadsheets. Phones first.

## Her process, and where the app fits

**Staging**
1. Client calls → admin creates a **job** (or the agent fills in the **booking form**)
2. Site visit → date on the job
3. Quote / proposal emailed → status *Quote sent*, quote $ recorded
4. Go-ahead → *Accepted*
5. Deposit or full payment → *Paid & booked*, payment dates recorded
6. Furniture chosen in the background → **Add furniture** (only free items shown)
7. Packing day → crew use the **pick list** (tap or scan each item)
8. Install day → *Installed*, then **Send dates to client** (pre-written email)
9. 6-week hire → shown on calendar, "Hire ending soon" on home screen
10. Final payment → *Paid in full* date
11. Collection day → crew switch pick list to **Bringing back**
12. Unpacking into the shed → scan/tap each item back in, set shed spot → *Unpacked & done*

**Consults:** call → paid → consult day → follow-up email sent → done
**Design:** enquiry → quote → in progress → done (a simple tracker for now)

## v1 features

| Area | What it does |
|---|---|
| Stock | Every piece has its own code (HH-0001) and QR label. Photo, category, colour, size, shed spot, condition. Add "12 identical chairs" in one go. |
| QR labels | Print A4 sticker sheets (Avery L7160 21-up) for any selection. |
| Scanning | Phone camera, or type the code. Scanning a label with the normal phone camera also opens the item. |
| Where is it? | Each item shows *In shed (Bay 3)* or *Out at 12 Banna Ave*, plus its next booking. |
| Jobs | Staging / consult / design, each with its own steps. Dates, client, access notes, money. |
| No double-booking | The database refuses to put one item on two jobs with overlapping dates (packing day to unpack day). Moving job dates is checked too. |
| Pick list | Grouped by room or by shed spot. Big tick boxes, progress bar, scan-to-pack. Warns loudly if a scanned item isn't on this job. |
| Calendar | Month view of site visits, packing, installs, hire ends, collections. Tap a day for detail and what's on hire. |
| Booking form | Public page (`/book`) for agents. Saves the request and emails her. One tap turns it into a job. |
| Home | New requests, next 2 weeks, hire ending soon, payments to chase. |
| Field Mode | Crew only see jobs, pick lists and the scanner. No prices, no client details, no editing. Admin can switch in and out. |
| Damage | Crew can report damage from an item's page; it flags *Needs repair* and drops out of available stock. |
| App feel | Add to Home Screen on iPhone/Android opens full-screen with its own icon. |

## Not in v1 (good next steps)
- Public services/portfolio pages on her website (the booking form can be embedded or linked now)
- Quotes/invoices generated in-app (Xero integration), online deposit payment (Stripe)
- Auto email to client when installed / 1 week before hire ends
- Offline mode for sheds with no signal
- Photos of each room after install, shared to the agent
- Importing her current spreadsheet (send it over and a one-off import can be scripted)

## Roles
- **Admin** (owner): everything
- **Crew**: Field Mode only. Read jobs + pick lists, tick/scan items, report damage
