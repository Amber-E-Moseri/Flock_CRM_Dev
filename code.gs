// ============================================================
// CALL TRACKER v2.0 — Google Apps Script
// ============================================================

// ─── CONSTANTS ───────────────────────────────────────────────
const SHEET_PEOPLE       = 'PEOPLE';
const SHEET_INTERACTIONS = 'INTERACTIONS';
const SHEET_FOLLOWUPS    = 'FOLLOWUPS';
const SHEET_SETTINGS     = 'SETTINGS';

const RESULT_REACHED     = 'Reached';
const STATUS_CALL_BACK   = 'Call Back';
const STATUS_TO_BE_REACHED = 'To Be Reached';
const STATUS_COMPLETED   = 'Completed';


// ─── ACTIVE STATUS HELPER ────────────────────────────────────
// Handles Google Sheets checkbox (true/false boolean),
// text values (TRUE/FALSE/YES/NO/Y/N/ACTIVE/INACTIVE),
// and blank cells (treated as active = include by default).
function isActiveVal_(val) {
  if (val === true)  return true;
  if (val === false) return false;
  const s = String(val === null || val === undefined ? '' : val).trim().toUpperCase();
  if (s === '' || s === 'TRUE' || s === 'YES' || s === 'Y' || s === 'ACTIVE') return true;
  if (s === 'FALSE' || s === 'NO' || s === 'N' || s === 'INACTIVE') return false;
  return true; // unknown value — default to active
}

