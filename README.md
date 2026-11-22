# Bhajan Beatz tickets

Registration, QR entry tickets, payments (Zelle/cash) and door check-in for
**Bhajan Beatz | Bhajan Jamming & Clubbing**, Sunday, December 27, 2026, Sai Sannidhi, Danbury CT.

- `docs/`: the public site, served by GitHub Pages at https://ravilolla.github.io/bhakti-beats-tickets/
  - `index.html` registration (share this) · `ticket.html` attendee ticket · `door.html` volunteers · `report.html` organizers
- `backend/`: Google Apps Script source (`Code.gs` + page templates) that runs on the Google Sheet. See `backend/SETUP.md`.

To rebuild the site after changing event text, price or party size in `backend/Code.gs`:
`node backend/build_site.js <apps-script /exec URL>`
