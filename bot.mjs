import { init, createReport, survey, availableSlots, book } from './domain.mjs';
export const menu = `Welcome to Fort Portal City Council's chatbot prototype.\n\n1. Council services\n2. Report an issue\n3. Track my report\n4. Council contacts\n5. Request staff assistance\n6. Privacy information\n7. Book an appointment\n8. Satisfaction survey\n\nReply with a number. Type MENU to start again.\nPilot service: reports are saved to the staff dashboard. No external officer notification is sent.`;
export function respond(db, user, input) {
  init(db);
  const text = input.trim(), key = text.toLowerCase();
  let session = db.sessions[user] ||= {};
  if (['menu','hi','hello','start','cancel'].includes(key)) { db.sessions[user] = {}; return menu; }
  if (session.step === 'consent') {
    if (key !== 'yes') { db.sessions[user] = {}; return 'Nothing was saved. Type MENU to return.'; }
    session.step = 'location'; return 'Where is the issue? Enter the division, road, or a nearby landmark. Do not include private home details. Optional map coordinates: latitude,longitude | landmark.';
  }
  if (session.step === 'location') {
    if (text.length < 3) return 'Please enter a location with at least 3 characters.';
    session.location = text; session.step = 'description'; return 'Describe the issue or the help you need (at least 10 characters). Do not include IDs, payment details, or medical information.';
  }
  if (session.step === 'description') {
    if (text.length < 10) return 'Please provide a little more detail (at least 10 characters).';
    const coordinates = session.location.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\|\s*(.+)$/);
    const report = createReport(db,user,{type:session.type,location:coordinates?coordinates[3]:session.location,description:text,...(coordinates?{lat:coordinates[1],lng:coordinates[2]}:{})});
    db.sessions[user] = {}; return `Your reference is ${report.id}.\nStatus: ${report.status}\nDepartment: ${report.department}\nSaved to the staff dashboard. No external officer notification has been sent.\nType 3 to track it or MENU to return.`;
  }
  if (session.step === 'track') {
    db.sessions[user] = {};
    const report = db.reports.find(r => r.id === text.toUpperCase() && r.owner === user);
    return report ? `${report.id}\n${report.status}\nDepartment: ${report.department}\nCreated: ${report.createdAt}${report.resolution ? "\nResolution: " + report.resolution : ""}${report.surveyRequestedAt && !report.survey ? "\nPlease rate your resolved complaint: type 8." : ""}\nType MENU to return.` : 'No report found for this conversation. Check the reference, then type 3 to try again.';
  }
  if (!session.step && (key === '1' || key === 'services')) { const services=db.services.filter(s=>s.published); return services.length?services.map(s=>`${s.name}\nRequirements: ${s.requirements}\nFees: ${s.fees}\nOffice: ${s.office}\nHours: ${s.hours}`).join('\n\n'):'The service directory is awaiting approved council information. Type 5 for assistance.'; }
  if (session.step === 'surveyRef') {const r=db.reports.find(r=>r.id===text.toUpperCase()&&r.owner===user&&r.surveyRequestedAt&&!r.survey);if(!r)return 'No resolved report awaiting feedback was found for this conversation. Check the reference or type CANCEL.';session.reportId=r.id;session.step='surveyRating';return 'How satisfied are you with the resolution? Reply 1 (very dissatisfied) to 5 (very satisfied).';}
  if (session.step === 'surveyRating') {try{survey(db,user,session.reportId,Number(text));db.sessions[user]={};return 'Thank you. Your feedback has been saved. Type MENU to return.';}catch(e){return e.message;}}
  if (session.step === 'bookSlot') {try{const a=book(db,user,text.toUpperCase());db.sessions[user]={};return `Appointment booked: ${a.id}\n${a.office}\n${a.startsAt}\nLocation: ${a.location}\nType MENU to return.`;}catch(e){return e.message+' Type CANCEL to return.';}}
  if (key === '7') {const slots=availableSlots(db).filter(s=>s.remaining>0);if(!slots.length)return 'No office appointment slots have been published yet. Type 4 for council contacts.';session.step='bookSlot';return slots.map(s=>`${s.id} · ${s.office} · ${s.startsAt} · ${s.remaining} available`).join('\n')+'\nReply with the slot ID to book. Your conversation identifier will be saved with the booking. Type CANCEL to stop.';}
  if (key === '8') {session.step='surveyRef';return 'Enter the reference of your resolved report to leave feedback.';}
  if (['2','5','report','help','staff'].includes(key)) {
    session.type = ['2','report'].includes(key) ? 'Issue report' : 'Staff assistance'; session.step = 'consent';
    return 'This test stores your conversation identifier, location, description, and submission time on this computer. It makes your request visible to staff using this installation, but sends no external notification. For emergencies, contact the appropriate emergency service directly.\n\nReply YES to continue, or CANCEL to stop.';
  }
  if (key === '3' || key === 'track') { session.step = 'track'; return 'Enter your report reference (for example FP-1234ABCD).'; }
  if (key === '4' || key === 'contacts') return 'Steven — Senior Communication Officer, FPCC\nWhatsApp / telephone: +256 782 442866\nOpen WhatsApp: https://wa.me/256782442866\n\nKazooba Joseph — Snr ICT Officer\nWhatsApp / telephone: +256 703 090388\nOpen WhatsApp: https://wa.me/256703090388\n\nEng. Benard Bright — ICT Officer\nWhatsApp / telephone: +256 779 079089\nOpen WhatsApp: https://wa.me/256779079089\n\nContacts supplied by the project owner. Reports appear in the staff dashboard; no automatic WhatsApp message is sent to these officers. Office hours have not been configured. Type MENU to return.';
  if (key === '6' || key === 'privacy') return 'Prototype privacy: reports and conversation state are stored locally in data/store.json. Reports include a conversation identifier (your phone number when connected to WhatsApp), location, description, and time. No automatic deletion is configured. The operator must define retention and access rules before public use. Do not submit sensitive personal information. Type MENU to return.';
  return menu;
}
