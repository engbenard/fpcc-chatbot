import { randomUUID } from 'node:crypto';
export const menu = `Welcome to Fort Portal City Council's chatbot prototype.\n\n1. Council services\n2. Report an issue\n3. Track my report\n4. Council contacts\n5. Request staff assistance\n6. Privacy information\n\nReply with a number. Type MENU to start again.\nTest service: reports are stored in this prototype and are not delivered to the council.`;
export function respond(db, user, input) {
  const text = input.trim(), key = text.toLowerCase();
  let session = db.sessions[user] ||= {};
  if (['menu','hi','hello','start','cancel'].includes(key)) { db.sessions[user] = {}; return menu; }
  if (session.step === 'consent') {
    if (key !== 'yes') { db.sessions[user] = {}; return 'Nothing was saved. Type MENU to return.'; }
    session.step = 'location'; return 'Where is the issue? Enter the division, road, or a nearby landmark. Do not include private home details.';
  }
  if (session.step === 'location') {
    if (text.length < 3) return 'Please enter a location with at least 3 characters.';
    session.location = text; session.step = 'description'; return 'Describe the issue or the help you need (at least 10 characters). Do not include IDs, payment details, or medical information.';
  }
  if (session.step === 'description') {
    if (text.length < 10) return 'Please provide a little more detail (at least 10 characters).';
    const id = 'FP-' + randomUUID().slice(0,8).toUpperCase();
    db.reports.push({ id, owner:user, type:session.type, location:session.location, description:text, status:'Saved locally — awaiting council connection', createdAt:new Date().toISOString() });
    db.sessions[user] = {}; return `Your reference is ${id}.\nStatus: saved in this prototype only. No council officer has been notified.\nType 3 to track it or MENU to return.`;
  }
  if (session.step === 'track') {
    db.sessions[user] = {};
    const report = db.reports.find(r => r.id === text.toUpperCase() && r.owner === user);
    return report ? `${report.id}\n${report.status}\nCreated: ${report.createdAt}\nType MENU to return.` : 'No report found for this conversation. Check the reference, then type 3 to try again.';
  }
  if (key === '1' || key === 'services') return 'Council service topics:\n• Trading licences\n• Local revenue and fees\n• Building and planning enquiries\n• Waste collection and sanitation\n\nApproved requirements, fees, and office hours have not been configured. Type 5 to save an assistance request, or MENU.';
  if (['2','5','report','help','staff'].includes(key)) {
    session.type = ['2','report'].includes(key) ? 'Issue report' : 'Staff assistance'; session.step = 'consent';
    return 'This test stores your conversation identifier, location, description, and submission time on this computer. It does not send your request to the council. For emergencies, contact the appropriate emergency service directly.\n\nReply YES to continue, or CANCEL to stop.';
  }
  if (key === '3' || key === 'track') { session.step = 'track'; return 'Enter your report reference (for example FP-1234ABCD).'; }
  if (key === '4' || key === 'contacts') return 'Steven — Senior Communication Officer, FPCC\nWhatsApp / telephone: +256 782 442866\nOpen WhatsApp: https://wa.me/256782442866\n\nKazooba Joseph — Snr ICT Officer\nWhatsApp / telephone: +256 703 090388\nOpen WhatsApp: https://wa.me/256703090388\n\nEng. Benard Bright — ICT Officer\nWhatsApp / telephone: +256 779 079089\nOpen WhatsApp: https://wa.me/256779079089\n\nContacts supplied by the project owner. Reports saved here are not automatically forwarded to these officers. Office hours have not been configured. Type MENU to return.';
  if (key === '6' || key === 'privacy') return 'Prototype privacy: reports and conversation state are stored locally in data/store.json. Reports include a conversation identifier (your phone number when connected to WhatsApp), location, description, and time. No automatic deletion is configured. The operator must define retention and access rules before public use. Do not submit sensitive personal information. Type MENU to return.';
  return menu;
}
