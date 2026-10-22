import { randomUUID } from 'node:crypto';
import { createReport, findReport } from './db.mjs';

export const menu = `Welcome to Fort Portal City Council's chatbot prototype.

1. Council services
2. Report an issue
3. Track my report
4. Council contacts
5. Request staff assistance
6. Privacy information

Reply with a number. Type MENU to start again.
Prototype service: submitted reports are stored in the central FPCC pilot database but this is not yet an official council service channel.`;

export async function respond(db, user, input) {
  const text = input.trim(), key = text.toLowerCase();
  let session = db.sessions[user] ||= {};

  if (['menu','hi','hello','start','cancel'].includes(key)) {
    db.sessions[user] = {};
    return menu;
  }

  if (session.step === 'consent') {
    if (key !== 'yes') {
      db.sessions[user] = {};
      return 'Nothing was saved. Type MENU to return.';
    }
    session.step = 'location';
    return 'Where is the issue? Enter the division, road, or a nearby landmark. Do not include private home details.';
  }

  if (session.step === 'location') {
    if (text.length < 3) return 'Please enter a location with at least 3 characters.';
    session.location = text;
    session.step = 'description';
    return 'Describe the issue or the help you need (at least 10 characters). Do not include IDs, payment details, or medical information.';
  }

  if (session.step === 'description') {
    if (text.length < 10) return 'Please provide a little more detail (at least 10 characters).';

    const reference = 'FP-' + randomUUID().slice(0,8).toUpperCase();
    const source = user.startsWith('demo:') ? 'web' : 'whatsapp';

    const report = await createReport({
      reference,
      owner: user,
      type: session.type,
      location: session.location,
      description: text,
      source
    });

    db.sessions[user] = {};
    return `Your reference is ${report.reference}.
Status: ${report.status}.
Your report has been saved in the FPCC pilot database.
Type 3 to track it or MENU to return.`;
  }

  if (session.step === 'track') {
    db.sessions[user] = {};
    const report = await findReport(text, user);

    if (!report) {
      return 'No report found for this conversation. Check the reference, then type 3 to try again.';
    }

    const department = report.department ? `\nDepartment: ${report.department}` : '';
    const assigned = report.assigned_to ? `\nAssigned to: ${report.assigned_to}` : '';
    const priority = report.priority ? `\nPriority: ${report.priority}` : '';

    return `${report.reference}
Status: ${report.status}${department}${assigned}${priority}
Created: ${new Date(report.created_at).toISOString()}
Type MENU to return.`;
  }

  if (key === '1' || key === 'services') {
    return 'Council service topics:\n• Trading licences\n• Local revenue and fees\n• Building and planning enquiries\n• Waste collection and sanitation\n\nApproved requirements, fees, and office hours have not been configured. Type 5 to save an assistance request, or MENU.';
  }

  if (['2','5','report','help','staff'].includes(key)) {
    session.type = ['2','report'].includes(key) ? 'Issue report' : 'Staff assistance';
    session.step = 'consent';
    return 'This pilot stores your conversation identifier, location, description, submission time, and report status in the central FPCC pilot database. It does not yet guarantee that a council officer has been assigned. For emergencies, contact the appropriate emergency service directly.\n\nReply YES to continue, or CANCEL to stop.';
  }

  if (key === '3' || key === 'track') {
    session.step = 'track';
    return 'Enter your report reference (for example FP-1234ABCD).';
  }

  if (key === '4' || key === 'contacts') {
    return 'Steven — Senior Communication Officer, FPCC\nWhatsApp / telephone: +256 782 442866\nOpen WhatsApp: https://wa.me/256782442866\n\nKazooba Joseph — Snr ICT Officer\nWhatsApp / telephone: +256 703 090388\nOpen WhatsApp: https://wa.me/256703090388\n\nEng. Benard Bright — ICT Officer\nWhatsApp / telephone: +256 779 079089\nOpen WhatsApp: https://wa.me/256779079089\n\nContacts supplied by the project owner. Reports are stored centrally, but automatic officer assignment is not yet enabled. Type MENU to return.';
  }

  if (key === '6' || key === 'privacy') {
    return 'Prototype privacy: report details are stored in the central FPCC pilot database. Reports may include a conversation identifier (your phone number when connected to WhatsApp), location, description, source, status, and time. Conversation state and WhatsApp message de-duplication remain stored locally by the application. No automatic deletion policy is configured yet. Do not submit sensitive personal information. Type MENU to return.';
  }

  return menu;
}
