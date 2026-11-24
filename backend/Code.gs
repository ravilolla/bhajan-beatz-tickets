/**
 * Bhajan Beatz | Bhajan Jamming & Clubbing — registration + QR entry tickets (free or paid by Zelle/cash)
 * Runs as a Google Apps Script web app attached to a Google Sheet. No servers, no cost.
 *
 * Pages (all at the same web app URL):
 *   <url>              Registration form (shows seats left; waitlist when full)
 *   <url>?t=BB-XXXXXX  An attendee's ticket (QR code). Volunteers who unlocked
 *                      the door PIN on their phone also see a "Check in" button here.
 *   <url>?page=door    Door desk: PIN unlock, live counts, search by name/email/ticket.
 *   <url>?page=report  Organizer report (same door PIN): totals, sign-ups per day, party sizes, arrivals.
 *
 * Only the plain <url> is for the public. Never post the ?page=door or ?page=report links.
 */

// ===== SETTINGS: edit these =====
var SETTINGS = {
  EVENT_NAME: 'Bhajan Beatz | Bhajan Jamming & Clubbing',
  EVENT_WHEN: 'Sunday, December 27, 2026 · 4 PM – 8 PM',
  EVENT_EXTRA: 'Served with Snacks, Chai & Delicious Dinner',   // extra line under the date ('' hides it)
  EVENT_WHERE: 'Sai Sannidhi, Danbury, CT',
  PRESENTED_BY: 'Presented by Sai Sannidhi',
  CAPACITY: 75,          // total seats when PRICE_TIERS is empty (with tiers, capacity = sum of tier seats)
  MAX_PARTY: 5,          // most people one registration can bring
  REGISTRATION_OPEN: true,
  ORGANIZER_EMAIL: '',   // optional: shown on emails as reply-to

  // ----- Ticket price -----
  // Tiers: seats are priced by their place in line. All 100 seats free (Nov 24).
  // An order that crosses a tier line pays each seat at its own tier (e.g. 2 free + 2 x $20).
  // Remove all tiers (PRICE_TIERS: []) to use one flat PRICE_PER_PERSON instead (0 = free event).
  PRICE_TIERS: [
    { seats: 100, price: 0 }
  ],
  // Optional wording for the price line on the page ('' = built from the tiers, e.g. "First 80 free, next 20 at $20").
  PRICE_LABEL: 'Overwhelming response: 80 seats gone in a day! So ALL 100 seats are now FREE 🎉 Grab one of the last few!',
  PRICE_PER_PERSON: 50,  // only used when PRICE_TIERS is empty
  ZELLE_TO: 'FILL IN: Zelle email or phone',
  ZELLE_NAME: 'FILL IN: name the Zelle account shows',
  PAYPAL_ME: '',         // optional: your PayPal.me name, e.g. 'SaiSannidhi' for paypal.me/SaiSannidhi ('' hides PayPal)
  CASH_INFO: 'Cash can be handed to an organizer at Sai Sannidhi.',
  PAY_WITHIN_DAYS: 3,    // shown to people; unpaid holds are NOT released automatically
  REFUND_POLICY: 'Cancellation Penalty - $100',   // shown on the registration page and in emails ('' hides it)
  SHEET_NAME: 'Registrations',
  // Public site (GitHub Pages) address, ending in '/'. When set, ticket links and QR codes point there.
  // Leave '' to use Google's own pages at the /exec link.
  PUBLIC_SITE_URL: 'https://bjtickets.saisannidhiusa.org/'
};
// The door PIN is NOT kept in code. Set it once by running setDoorPin() from the editor.

var HEADERS = ['Ticket ID', 'Registered At', 'Name', 'Email', 'Phone', 'Party Size',
               'Status', 'Checked In At', 'Checked In Count', 'Notes', 'Amount Due', 'Amount Paid', 'Paid Via', 'Paid At'];
var COL = { id: 0, at: 1, name: 2, email: 3, phone: 4, party: 5, status: 6, inAt: 7, inCount: 8, notes: 9,
            due: 10, paid: 11, via: 12, paidAt: 13 };
