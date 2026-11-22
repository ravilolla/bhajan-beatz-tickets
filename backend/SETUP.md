# Bhajan Beatz ticket portal: setup (about 15 minutes)

Registration (free or paid by Zelle/cash), QR entry tickets by email, a 75-seat cap with automatic waitlist, and phone check-in at the door.
It runs as a Google Apps Script web app on your own Google account. Data lives in a Google Sheet you own. Hosting cost: $0. No card processor and no fees: people pay you directly.

## What you get
- **Registration page**: name, email, mobile phone (required), party size 1–5. Shows "X of 75 seats left". When full, new sign-ups go to a waitlist automatically. The same person can register again to buy more tickets: each registration is a separate order with its own ticket ID and payment. A "Resend my tickets" link emails someone all their tickets again.
- **Ticket email**: QR code + ticket ID (e.g. `BB-7K2Q9X`) + "Open my ticket" link. The ticket page can be printed or saved as PDF.
- **Door check-in**: volunteers scan the QR with their normal phone camera, which opens the ticket with a **Check in** button (after a one-time door PIN). Handles partial parties ("2 of 4 arrived") and warns on re-use. A Door Desk page shows live counts and a search by name/email/ID for people without their phone.
- **Paid tickets ($50 per person, Zelle or cash)**: registering *holds* the seats as **Pending payment** and shows/emails the amount, your Zelle details, and their ticket ID to put in the Zelle memo. When you see the money, tap **Zelle** or **Cash** next to their name on the report page (or use the sheet menu). That confirms them and emails the QR ticket automatically. At the door, an unpaid guest can pay cash and a volunteer taps **Took $X cash**, then checks them in.
- **Organizer report**: seats taken and left, money collected (Zelle vs cash), money still due, a 'waiting for payment' list with one-tap Mark paid, waitlist, check-ins, seats per day, party sizes, latest sign-ups. Plus an optional 8 AM daily summary email.
- **Google Sheet**: every registration and check-in time, so you can sort, export, or edit.

## Steps
1. Go to sheets.google.com and create a blank sheet named **Bhajan Beatz Registrations**. (Tip: use a Sai Sannidhi Gmail account rather than a personal one, since emails are sent from that account.)
2. In the sheet: **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with this folder's `Code.gs`.
4. Click **+ → HTML** five times and create files named exactly `Style`, `Register`, `Ticket`, `Door`, `Report` (no `.html`; Apps Script adds it). Paste the matching file contents into each.
5. Pick `setup` in the function dropdown and click **Run**. Approve the permissions (Sheets, send email, fetch QR image). This creates the Registrations tab and sets a temporary door PIN of **2712**.
6. Change the PIN: in `Code.gs`, temporarily add at the bottom `function myPin(){ setDoorPin('your-pin'); }`, run `myPin`, then delete those lines.
7. **Deploy → New deployment → type: Web app**. Execute as: **Me**. Who has access: **Anyone**. Click Deploy and copy the **Web app URL** (ends in `/exec`).
8. Optional daily summary: pick `enableDailySummary` in the function dropdown and click **Run**. You'll get a seat count email every morning around 8 AM (to `ORGANIZER_EMAIL`, or to the deploying account if that's blank).
9. Test: open the URL, register yourself, check the email, open the ticket. Then open `URL?page=door`, enter the PIN, and check yourself in. Delete your test row from the sheet afterwards.
10. Share the public link (see below).

## Which link goes where
After step 7 you have one URL like `https://script.google.com/macros/s/AKfy...long-id.../exec`. The same URL opens different pages:

| Link | Who it's for | Share publicly? |
|---|---|---|
| `https://script.google.com/macros/s/…/exec` | **Everyone: the registration page** | **Yes.** Social media, WhatsApp, flyer QR |
| `…/exec?t=BB-XXXXXX` | One attendee's own ticket (sent by email) | No, each person gets their own |
| `…/exec?page=door` | Door volunteers | No. Bookmark on volunteer phones |
| `…/exec?page=report` | You and organizers | No |

The door and report pages need the PIN, so a leaked link alone can't do anything, but keep them out of public posts anyway.

**Making the public link nicer:** the raw Google URL is long. Shorten it with a free shortener such as bit.ly or tinyurl.com (for example `tinyurl.com/BhajanBeatz2026`) and put that in posts. For the flyer, add a QR code of the same link.

**Ready-to-post text:**
> 🎶 Bhajan Beatz | Bhajan Jamming & Clubbing 🎶
> First time in Danbury! Live bhajans, tabla, DJ beats and dancing, followed by dinner.
> 📅 Sunday, December 27, 2026 · 4 to 8 PM
> 📍 Sai Sannidhi, Danbury, CT
> Tickets $50 per person (Zelle or cash). Seats are limited to 75. Reserve yours: [your link]
> Presented by Sai Sannidhi, in collaboration with Sur Shakti Group.

If you edit code later: **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## Settings (top of `Code.gs`)
`CAPACITY` (75), `MAX_PARTY` (5), `REGISTRATION_OPEN` (set `false` to close sign-ups), `ORGANIZER_EMAIL` (reply-to on ticket emails), and the event text.

**Payment settings (fill these in before you deploy):**
| Setting | What to put |
|---|---|
| `PRICE_PER_PERSON` | `50`. Set to `0` to make the event free again (everything payment-related disappears). |
| `ZELLE_TO` | The email or phone number registered with the Zelle account receiving money |
| `ZELLE_NAME` | The name people will see in their Zelle app, so they know it's right |
| `CASH_INFO` | Where/when people can hand over cash |
| `PAY_WITHIN_DAYS` | How long a held seat waits for payment (shown to people) |
| `REFUND_POLICY` | One line, shown in the payment email. Leave `''` to hide it. |