// ─── WEB APP ENTRY POINT ─────────────────────────────────────
function getAppUrl_() {
  return ScriptApp.getService().getUrl();
}
function doGet(e) {
  try {
    const page   = (e && e.parameter && e.parameter.page)   ? e.parameter.page   : 'index';
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : null;

    if (action === 'quickStats') {
      const d = api_getDuePeople();
      return ContentService
        .createTextOutput(JSON.stringify({
          callbacks: (d.callbacks||[]).length,
          overdue:   (d.overdue  ||[]).length,
          today:     (d.today    ||[]).length
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'duePeople') {
      return ContentService
        .createTextOutput(JSON.stringify(api_getDuePeople()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'people') {
      return ContentService
        .createTextOutput(JSON.stringify(api_getPeople()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveInteraction') {
      const body = JSON.parse(e.parameter.payload || '{}');
      const result = api_saveInteraction(body);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Default — return a simple OK so iOS doesn't get a redirect
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSheetLink_() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}
function isDuplicateInteraction_(payload) {
  const cache = CacheService.getScriptCache();
  const keyObj = {
    personId: payload.personId || '',
    result: payload.result || '',
    nextAction: payload.nextAction || '',
    summary: payload.summary || '',
    nextActionDateTime: payload.nextActionDateTime || ''
  };
  const key = 'dup_' + Utilities.base64EncodeWebSafe(JSON.stringify(keyObj));

  if (cache.get(key)) {
    return true;
  }

  cache.put(key, '1', 15); // block exact duplicate for 15 seconds
  return false;
}
// ─── SETTINGS ────────────────────────────────────────────────

function getSetting_(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (const row of data) {
    if (String(row[0]).trim().toUpperCase() === key.toUpperCase()) {
      return String(row[1]).trim();
    }
  }
  return null;
}

// ─── SETUP ───────────────────────────────────────────────────

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const peopleHeaders = ['PersonID','FullName','Role','CadenceDays','Active',
    'LastAttempt','LastSuccessfulContact','NextDueDate','DueStatus','Priority','Fellowship'];
  const interactionHeaders = ['InteractionID','Timestamp','PersonID','FullName','Channel',
    'Result','OutcomeType','Summary','NextAction','NextActionDateTime','Processed'];
  const followupHeaders = ['TaskID','CreatedAt','PersonID','TaskType','DueDateTime',
    'Status','LinkedInteractionID','CompletedAt','CompletionNote'];
  const settingsData = [
    ['REMINDER_EMAIL','your@email.com'],
    ['MORNING_REMINDER_HOUR','8'],
    ['DUESTATUS_REFRESH_HOUR','1'],
    ['MONDAY_FOLLOWUPS_HOUR','8'],
    ['DUE_SOON_DAYS','2'],
    ['TIMEZONE',''],
  ];

  function ensureSheet(name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1a73e8')
      .setFontColor('#ffffff');
  }

  return sheet;
}

  ensureSheet(SHEET_PEOPLE, peopleHeaders);
  ensureSheet(SHEET_INTERACTIONS, interactionHeaders);
  ensureSheet(SHEET_FOLLOWUPS, followupHeaders);

  let settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) {
    settings = ss.insertSheet(SHEET_SETTINGS);
    settings.getRange(1, 1, settingsData.length, 2).setValues(settingsData);
    settings.getRange(1, 1, settingsData.length, 1).setFontWeight('bold');
  }

  SpreadsheetApp.getUi().alert('✅ Call Tracker setup complete! Check your sheets.');
}

// ─── API: GET PEOPLE ─────────────────────────────────────────

function api_getPeople() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx = h => headers.indexOf(h);

  return data.slice(1)
    .filter(row => {
      const active = row[idx('active')];
      return isActiveVal_(active);
    })
    .map(row => ({ id: row[idx('personid')], name: row[idx('fullname')] }))
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── API: GET OPTIONS ────────────────────────────────────────

function api_getOptions() {
  return {
    results: ['Reached', 'No Answer', 'Left Message', 'Rescheduled Call'],
    nextActions: ['None', 'Callback', 'Follow-up']
  };
}

// ─── API: SAVE INTERACTION ───────────────────────────────────

function api_saveInteraction(payload) {
  try {
    return saveInteractionCore_(payload);
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function saveInteractionCore_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const interactions = ss.getSheetByName(SHEET_INTERACTIONS);
  const people = ss.getSheetByName(SHEET_PEOPLE);
  const followups = ss.getSheetByName(SHEET_FOLLOWUPS);
  
  if (isDuplicateInteraction_(payload)) {
  throw new Error('This interaction was just saved. Duplicate blocked.');
  }

  if (!payload.personId || !payload.result) throw new Error('Missing required fields');

  const now = new Date();
  const iId = 'I' + now.getTime();
  const outcomeType = deriveOutcomeType_(payload.result);
  const nextActionDT = payload.nextActionDateTime ? new Date(payload.nextActionDateTime) : '';

  if ((payload.nextAction === 'Callback' || payload.nextAction === 'Follow-up') &&
      !(nextActionDT instanceof Date && !isNaN(nextActionDT))) {
    throw new Error('Callback / follow-up date is required.');
  }

  interactions.appendRow([
    iId, now, payload.personId, payload.fullName || '', 'Call',
    payload.result, outcomeType, payload.summary || '',
    payload.nextAction || 'None', nextActionDT, true
  ]);

  const pData = people.getDataRange().getValues();
  const pH = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx = h => pH.indexOf(h);

  for (let i = 1; i < pData.length; i++) {
    if (String(pData[i][pIdx('personid')]) === String(payload.personId)) {
      const rowNum = i + 1;

      people.getRange(rowNum, pIdx('lastattempt') + 1).setValue(now);

      if (outcomeType === 'Successful') {
        people.getRange(rowNum, pIdx('lastsuccessfulcontact') + 1).setValue(now);
      }

      if (payload.nextAction === 'Callback' || payload.nextAction === 'Follow-up') {
        people.getRange(rowNum, pIdx('nextduedate') + 1).setValue(nextActionDT);
      } else if (outcomeType === 'Successful') {
        const cadence = Number(pData[i][pIdx('cadencedays')]) || 30;
        const nextDue = resolveNextActionDateTime_(nextActionDT, cadence, now);
        people.getRange(rowNum, pIdx('nextduedate') + 1).setValue(nextDue);
        closeOpenFollowupsForPerson_(followups, payload.personId, now);
      }

      break;
    }
  }

  if (payload.nextAction && payload.nextAction !== 'None') {
    const tId = 'T' + now.getTime();
    followups.appendRow([
      tId, now, payload.personId, payload.nextAction,
      nextActionDT || '', 'Open', iId, '', ''
    ]);
  }

  refreshDueStatuses();
  return { success: true, interactionId: iId };
}

function deriveOutcomeType_(result) {
  return result === RESULT_REACHED ? 'Successful' : 'Attempt';
}

function resolveNextActionDateTime_(nextActionDT, cadenceDays, fromDate) {
  if (nextActionDT && nextActionDT instanceof Date && !isNaN(nextActionDT)) return nextActionDT;
  const d = new Date(fromDate);
  d.setDate(d.getDate() + (cadenceDays || 30));
  return d;
}

function closeOpenFollowupsForPerson_(sheet, personId, now) {
  const data = sheet.getDataRange().getValues();
  const h = data[0].map(v => v.toString().trim().toLowerCase().replace(/\s/g,''));
  const pidIdx  = h.indexOf('personid');
  const statIdx = h.indexOf('status');
  const compIdx = h.indexOf('completedat');
  const noteIdx = h.indexOf('completionnote');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidIdx]) === String(personId) && data[i][statIdx] === 'Open') {
      sheet.getRange(i+1, statIdx+1).setValue('Done');
      sheet.getRange(i+1, compIdx+1).setValue(now);
      sheet.getRange(i+1, noteIdx+1).setValue('Auto-closed: successful contact, no next action');
    }
  }
}

// ─── API: GET DUE PEOPLE ────────────────────────────────────

function api_getDuePeople() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const people = ss.getSheetByName(SHEET_PEOPLE);
  const followups = ss.getSheetByName(SHEET_FOLLOWUPS);
  if (!people) return { callbacks:[], overdue:[], today:[], thisWeek:[], nextWeek:[], noDate:[] };

  const pData = people.getDataRange().getValues();
  const pH = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx = h => pH.indexOf(h);

  const fData = followups ? followups.getDataRange().getValues() : [[]];
  const fH = fData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const fIdx = h => fH.indexOf(h);

  // Build open followup map
  const openFollowups = {};
  for (let i = 1; i < fData.length; i++) {
    if (String(fData[i][fIdx('status')]) === 'Open') {
      const pid = String(fData[i][fIdx('personid')]);
      if (!openFollowups[pid]) openFollowups[pid] = [];
      openFollowups[pid].push({
        type: fData[i][fIdx('tasktype')],
        due: fData[i][fIdx('duedatetime')]
      });
    }
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86400000);
  const weekEnd    = new Date(todayStart.getTime() + 7*86400000);
  const nextWeekEnd= new Date(todayStart.getTime() + 14*86400000);

  const buckets = { callbacks:[], overdue:[], today:[], thisWeek:[], nextWeek:[], noDate:[] };

  for (let i = 1; i < pData.length; i++) {
    const row = pData[i];
    const active = row[pIdx('active')];
    if (!isActiveVal_(active)) continue;

    const pid   = String(row[pIdx('personid')]);
    const name  = row[pIdx('fullname')];
    const due   = row[pIdx('nextduedate')];
    const lastA = row[pIdx('lastattempt')];
    const prio  = row[pIdx('priority')];
    const status= row[pIdx('duestatus')];

    const person = {
      id: pid, name, priority: prio,
      lastAttempt: lastA ? formatDate_(lastA) : null,
      nextDueDate: due ? formatDate_(due) : null,
      status
    };

    if (openFollowups[pid]) {
      person.callbackDue = openFollowups[pid][0].due ? formatDate_(openFollowups[pid][0].due) : null;
      buckets.callbacks.push(person);
      continue;
    }

    if (!due) {
      buckets.noDate.push(person);
    } else {
      const dueDate = new Date(due);
      if (dueDate < todayStart)       buckets.overdue.push(person);
      else if (dueDate < todayEnd)    buckets.today.push(person);
      else if (dueDate < weekEnd)     buckets.thisWeek.push(person);
      else if (dueDate < nextWeekEnd) buckets.nextWeek.push(person);
    }
  }

  return buckets;
}

function formatDate_(d) {
  if (!d) return null;
  try {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  } catch(e) { return String(d); }
}

// ─── REFRESH DUE STATUSES ────────────────────────────────────

function refreshDueStatuses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const people = ss.getSheetByName(SHEET_PEOPLE);
  const followups = ss.getSheetByName(SHEET_FOLLOWUPS);
  if (!people) return;

  const pData = people.getDataRange().getValues();
  const pH = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx = h => pH.indexOf(h);

  const fData = followups ? followups.getDataRange().getValues() : [[]];
  const fH = fData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const fIdx = h => fH.indexOf(h);

  const openPeople = new Set();
  for (let i = 1; i < fData.length; i++) {
    if (String(fData[i][fIdx('status')]) === 'Open') {
      openPeople.add(String(fData[i][fIdx('personid')]));
    }
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 1; i < pData.length; i++) {
    const pid = String(pData[i][pIdx('personid')]);
    const due = pData[i][pIdx('nextduedate')];
    let status;

    if (openPeople.has(pid)) {
      status = STATUS_CALL_BACK;
    } else if (!due || new Date(due) <= new Date(todayStart.getTime() + 86400000 - 1)) {
      status = STATUS_TO_BE_REACHED;
    } else {
      status = STATUS_COMPLETED;
    }

    people.getRange(i+1, pIdx('duestatus')+1).setValue(status);
  }
}

// ─── EMAIL FUNCTIONS ─────────────────────────────────────────

function sendMorningDueNowReminder() {
  const data = api_getDuePeople();
  const appUrl = 'https://pikcalltracker.netlify.app/';
  const emails = getSetting_('REMINDER_EMAIL');
  if (!emails) return;

  function safe_(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function personCard_(p, type) {
    const bgMap = {
      callback: '#edf4f1',
      overdue:  '#fef3f2',
      today:    '#faf5e8'
    };

    const borderMap = {
      callback: '#dce9e4',
      overdue:  '#f3d1cc',
      today:    '#eee0b8'
    };

    let line = '';
    if (p.callbackDue) {
      line = 'Callback due: ' + safe_(p.callbackDue);
    } else if (p.nextDueDate) {
      line = 'Due: ' + safe_(p.nextDueDate);
    } else {
      line = 'No date set';
    }

    const lastAttempt = p.lastAttempt ? ' • Last: ' + safe_(p.lastAttempt) : '';
    const priority = p.priority ? ' • Priority: ' + safe_(p.priority) : '';

    return `
      <div style="border:1px solid ${borderMap[type]}; background:${bgMap[type]}; border-radius:16px; padding:14px 16px; margin-bottom:10px;">
        <div style="font-size:15px; font-weight:700; color:#1a1a18; margin-bottom:4px;">
          ${safe_(p.name)}
        </div>
        <div style="font-size:13px; color:#5f5d57; line-height:1.6;">
          ${line}${lastAttempt}${priority}
        </div>
      </div>
    `;
  }

  function section_(title, color, list, type) {
    if (!list || !list.length) return '';
    return `
      <div style="margin-bottom:22px;">
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; font-weight:700; color:${color}; margin-bottom:10px;">
          ${title} (${list.length})
        </div>
        ${list.map(function(p) { return personCard_(p, type); }).join('')}
      </div>
    `;
  }

  const totalDue =
    (data.callbacks || []).length +
    (data.overdue || []).length +
    (data.today || []).length;

  const html = `
    <div style="margin:0; padding:24px 0; background:#f4f1eb; font-family:Arial,Helvetica,sans-serif; color:#1a1a18;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e0d5; border-radius:20px; overflow:hidden;">
        
        <tr>
          <td style="background:#244c43; padding:28px 32px 20px 32px;">
            <div style="font-size:11px; letter-spacing:1.8px; text-transform:uppercase; color:#d7c28b; font-weight:700; margin-bottom:8px;">
              Pastoral Call Tracker
            </div>
            <div style="font-family:Georgia,Times New Roman,serif; font-size:32px; line-height:1.1; color:#ffffff; font-weight:700; margin-bottom:10px;">
              Morning Reminder
            </div>
            <div style="font-size:14px; color:#e8f1ed; line-height:1.6;">
              ${safe_(new Date().toDateString())}
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 10px 32px; background:#faf9f6;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="33.33%" style="padding-right:8px;">
                  <div style="background:#ffffff; border:1px solid #e5e0d5; border-radius:14px; padding:16px 12px; text-align:center;">
                    <div style="font-size:28px; font-weight:700; color:#244c43;">${(data.callbacks || []).length}</div>
                    <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#7a7870; font-weight:700;">Callbacks</div>
                  </div>
                </td>
                <td width="33.33%" style="padding:0 4px;">
                  <div style="background:#ffffff; border:1px solid #e5e0d5; border-radius:14px; padding:16px 12px; text-align:center;">
                    <div style="font-size:28px; font-weight:700; color:#b42318;">${(data.overdue || []).length}</div>
                    <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#7a7870; font-weight:700;">Overdue</div>
                  </div>
                </td>
                <td width="33.33%" style="padding-left:8px;">
                  <div style="background:#ffffff; border:1px solid #e5e0d5; border-radius:14px; padding:16px 12px; text-align:center;">
                    <div style="font-size:28px; font-weight:700; color:#b89146;">${(data.today || []).length}</div>
                    <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#7a7870; font-weight:700;">Due Today</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:12px 32px 8px 32px;">
            ${section_('🔴 Callbacks', '#244c43', data.callbacks || [], 'callback')}
            ${section_('🟠 Overdue', '#b42318', data.overdue || [], 'overdue')}
            ${section_('🟡 Due Today', '#b89146', data.today || [], 'today')}

            ${
              totalDue === 0
                ? '<p style="font-size:14px; color:#027a48; margin:8px 0 18px 0;">✅ All caught up. Nothing due today.</p>'
                : ''
            }

            <div style="text-align:center; margin:22px 0 8px 0;">
              <a href="${appUrl}" style="display:inline-block; background:#244c43; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:12px; font-weight:700; font-size:14px;">
                Open Dashboard
              </a>
            </div>

            <div style="text-align:center; font-size:13px; color:#7a7870; line-height:1.7; margin-top:10px;">
              Start with callbacks first, then overdue calls, then everyone due today.
            </div>
          </td>
        </tr>

        <tr>
          <td style="border-top:1px solid #e5e0d5; padding:18px 32px; background:#faf9f6; font-size:12px; color:#7a7870; line-height:1.7;">
            This reminder was generated by your Call Tracker system.
          </td>
        </tr>

      </table>
    </div>
  `;

  sendEmailToMany_(
    emails,
    `📞 Call Tracker — Due Today (${totalDue})`,
    html
  );
}

function sendMondayFollowupsThisWeek() {
  const data = api_getDuePeople();
  const appUrl = 'https://pikcalltracker.netlify.app/';
  const emails = getSetting_('REMINDER_EMAIL');
  if (!emails) return;

  function safe_(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function personCard_(p, type) {
    const bgMap = {
      callback: '#edf4f1',
      overdue:  '#fef3f2',
      today:    '#faf5e8',
      week:     '#eff6ff',
      nodate:   '#f7f7f5'
    };

    const borderMap = {
      callback: '#dce9e4',
      overdue:  '#f3d1cc',
      today:    '#eee0b8',
      week:     '#cfe0f5',
      nodate:   '#e5e0d5'
    };

    let line = '';
    if (p.callbackDue) {
      line = 'Callback due: ' + safe_(p.callbackDue);
    } else if (p.nextDueDate) {
      line = 'Due: ' + safe_(p.nextDueDate);
    } else {
      line = 'No date set';
    }

    const lastAttempt = p.lastAttempt ? ' • Last: ' + safe_(p.lastAttempt) : '';
    const priority = p.priority ? ' • Priority: ' + safe_(p.priority) : '';

    return `
      <div style="border:1px solid ${borderMap[type]}; background:${bgMap[type]}; border-radius:16px; padding:14px 16px; margin-bottom:10px;">
        <div style="font-size:15px; font-weight:700; color:#1a1a18; margin-bottom:4px;">
          ${safe_(p.name)}
        </div>
        <div style="font-size:13px; color:#5f5d57; line-height:1.6;">
          ${line}${lastAttempt}${priority}
        </div>
      </div>
    `;
  }

  function section_(title, color, list, type) {
    if (!list || !list.length) return '';
    return `
      <div style="margin-bottom:22px;">
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; font-weight:700; color:${color}; margin-bottom:10px;">
          ${title} (${list.length})
        </div>
        ${list.map(function(p) { return personCard_(p, type); }).join('')}
      </div>
    `;
  }

  const totalDue =
    (data.callbacks || []).length +
    (data.overdue || []).length +
    (data.today || []).length +
    (data.thisWeek || []).length +
    (data.noDate || []).length;

  const html = `
    <div style="margin:0; padding:24px 0; background:#f4f1eb; font-family:Arial,Helvetica,sans-serif; color:#1a1a18;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e0d5; border-radius:20px; overflow:hidden;">
        
        <tr>
          <td style="background:#244c43; padding:28px 32px 20px 32px;">
            <div style="font-size:11px; letter-spacing:1.8px; text-transform:uppercase; color:#d7c28b; font-weight:700; margin-bottom:8px;">
              Pastoral Call Tracker
            </div>
            <div style="font-family:Georgia,Times New Roman,serif; font-size:32px; line-height:1.1; color:#ffffff; font-weight:700; margin-bottom:10px;">
              Weekly Follow-Up Summary
            </div>
            <div style="font-size:14px; color:#e8f1ed; line-height:1.6;">
              Week of ${safe_(new Date().toDateString())}
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 10px 32px; background:#faf9f6;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="20%" style="padding-right:6px;">
                  <div style="background:#ffffff; border:1px solid #e5e0d5; border-radius:14px; padding:14px 8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:#244c43;">${(data.callbacks || []).length}</div>
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#7a7870; font-weight:700;">Callbacks</div>
                  </div>
                </td>
                <td width="20%" style="padding:0 3px;">
                  <div style="background:#ffffff; border:1px solid #e5e0d5; border-radius:14px; padding:14px 8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:#b42318;">${(data.overdue || []).length}</div>
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#7a7870; font-weight:700;">Overdue</div>
                  </div>
                </td>
                <td width="20%" style="padding:0 3px;">
                  <div style="background:#ffffff; border:1px solid #e5e0d5; border-radius:14px; padding:14px 8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:#b89146;">${(data.today || []).length}</div>
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#7a7870; font-weight:700;">Today</div>
                  </div>
                </td>
                <td width="20%" style="padding:0 3px;">
                  <div style="background:#ffffff; border:1px solid #e5e0d5; border-radius:14px; padding:14px 8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:#2d4a6b;">${(data.thisWeek || []).length}</div>
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#7a7870; font-weight:700;">This Week</div>
                  </div>
                </td>
                <td width="20%" style="padding-left:6px;">
                  <div style="background:#ffffff; border:1px solid #e5e0d5; border-radius:14px; padding:14px 8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:#7a7870;">${(data.noDate || []).length}</div>
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#7a7870; font-weight:700;">No Date</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:12px 32px 8px 32px;">
            ${section_('🔴 Callbacks', '#244c43', data.callbacks || [], 'callback')}
            ${section_('🟠 Overdue', '#b42318', data.overdue || [], 'overdue')}
            ${section_('🟡 Due Today', '#b89146', data.today || [], 'today')}
            ${section_('🔵 Due This Week', '#2d4a6b', data.thisWeek || [], 'week')}
            ${section_('⚪ No Due Date', '#7a7870', data.noDate || [], 'nodate')}

            ${
              totalDue === 0
                ? '<p style="font-size:14px; color:#027a48; margin:8px 0 18px 0;">✅ All caught up for the week.</p>'
                : ''
            }

            <div style="text-align:center; margin:22px 0 8px 0;">
              <a href="${appUrl}" style="display:inline-block; background:#244c43; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:12px; font-weight:700; font-size:14px;">
                Open Dashboard
              </a>
            </div>

            <div style="text-align:center; font-size:13px; color:#7a7870; line-height:1.7; margin-top:10px;">
              Prioritize callbacks first, then overdue contacts, then due today, then the rest of the week.
            </div>
          </td>
        </tr>

        <tr>
          <td style="border-top:1px solid #e5e0d5; padding:18px 32px; background:#faf9f6; font-size:12px; color:#7a7870; line-height:1.7;">
            This weekly summary was generated by your Call Tracker system.
          </td>
        </tr>

      </table>
    </div>
  `;

  sendEmailToMany_(
    emails,
    `📋 Call Tracker — Weekly Summary (${totalDue})`,
    html
  );
}

function sendEmailToMany_(emailsStr, subject, htmlBody) {
  const recipients = emailsStr.split(',').map(e => e.trim()).filter(Boolean);
  recipients.forEach(email => {
    GmailApp.sendEmail(email, subject, '', { htmlBody });
  });
}

// ─── TRIGGERS ────────────────────────────────────────────────

function resetAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  const refreshHour = parseInt(getSetting_('DUESTATUS_REFRESH_HOUR')) || 1;
  const morningHour = parseInt(getSetting_('MORNING_REMINDER_HOUR')) || 8;
  const mondayHour  = parseInt(getSetting_('MONDAY_FOLLOWUPS_HOUR')) || 8;

  ScriptApp.newTrigger('refreshDueStatuses').timeBased().everyDays(1).atHour(refreshHour).create();
  ScriptApp.newTrigger('sendMorningDueNowReminder').timeBased().everyDays(1).atHour(morningHour).create();
  ScriptApp.newTrigger('sendMondayFollowupsThisWeek').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(mondayHour).create();

  SpreadsheetApp.getUi().alert('✅ Triggers set up successfully!');
}

// ─── MENU ────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📞 Call Tracker')
    .addItem('Setup / Fix Headers', 'setupSystem')
    .addItem('Reset All Triggers', 'resetAllTriggers')
    .addItem('Refresh Due Statuses Now', 'refreshDueStatuses')
    .addItem('Send Morning Email Now', 'sendMorningDueNowReminder')
    .addItem('Send Weekly Email Now', 'sendMondayFollowupsThisWeek')
    .addToUi();
}

function debugDuePeople() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const people = ss.getSheetByName('PEOPLE');
  const followups = ss.getSheetByName('FOLLOWUPS');

  const pData = people.getDataRange().getValues();
  const pH = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx = h => pH.indexOf(h);

  const fData = followups ? followups.getDataRange().getValues() : [[]];
  const fH = fData[0].map(h => String(h).trim().toLowerCase().replace(/\s/g,''));
  const fIdx = h => fH.indexOf(h);

  Logger.log('HEADERS: ' + JSON.stringify(pH));
  Logger.log('IDX personid=' + pIdx('personid'));
  Logger.log('IDX fullname=' + pIdx('fullname'));
  Logger.log('IDX active=' + pIdx('active'));
  Logger.log('IDX nextduedate=' + pIdx('nextduedate'));
  Logger.log('IDX priority=' + pIdx('priority'));
  Logger.log('FOLLOWUP HEADERS: ' + JSON.stringify(fH));
  Logger.log('FOLLOWUP IDX status=' + fIdx('status'));
  Logger.log('FOLLOWUP IDX personid=' + fIdx('personid'));

  for (let i = 1; i < pData.length; i++) {
    const row = pData[i];
    const active = row[pIdx('active')];
    const isActive = isActiveVal_(active);
    const due = row[pIdx('nextduedate')];
    const name = row[pIdx('fullname')];

    Logger.log(JSON.stringify({
      row: i + 1,
      name: name,
      activeRaw: active,
      isActive: isActive,
      dueRaw: due,
      dueType: Object.prototype.toString.call(due)
    }));
  }

  Logger.log(JSON.stringify(api_getDuePeople(), null, 2));
}
function api_getQuickStats() {
  const data = api_getDuePeople();
  return {
    callbacks: (data.callbacks || []).length,
    overdue:   (data.overdue   || []).length,
    today:     (data.today     || []).length
  };
}