var PENDING = 'Pending payment';
function tiers_() {
  var t = (SETTINGS.PRICE_TIERS || []).filter(function (x) { return Number(x.seats) > 0; })
    .map(function (x) { return { seats: Number(x.seats), price: Number(x.price) || 0 }; });
  return t.length ? t : [{ seats: Number(SETTINGS.CAPACITY), price: Number(SETTINGS.PRICE_PER_PERSON) || 0 }];
}
function capacity_() { return tiers_().reduce(function (s, t) { return s + t.seats; }, 0); }
/** Price of seat number n (1-based place in line). Past capacity (waitlist) uses the last tier's price. */
function seatPrice_(n) {
  var t = tiers_(), end = 0;
  for (var i = 0; i < t.length; i++) { end += t[i].seats; if (n <= end) return t[i].price; }
  return t[t.length - 1].price;
}
/** Total for `party` seats when `used` seats are already taken, plus a plain-words breakdown. */
function quote_(used, party) {
  var total = 0, parts = {}, order = [];
  for (var k = 1; k <= party; k++) {
    var p = seatPrice_(used + k); total += p;
    if (!(p in parts)) { parts[p] = 0; order.push(p); } parts[p]++;
  }
  return { total: total, breakdown: order.map(function (p) { return parts[p] + (p ? ' x ' + money_(p) : ' free'); }).join(' + ') };
}
function paidEvent_() { return tiers_().some(function (t) { return t.price > 0; }); }
function priceLabel_() {
  if (SETTINGS.PRICE_LABEL) return SETTINGS.PRICE_LABEL;
  var t = tiers_();
  if (!paidEvent_()) return 'Free entry';
  if (t.length === 1) return money_(t[0].price) + ' per person (Zelle or cash)';
  return t.map(function (x, i) { return (i === 0 ? 'First ' : 'next ') + x.seats + (x.price ? ' at ' + money_(x.price) : ' free'); }).join(', ');
}
function money_(n) { return '$' + (Math.round(Number(n) * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
/** Payment details shown on the page and in emails. */
function payInfo_() {
  return { price: seatPrice_(seatsUsed_(rows_()) + 1), zelleTo: SETTINGS.ZELLE_TO, zelleName: SETTINGS.ZELLE_NAME,
           cash: SETTINGS.CASH_INFO, days: SETTINGS.PAY_WITHIN_DAYS, refund: SETTINGS.REFUND_POLICY,
           paypal: paypalHandle_() };
}
function paypalHandle_() { return String(SETTINGS.PAYPAL_ME || '').replace(/^.*paypal\.me\//i, '').replace(/[^\w-]/g, ''); }
/** PayPal.me link that opens PayPal with the amount filled in (the payer adds the ticket ID as the note). */
function paypalLink_(amount) { var h = paypalHandle_(); return h ? 'https://paypal.me/' + h + '/' + Number(amount).toFixed(2) + 'USD' : ''; }

// ---------- One-time setup helpers (run from the Apps Script editor) ----------
function setup() {
  sheet_();
  if (!PropertiesService.getScriptProperties().getProperty('DOOR_PIN')) {
    setDoorPin('2712');
    Logger.log('Door PIN set to 2712 for now. Change it with setDoorPin("your-pin").');
  }
  Logger.log('Sheet ready: ' + SpreadsheetApp.getActive().getUrl());
}
function setDoorPin(pin) {
  PropertiesService.getScriptProperties().setProperty('DOOR_PIN', String(pin || '').trim());
}

// ---------- Web entry point ----------
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.fn) return jsonp_(p);
  if (p.page === 'ping') return diagnose_();
  if (p.page === 'hello') {
    // Simplest possible page: no template, no styles, no scripts. If this is blank too, the browser
    // or network is blocking Google's page frame (googleusercontent.com), not our code.
    var mode = p.frame === 'deny' ? HtmlService.XFrameOptionsMode.DEFAULT : HtmlService.XFrameOptionsMode.ALLOWALL;
    return HtmlService.createHtmlOutput('<h1 style="font-family:Arial;color:#c2187a">Hello from Bhajan Beatz</h1><p style="font-family:Arial">If you can read this, the page frame works.</p>')
      .setTitle('Bhajan Beatz test').setXFrameOptionsMode(mode);
  }
  try { return render_(p); }
  catch (err) {
    // Show the problem instead of a blank page.
    return HtmlService.createHtmlOutput('<div style="font:16px Arial;padding:24px;max-width:600px">' +
      '<h2>Bhajan Beatz portal: setup problem</h2><p style="color:#b00">' + String(err).replace(/</g, '&lt;') + '</p>' +
      '<p>Open this same link with <b>?page=ping</b> at the end for a full check.</p></div>').setTitle('Bhajan Beatz · setup problem');
  }
}

/** Plain-text self check: <url>?page=ping. Lists what's missing. Safe to open; reveals no attendee data. */
function diagnose_() {
  var out = ['Bhajan Beatz portal self-check', 'Time: ' + new Date()];
  ['Style', 'Register', 'Ticket', 'Door', 'Report'].forEach(function (f) {
    try { HtmlService.createHtmlOutputFromFile(f); out.push('OK   HTML file "' + f + '"'); }
    catch (err) { out.push('MISSING  HTML file "' + f + '" (create it with + > HTML, name exactly ' + f + ')'); }
  });
  ['Register', 'Ticket'].forEach(function (f) {
    try { var t = HtmlService.createTemplateFromFile(f); t.S = SETTINGS; t.appUrl = 'x'; t.priceLabel = 'x'; t.ticketId = 'x'; t.evaluate(); out.push('OK   page "' + f + '" builds'); }
    catch (err) { out.push('ERROR page "' + f + '": ' + err); }
  });
  try { out.push('OK   sheet "' + SETTINGS.SHEET_NAME + '" rows: ' + rows_().length); } catch (err) { out.push('ERROR sheet: ' + err + ' (run setup from the editor)'); }
  out.push((PropertiesService.getScriptProperties().getProperty('DOOR_PIN') ? 'OK  ' : 'MISSING') + ' door PIN' );
  if (paidEvent_() && /FILL IN/.test(SETTINGS.ZELLE_TO + SETTINGS.ZELLE_NAME)) out.push('TODO Zelle details still say FILL IN');
  out.push('API version: ' + API_VERSION + ' (the site needs 5 or higher)');
  out.push('Web app URL: ' + appUrl_());
  out.push('', 'If every line says OK but the normal page is blank, your browser is blocking Google\'s page frame.',
           'Try a private/incognito window, your phone on mobile data, or turn off ad/tracker blockers for script.google.com.');
  return ContentService.createTextOutput(out.join('\n')).setMimeType(ContentService.MimeType.TEXT);
}

function render_(p) {
  var view, tpl;
  if (p.t) { tpl = HtmlService.createTemplateFromFile('Ticket'); tpl.ticketId = String(p.t); view = 'Your ticket'; }
  else if (p.page === 'report') { tpl = HtmlService.createTemplateFromFile('Report'); view = 'Report'; }
  else if (p.page === 'door') { tpl = HtmlService.createTemplateFromFile('Door'); view = 'Door check-in'; }
  else { tpl = HtmlService.createTemplateFromFile('Register'); view = 'Register'; }
  tpl.S = SETTINGS;
  tpl.appUrl = appUrl_();
  tpl.priceLabel = priceLabel_();
  return tpl.evaluate()
    .setTitle('Bhajan Beatz · ' + view)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

// ---------- JSON API for the public site (GitHub Pages) ----------
// The site POSTs {fn, args} as text/plain (no CORS preflight). Only these functions can be called.
var API_VERSION = 5;
function doPost(e) {
  var req; try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { req = {}; }
  return ContentService.createTextOutput(JSON.stringify(api_(req.fn, req.args))).setMimeType(ContentService.MimeType.JSON);
}
/** Same API over GET as JSONP (a <script> tag), which never hits browser cross-site (CORS) rules. */
function jsonp_(p) {
  var args; try { args = JSON.parse(p.args || '[]'); } catch (x) { args = []; }
  var cb = /^[A-Za-z_$][\w$.]{0,60}$/.test(p.callback || '') ? p.callback : 'console.log';
  // A retried request (same rid) gets the first answer back instead of running twice.
  var cache = CacheService.getScriptCache(), key = /^[\w-]{8,40}$/.test(p.rid || '') ? 'rid_' + p.rid : null;
  var body = key && cache.get(key);
  if (!body) { body = JSON.stringify(api_(p.fn, args)); if (key && body.length < 90000) cache.put(key, body, 600); }
  return ContentService.createTextOutput(cb + '(' + body + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function api_(fnName, args) {
  // Only these functions can be called from the site.
  var API = { getAvailability: getAvailability, register: register, getTicket: getTicket, verifyPin: verifyPin,
              checkIn: checkIn, doorStats: doorStats, doorSearch: doorSearch, reportData: reportData,
              markPaid: markPaid, pendingList: pendingList, resendTickets: resendTickets, getEventInfo: getEventInfo };
  API.apiVersion = function () { return API_VERSION; };
  try {
    if (!Object.prototype.hasOwnProperty.call(API, fnName)) throw new Error('Unknown request.');
    return { ok: true, result: API[fnName].apply(null, Array.isArray(args) ? args : []) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err).replace(/^Error:\s*/, '') };
  }
}

// ---------- Called from the pages ----------
function getAvailability() {
  var rows = rows_();
  var used = seatsUsed_(rows);
  return { capacity: capacity_(), used: used, left: Math.max(0, capacity_() - used),
           open: SETTINGS.REGISTRATION_OPEN, maxParty: SETTINGS.MAX_PARTY, pay: payInfo_(), event: eventInfo_() };
}

function register(form) {
  var name = clean_(form && form.name, 80);
  var email = clean_(form && form.email, 120).toLowerCase();
  var phone = clean_(form && form.phone, 30);
  var party = parseInt(form && form.party, 10);
  if (!name) throw new Error('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 10) throw new Error('Please enter your mobile number (at least 10 digits).');
  if (!(party >= 1 && party <= SETTINGS.MAX_PARTY)) throw new Error('Party size must be 1 to ' + SETTINGS.MAX_PARTY + '.');
  if (!SETTINGS.REGISTRATION_OPEN) throw new Error('Registration is closed.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(), rows = rows_();
    // Every registration is its own order with its own ticket ID, even from the same email or phone.
    var left = capacity_() - seatsUsed_(rows);
    var q = quote_(seatsUsed_(rows), party);
    var status = party <= left ? (q.total > 0 ? PENDING : 'Confirmed') : 'Waitlist';
    var id = newId_(rows);
    var due = q.total;
    var row = [id, new Date(), name, email, "'" + phone, party, status, '', 0, q.total ? q.breakdown : '', due, 0, '', ''];
    sh.appendRow(row);
    SpreadsheetApp.flush();
    var rec = rowObj_(row); rec.phone = phone;
    sendTicketEmail_(rec);
    return { duplicate: false, ticket: publicTicket_(rec), seatsLeft: Math.max(0, left - (status === 'Waitlist' ? 0 : party)) };
  } finally { lock.releaseLock(); }
}

/** Event text the site shows, so changing SETTINGS + redeploying updates the site without a rebuild. */
function eventInfo_() {
  return { when: SETTINGS.EVENT_WHEN, where: SETTINGS.EVENT_WHERE, presentedBy: SETTINGS.PRESENTED_BY,
           extra: SETTINGS.EVENT_EXTRA || '', policy: SETTINGS.REFUND_POLICY || '',
           price: paidEvent_() ? seatPrice_(seatsUsed_(rows_()) + 1) : 0, maxParty: SETTINGS.MAX_PARTY,
           tiers: tiers_(), priceLabel: priceLabel_() };
}
function getEventInfo() { return eventInfo_(); }

/** "Lost my ticket": re-sends every active registration for this email, only to that same email.
 *  Same answer whether or not the email is registered, and at most once per 10 minutes per email. */
function resendTickets(email) {
  email = clean_(email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
  var cache = CacheService.getScriptCache(), key = 'resend_' + Utilities.base64EncodeWebSafe(email).slice(0, 200);
  if (!cache.get(key)) {
    cache.put(key, '1', 600);
    rows_().map(rowObj_).filter(function (r) { return r.email.toLowerCase() === email && r.status !== 'Cancelled'; })
      .slice(0, 10).forEach(sendTicketEmail_);
  }
  return { message: 'If that email has registrations, we\'ve sent them again. Please check your inbox and spam folder.' };
}

/** Public ticket lookup: only what the attendee needs to see. */
function getTicket(id) {
  var r = find_(id);
  return r ? publicTicket_(r) : null;
}

function verifyPin(pin) { return pinOk_(pin); }

/** Door: mark a ticket as arrived. `count` lets part of a party arrive first. */
function checkIn(id, pin, count) {
  if (!pinOk_(pin)) throw new Error('Wrong door PIN.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r = find_(id);
    if (!r) return { ok: false, message: 'No ticket found for ' + id };
    if (r.status !== 'Confirmed') return { ok: false, message: r.status === PENDING ? r.name + ' has not paid yet (' + money_(r.due - r.paid) + ' due). Mark paid first.' : r.name + ' is ' + r.status.toLowerCase() + ', not confirmed.', ticket: doorTicket_(r) };
    var n = Math.min(r.party, Math.max(1, parseInt(count, 10) || r.party));
    var already = r.inCount >= r.party;
    if (!already) {
      var sh = sheet_();
      var newCount = Math.min(r.party, r.inCount + n);
      sh.getRange(r.rowNum, COL.inAt + 1, 1, 2).setValues([[r.inAt || new Date(), newCount]]);
      r.inCount = newCount; r.inAt = r.inAt || new Date();
    }
    return { ok: !already, already: already, ticket: doorTicket_(r),
             message: already ? 'Already checked in' : 'Welcome, ' + r.name + '!' };
  } finally { lock.releaseLock(); }
}

function doorStats(pin) {
  if (!pinOk_(pin)) throw new Error('Wrong door PIN.');
  var rows = rows_(), s = { confirmed: 0, arrived: 0, waitlist: 0, capacity: capacity_() };
  rows.forEach(function (row) {
    var r = rowObj_(row);
    if (r.status === 'Confirmed') { s.confirmed += r.party; s.arrived += r.inCount; }
    if (r.status === 'Waitlist') s.waitlist += r.party;
    if (r.status === PENDING) s.pending = (s.pending || 0) + r.party;
  });
  return s;
}

function doorSearch(pin, q) {
  if (!pinOk_(pin)) throw new Error('Wrong door PIN.');
  q = String(q || '').trim().toLowerCase();
  if (q.length < 2) return [];
  return rows_().map(rowObj_).filter(function (r) {
    return (r.name + ' ' + r.email + ' ' + r.id).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 25).map(doorTicket_);
}

/** Organizer/door: record a Zelle or cash payment. Confirms the seat and emails the QR ticket.
 *  `amount` defaults to the full amount due. A waitlisted party is confirmed only if seats are free. */
function markPaid(id, pin, via, amount) {
  if (!pinOk_(pin)) throw new Error('Wrong door PIN.');
  via = /cash/i.test(via) ? 'Cash' : /paypal/i.test(via) ? 'PayPal' : 'Zelle';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r = find_(id);
    if (!r) return { ok: false, message: 'No ticket found for ' + id };
    if (r.status === 'Cancelled') return { ok: false, message: 'This registration was cancelled.' };
    if (r.status === 'Confirmed' && r.paid >= r.due) return { ok: false, message: 'Already paid.', ticket: doorTicket_(r) };
    if (r.status === 'Waitlist' && r.party > capacity_() - seatsUsed_(rows_()))
      return { ok: false, message: 'No seats free for this waitlisted party.', ticket: doorTicket_(r) };
    var amt = amount === undefined || amount === '' || amount === null ? r.due - r.paid : Number(amount);
    if (!(amt >= 0)) throw new Error('Enter a valid amount.');
    r.paid += amt; r.via = r.via && r.via !== via ? r.via + ' + ' + via : via;
    var full = r.paid >= r.due;
    if (full) r.status = 'Confirmed';
    var sh = sheet_();
    sh.getRange(r.rowNum, COL.status + 1).setValue(r.status);
    sh.getRange(r.rowNum, COL.paid + 1, 1, 3).setValues([[r.paid, r.via, new Date()]]);
    if (full) sendTicketEmail_(r);
    return { ok: true, full: full, ticket: doorTicket_(r),
             message: full ? 'Paid ' + money_(r.paid) + ' by ' + r.via + '. Ticket emailed to ' + r.email + '.'
                           : 'Recorded ' + money_(amt) + '. Still due: ' + money_(r.due - r.paid) + '.' };
  } finally { lock.releaseLock(); }
}

/** Organizer: list unpaid holds for the report page. */
function pendingList(pin) {
  if (!pinOk_(pin)) throw new Error('Wrong door PIN.');
  return rows_().map(rowObj_).filter(function (r) { return r.status === PENDING; }).map(doorTicket_);
}

/** Organizer report (PIN-protected). */
function reportData(pin) {
  if (!pinOk_(pin)) throw new Error('Wrong door PIN.');
  return report_();
}
function report_() {
  var tz = Session.getScriptTimeZone(), rows = rows_().map(rowObj_);
  var r = { capacity: capacity_(), registrations: 0, seats: 0, waitlistRegs: 0, waitlistSeats: 0,
            cancelledRegs: 0, arrivedSeats: 0, arrivedRegs: 0, partyMix: {}, byDay: {}, last24h: 0, recent: [],
            paidEvent: paidEvent_(), price: 0, priceLabel: priceLabel_(), tiers: tiers_(), tierFill: [],
            pendingRegs: 0, pendingSeats: 0, pendingAmount: 0, collected: 0, collectedBy: {}, expected: 0 };
  var now = new Date().getTime();
  rows.forEach(function (x) {
    if (x.paid) { r.collected += x.paid; String(x.via || 'Other').split(' + ').forEach(function (v, i, a) { r.collectedBy[v] = (r.collectedBy[v] || 0) + x.paid / a.length; }); }
    if (x.status === 'Cancelled') { r.cancelledRegs++; return; }
    if (x.status === 'Waitlist') { r.waitlistRegs++; r.waitlistSeats += x.party; return; }
    if (x.status === PENDING) { r.pendingRegs++; r.pendingSeats += x.party; r.pendingAmount += Math.max(0, x.due - x.paid); }
    r.expected += x.due;
    r.registrations++; r.seats += x.party; r.arrivedSeats += x.inCount; if (x.inCount > 0) r.arrivedRegs++;
    r.partyMix[x.party] = (r.partyMix[x.party] || 0) + 1;
    if (x.at) {
      var d = new Date(x.at), day = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      r.byDay[day] = (r.byDay[day] || 0) + x.party;
      if (now - d.getTime() < 86400000) r.last24h += x.party;
    }
  });
  r.seatsLeft = Math.max(0, r.capacity - r.seats);
  var start = 0;
  r.tierFill = tiers_().map(function (t) {
    var taken = Math.max(0, Math.min(t.seats, r.seats - start)); start += t.seats;
    return { seats: t.seats, price: t.price, taken: taken };
  });
  r.recent = rows.filter(function (x) { return x.at; })
    .sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, 10)
    .map(function (x) { return { name: x.name, party: x.party, status: x.status, at: Utilities.formatDate(new Date(x.at), tz, 'MMM d, h:mm a') }; });
  return r;
}

/** Daily summary email to the organizer at ~8 AM. Run enableDailySummary() once from the editor. */
function enableDailySummary() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendDailySummary') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDailySummary').timeBased().everyDays(1).atHour(8).create();
}
function sendDailySummary() {
  var r = report_(), to = SETTINGS.ORGANIZER_EMAIL || Session.getEffectiveUser().getEmail();
  var body = 'Bhajan Beatz registrations\n\n' +
    'Seats confirmed: ' + r.seats + ' of ' + r.capacity + ' (' + r.seatsLeft + ' left)\n' +
    'Registrations: ' + r.registrations + '\n' +
    'New seats in last 24h: ' + r.last24h + '\n' +
    'Waitlist: ' + r.waitlistSeats + ' seats (' + r.waitlistRegs + ' registrations)\n' +
    'Cancelled: ' + r.cancelledRegs + '\n' +
    (r.paidEvent ? '\nPaid so far: ' + money_(r.collected) + '\nUnpaid holds: ' + r.pendingSeats + ' seats, ' + money_(r.pendingAmount) + ' due (' + r.pendingRegs + ' registrations)\n' : '') +
    (r.arrivedSeats ? 'Checked in: ' + r.arrivedSeats + '\n' : '') +
    '\nFull report: ' + appUrl_() + '?page=report';
  MailApp.sendEmail(to, 'Bhajan Beatz: ' + r.seats + '/' + r.capacity + ' seats registered', body);
}

// ---------- Internals ----------
function sheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SETTINGS.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS.SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function rows_() {
  var sh = sheet_(), n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, HEADERS.length).getValues() : [];
}
function rowObj_(row, i) {
  return { id: String(row[COL.id]), at: row[COL.at], name: String(row[COL.name]), email: String(row[COL.email]),
           phone: String(row[COL.phone]).replace(/^'/, ''), party: Number(row[COL.party]) || 1,
           status: String(row[COL.status] || 'Confirmed'), inAt: row[COL.inAt] || '',
           inCount: Number(row[COL.inCount]) || 0, rowNum: (i || 0) + 2,
           due: Number(row[COL.due]) || 0, paid: Number(row[COL.paid]) || 0, via: String(row[COL.via] || ''),
           notes: String(row[COL.notes] || '') };
}
function find_(id) {
  id = String(id || '').trim().toUpperCase();
  if (!id) return null;
  var rows = rows_();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][COL.id]).toUpperCase() === id) return rowObj_(rows[i], i);
  return null;
}
function seatsUsed_(rows) {
  return rows.reduce(function (sum, row) {
    var st = row[COL.status];
    return sum + (st === 'Confirmed' || st === PENDING ? (Number(row[COL.party]) || 1) : 0);
  }, 0);
}
function newId_(rows) {
  var taken = {}; rows.forEach(function (r) { taken[r[COL.id]] = true; });
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', id;
  do { id = 'BB-'; for (var i = 0; i < 6; i++) id += abc.charAt(Math.floor(Math.random() * abc.length)); } while (taken[id]);
  return id;
}
function pinOk_(pin) {
  // Simple brute-force guard: after 15 wrong PINs within 10 minutes, all PIN checks pause for 10 minutes.
  var cache = CacheService.getScriptCache(), fails = Number(cache.get('pin_fails')) || 0;
  if (fails >= 15) throw new Error('Too many wrong PIN attempts. Try again in 10 minutes.');
  var real = PropertiesService.getScriptProperties().getProperty('DOOR_PIN');
  var ok = !!real && String(pin || '').trim() === real;
  if (!ok) cache.put('pin_fails', String(fails + 1), 600);
  return ok;
}
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max); }
function firstName_(n) { return String(n).split(/\s+/)[0]; }
function publicTicket_(r) {
  var t = { id: r.id, name: firstName_(r.name), party: r.party, status: r.status, checkedIn: r.inCount >= r.party && r.party > 0 };
  if (r.status === PENDING) { t.owed = Math.max(0, r.due - r.paid); t.pay = payInfo_(); }
  return t;
}
function doorTicket_(r) {
  return { id: r.id, name: r.name, email: r.email, party: r.party, status: r.status, inCount: r.inCount,
           due: r.due, paid: r.paid, owed: Math.max(0, r.due - r.paid), via: r.via, phone: r.phone,
           inAt: r.inAt ? Utilities.formatDate(new Date(r.inAt), Session.getScriptTimeZone(), 'h:mm a') : '' };
}
/** Public web app URL. Google Workspace accounts report a /a/<domain>/ URL, which shows a blank page
 *  to anyone signed in to more than one Google account; the plain /macros/s/... form works for everyone. */