## Running it
- **Payments**: once or twice a day, open your Zelle activity and the report page side by side. Each Zelle memo should have a ticket ID (e.g. `BB-7K2Q9X`). Tap **Zelle** next to that person. For cash, tap **Cash**. Partial payments can be entered from the sheet: type the amount in **Amount Paid**, and the seat stays held until the full amount is in.
- **Unpaid holds**: nothing is released automatically. If someone hasn't paid after `PAY_WITHIN_DAYS`, change their Status to `Cancelled` to free the seats (and promote someone from the waitlist).
- **Someone cancels**: change their Status cell to `Cancelled`. The seat frees up immediately.
- **Promote from waitlist**: change Status from `Waitlist` to `Pending payment` (paid event) or `Confirmed` (free event), select that row, then use the sheet menu **Bhajan Beatz → Re-send email to selected row**. They'll get payment instructions or their ticket.
- **Sheet menu**: **Bhajan Beatz → Mark selected row PAID (Zelle/Cash)** does the same as the report buttons.
- **At the door**: 1–2 volunteers with phones. Scan QR → tap the link → **Check in**. Green "Admit ✓" means good; amber "Already checked in" means the code was used before.

## Good to know
- Gmail accounts can send about 100 emails a day from Apps Script; plenty for 75 seats.
- Google shows a small grey banner on Apps Script pages ("created by a Google Apps Script user"). That's normal.
- The QR image in the email is made by quickchart.io (free, no account). If it's ever down, the email still has the ticket link, and the ticket page draws the QR itself.
- The door PIN keeps attendees from checking themselves in. Anyone with a ticket link can view that ticket (first name only, no email or phone).
- **Before you charge money**, it's worth a quick check with the Sai Sannidhi board on how ticket money is received (a Sai Sannidhi Zelle account is cleaner than a personal one for records and any tax questions), and on the refund policy.
- Zelle has no buyer protection and no automatic matching, so the ticket-ID memo is how you'll match payments. People sometimes forget it; search the report by name or amount.

## Troubleshooting: blank page
1. **Use the right link.** It must end in `/exec` (from Deploy → Manage deployments), not `/dev` and not the editor URL.
2. **Redeploy after any change.** Deploy → Manage deployments → pencil → Version: **New version** → Deploy. Saving the code alone doesn't update the live link.
3. **Check access settings** in that same dialog: Execute as **Me**, Who has access **Anyone** (not "Anyone with Google account" or "Only myself").
4. **Run the self-check:** open your link with `?page=ping` added, e.g. `https://script.google.com/macros/s/…/exec?page=ping`. It lists any missing file, setup step or error.
5. **If the self-check is all OK but the page is still blank**, it's the browser: try an incognito window, or your phone on mobile data (not office Wi-Fi). Ad/tracker blockers, Brave shields, and work laptops/networks often block the Google frame the page lives in. Being signed in to several Google accounts at once can also do it, and incognito avoids that.
6. **Google Workspace accounts (e.g. saisannidhiusa.org):** Google hands you a link containing `/a/<your-domain>/`. That form often shows a blank page to anyone signed in to more than one Google account. Share the plain form instead, `https://script.google.com/macros/s/<ID>/exec`. The code already uses the plain form in tickets and emails. Also make sure Who has access says **Anyone**, not "Anyone within <your-domain>". If "Anyone" isn't offered, a Workspace admin must allow sharing outside the organization (Admin console → Apps → Google Workspace → Drive and Docs → Sharing settings).

## Public site on GitHub Pages (recommended)
Google's own page (`/exec`) can show blank or "unable to open the file" for people signed in to several Google accounts. The fix is to put the four pages on a free GitHub Pages site that talks to the same Apps Script backend. The Sheet, emails, payments and PIN all stay in Google.

1. Paste the latest `Code.gs` into the editor and deploy a **New version** (it adds the API the site uses).
2. Build the site: `node build_site.js <your /exec URL>` creates the `site/` folder (already built for the current URL).
3. Publish `site/` to a GitHub repo with Pages turned on (Settings → Pages → Deploy from branch → `main` / root). Your public link becomes `https://<github-user>.github.io/<repo>/`.
4. In `Code.gs`, set `PUBLIC_SITE_URL` to that link (with the trailing `/`), and deploy a **New version** again, so ticket emails and QR codes point to the site.

Public link to share: `https://<github-user>.github.io/<repo>/`. Volunteers: `…/door.html`. You: `…/report.html`.
Price, party size, date, venue and 'presented by' text are read live from `Code.gs`: change them there and deploy a New version. No site rebuild needed.

## Custom domain: bjtickets.saisannidhiusa.org
- DNS (Cloudflare): `CNAME bjtickets → ravilolla.github.io`, **DNS only** (grey cloud).
- GitHub: repo **Settings → Pages → Custom domain** = `bjtickets.saisannidhiusa.org` → Save; once the certificate is ready, tick **Enforce HTTPS**. The `docs/CNAME` file keeps this setting on every publish.
- `Code.gs`: `PUBLIC_SITE_URL: 'https://bjtickets.saisannidhiusa.org/'` (ticket links, QR codes and the email banner use it).
- Public link: https://bjtickets.saisannidhiusa.org/ · Volunteers: …/door.html · You: …/report.html · Check: …/check.html