function appUrl_() {
  return ScriptApp.getService().getUrl()
    .replace(/\/a\/macros\/[^\/]+\/s\//, '/macros/s/')
    .replace(/\/a\/[^\/]+\/macros\/s\//, '/macros/s/');
}
function ticketUrl_(id) {
  return SETTINGS.PUBLIC_SITE_URL ? SETTINGS.PUBLIC_SITE_URL + 'ticket.html?t=' + encodeURIComponent(id)
                                  : appUrl_() + '?t=' + encodeURIComponent(id);
}
function qrBlob_(text) {
  try {
    var res = UrlFetchApp.fetch('https://quickchart.io/qr?size=360&margin=2&ecLevel=M&text=' + encodeURIComponent(text), { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return res.getBlob().setName('ticket-qr.png');
  } catch (err) { Logger.log('QR fetch failed: ' + err); }
  return null;
}

/** Event logo for emails, fetched once from the public site and cached for 6 hours. */
function logoBlob_() {
  if (!SETTINGS.PUBLIC_SITE_URL) return null;
  try {
    var cache = CacheService.getScriptCache(), b64 = cache.get('banner_b64');
    if (!b64) {
      var res = UrlFetchApp.fetch(SETTINGS.PUBLIC_SITE_URL + 'banner.jpg', { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return null;
      b64 = Utilities.base64Encode(res.getContent());
      if (b64.length < 95000) cache.put('banner_b64', b64, 21600);
    }
    return Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', 'banner.jpg');
  } catch (err) { Logger.log('Logo fetch failed: ' + err); return null; }
}

function sendTicketEmail_(r) {
  var url = ticketUrl_(r.id), confirmed = r.status === 'Confirmed', pending = r.status === PENDING;
  var subject = confirmed ? 'Your entry ticket: ' + SETTINGS.EVENT_NAME + ' (' + r.id + ')'
              : pending ? 'Seat held, payment needed: ' + SETTINGS.EVENT_NAME + ' (' + r.id + ')'
                        : 'You are on the waitlist: ' + SETTINGS.EVENT_NAME;
  var owed = Math.max(0, r.due - r.paid);
  var qr = confirmed ? qrBlob_(url) : null;
  var logo = logoBlob_();
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border-radius:14px;overflow:hidden;border:1px solid #e5d4f5">' +
    '<div style="background:#2a0b45;color:#ffd98a;padding:20px 24px">' +
    (logo ? '<img src="cid:logo" alt="Bhajan Beatz · Bhajan Jamming &amp; Clubbing" style="display:block;width:100%;max-width:472px;margin:0 0 12px">' : '<div style="font-size:13px;letter-spacing:2px;color:#ff8bd8">BHAJAN BEATZ</div>') +
    (logo ? '' : '<div style="font-size:20px;font-weight:bold;color:#fff">Bhajan Jamming &amp; Clubbing</div>') +
    '<div style="margin-top:6px">' + esc(SETTINGS.EVENT_WHEN) + '<br>' + (SETTINGS.EVENT_EXTRA ? esc(SETTINGS.EVENT_EXTRA) + '<br>' : '') + esc(SETTINGS.EVENT_WHERE) + '</div></div>' +
    '<div style="padding:22px 24px;color:#222">' +
    '<p>Namaste ' + esc(firstName_(r.name)) + ',</p>' +
    (confirmed
      ? '<p>You are registered for a party of <b>' + r.party + '</b>. Show this QR code at the door.</p>' +
        (qr ? '<p style="text-align:center"><img src="cid:qr" width="220" height="220" alt="Ticket QR code"></p>' : '') +
        '<p style="text-align:center;font-size:22px;letter-spacing:3px;font-weight:bold">' + esc(r.id) + '</p>' +
        '<p style="text-align:center"><a href="' + url + '" style="background:#c2187a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open my ticket</a></p>'
      : pending
      ? '<p>We are holding <b>' + r.party + (r.party > 1 ? ' seats' : ' seat') + '</b> for you. To confirm, please pay <b>' + money_(owed) + '</b>' +
        (r.notes ? ' (' + esc(r.notes) + ')' : '') + ' within ' + SETTINGS.PAY_WITHIN_DAYS + ' days.</p>' +
        '<div style="background:#f7f0fc;border-radius:10px;padding:14px 16px">' +
        '<p style="margin:0 0 8px"><b>Zelle:</b> send to <b>' + esc(SETTINGS.ZELLE_TO) + '</b> (' + esc(SETTINGS.ZELLE_NAME) + ')<br>' +
        'Put <b>' + esc(r.id) + '</b> in the Zelle memo so we can match your payment.</p>' +
        (paypalHandle_() ? '<p style="margin:0 0 8px"><b>PayPal:</b> <a href="' + paypalLink_(owed) + '">pay ' + money_(owed) + ' at paypal.me/' + esc(paypalHandle_()) + '</a><br>' +
          'Add <b>' + esc(r.id) + '</b> in the PayPal note.</p>' : '') +
        '<p style="margin:0"><b>Cash:</b> ' + esc(SETTINGS.CASH_INFO) + ' Mention ticket ID <b>' + esc(r.id) + '</b>.</p></div>' +
        '<p>Once we receive your payment, we will email your QR entry ticket.</p>' +
        (SETTINGS.REFUND_POLICY ? '<p style="color:#666;font-size:13px">' + esc(SETTINGS.REFUND_POLICY) + '</p>' : '')
      : '<p>The event is full right now, so you are on the <b>waitlist</b> for a party of ' + r.party + '. We will email you if seats open up.</p>') +
    '<p style="color:#666;font-size:13px">Can\'t make it? Just reply to this email so we can give your seat to someone else.</p>' +
    '<p style="color:#666;font-size:13px">' + esc(SETTINGS.PRESENTED_BY) + '<br><i>Music is the soul\'s language, and God is the soul\'s energy.</i></p></div></div>';
  var opts = { htmlBody: html, name: 'Bhajan Beatz · Sai Sannidhi' };
  opts.inlineImages = {};
  if (qr) opts.inlineImages.qr = qr;
  if (logo) opts.inlineImages.logo = logo;
  if (SETTINGS.ORGANIZER_EMAIL) opts.replyTo = SETTINGS.ORGANIZER_EMAIL;
  MailApp.sendEmail(r.email, subject, (pending ? 'Please pay ' + money_(owed) + ' by Zelle to ' + SETTINGS.ZELLE_TO + ' (memo ' + r.id + ')' + (paypalHandle_() ? ', PayPal ' + paypalLink_(owed) + ' (note ' + r.id + ')' : '') + ' or cash. ' : '') + 'Ticket: ' + url, opts);
}

/** Organizer helper: after changing a row's Status to Confirmed (e.g. promoting from waitlist), select
 *  that row and run this to email the person their ticket. */
function resendTicketForSelectedRow() {
  var sh = SpreadsheetApp.getActiveSheet(), i = sh.getActiveRange().getRow();
  if (i < 2) throw new Error('Select a registration row first.');
  var row = sh.getRange(i, 1, 1, HEADERS.length).getValues()[0];
  sendTicketEmail_(rowObj_(row, i - 2));
}
function markSelectedRowPaid_(via) {
  var sh = SpreadsheetApp.getActiveSheet(), i = sh.getActiveRange().getRow();
  if (i < 2) throw new Error('Select a registration row first.');
  var id = sh.getRange(i, COL.id + 1).getValue();
  var res = markPaid(id, PropertiesService.getScriptProperties().getProperty('DOOR_PIN'), via);
  SpreadsheetApp.getUi().alert(res.message);
}
function markSelectedPaidZelle() { markSelectedRowPaid_('Zelle'); }
function markSelectedPaidCash() { markSelectedRowPaid_('Cash'); }
function markSelectedPaidPayPal() { markSelectedRowPaid_('PayPal'); }
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Bhajan Beatz')
    .addItem('Mark selected row PAID (Zelle) + email ticket', 'markSelectedPaidZelle')
    .addItem('Mark selected row PAID (Cash) + email ticket', 'markSelectedPaidCash')
    .addItem('Mark selected row PAID (PayPal) + email ticket', 'markSelectedPaidPayPal')
    .addSeparator()
    .addItem('Re-send email to selected row', 'resendTicketForSelectedRow').addToUi();
}
