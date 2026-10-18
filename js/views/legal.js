// Public legal pages: privacy notice, terms, cookie policy, refund policy, business details.
// They can be opened without signing in, at #/privacy, #/terms, #/cookies, #/refunds and #/contact.
// Text uses the business details from js/config.js. Have a Kenyan advocate review these pages before launch.
import { CONFIG, esc, fmtD } from '../lib.js';

const B = () => CONFIG.business || {};
const NAME = () => esc(B().tradingName || CONFIG.appName || 'ShuleHub');
const VERSION = () => CONFIG.legalVersion || '';
const REQUIRED = [['legalName', 'Registered business name'], ['registrationNumber', 'BRS registration number'], ['physicalAddress', 'Physical address'], ['email', 'Business email'], ['phone', 'Business phone'], ['privacyContactName', 'Data protection contact'], ['privacyEmail', 'Data protection email'], ['odpcRegistrationNumber', 'ODPC registration number'], ['databaseLocation', 'Database location'], ['kenyaCopyLocation', 'Location of the Kenyan copy of education data']];
export const missingBusiness = () => REQUIRED.filter(([k]) => !String(B()[k] || '').trim());

/** Show a value, or a visible placeholder if the owner has not filled it in yet. */
const v = (k, label) => { const x = String(B()[k] || '').trim(); return x ? esc(x) : `<mark class="missing">[${esc(label)} not yet provided]</mark>`; };
const operator = () => `${v('legalName', 'Registered business name')}${B().tradingName ? `, trading as ${esc(B().tradingName)}` : ''}`;
const privacyContact = () => `${v('privacyContactName', 'Data protection contact')}, ${v('privacyEmail', 'Data protection email')}`;

export const LEGAL_PAGES = [['privacy', 'Privacy notice'], ['terms', 'Terms of service'], ['cookies', 'Cookie policy'], ['refunds', 'Refund policy'], ['contact', 'Contact and business details']];
export const legalFooter = () => `<nav class="legal-links" aria-label="Legal">${LEGAL_PAGES.map(([id, l]) => `<a href="#/${id}">${l}</a>`).join('')}</nav>`;

function page(title, body) {
  const miss = missingBusiness();
  return `<div class="legal"><header class="legal-head"><a class="brand" href="#/" aria-label="Back to ${NAME()}"><span class="mark" aria-hidden="true">S</span><b>${NAME()}</b></a><a class="btn ghost sm" href="#/">Back</a></header>
  ${miss.length ? `<div class="note bad" role="note"><b>Draft:</b> these business details still need to be filled in by ${NAME()}: ${miss.map(([, l]) => esc(l)).join(', ')}.</div>` : ''}
  <article class="prose"><h1>${title}</h1><p class="muted">Version ${esc(VERSION())}${VERSION() ? ` (${fmtD(VERSION())})` : ''}</p>${body}</article>${legalFooter()}</div>`;
}

const privacy = () => page('Privacy notice', `
<p>This notice explains what personal data ${NAME()} handles, why, who it is shared with, how long it is kept, and the rights you have under Kenya's <b>Data Protection Act, 2019</b>.</p>

<h2 id="simple">In simple words (for learners)</h2>
<ul>
<li>Your school uses ${NAME()} to keep your marks, attendance, homework and fees in one place.</li>
<li>Only you, your parents or guardians, and your school's staff can see your records. Other learners cannot.</li>
<li>Chats and Mwalimu AI are switched off unless your school <b>and</b> your parent or guardian turn them on.</li>
<li>Mwalimu AI does not get your name. Do not type your full name, phone number or home address into it.</li>
<li>If something in a chat upsets you, press <b>Report</b> or tell a teacher. You can also call Childline Kenya on <b>116</b> (free, any time).</li>
</ul>

<h2>Who is responsible</h2>
<p>${NAME()} is operated by ${operator()}, ${v('physicalAddress', 'Physical address')}. ODPC registration number: ${v('odpcRegistrationNumber', 'ODPC registration number')}.</p>
<ul>
<li><b>Your school is the data controller</b> for school records: learners, parents, staff, marks, attendance, fees, messages and meetings. The school decides why and how these are used.</li>
<li><b>${NAME()} is the data processor</b> for those records. We store and process them only on the school's instructions and under our agreement with the school.</li>
<li><b>${NAME()} is the data controller</b> for its own business records: schools' subscription contacts, invoices and payments to ${NAME()}.</li>
</ul>
<p>Questions or requests: contact your school first. You can also write to our data protection contact: ${privacyContact()}.</p>

<h2>What we collect</h2>
<table class="legal-table"><thead><tr><th scope="col">Who</th><th scope="col">Data</th></tr></thead><tbody>
<tr><td>Everyone with an account</td><td>Name, role, school, sign-in identifier (email, phone number or admission number), password (stored only as a hash by our authentication provider), phone number if given, when you accepted these terms, messages you send and receive.</td></tr>
<tr><td>Learners</td><td>Admission number, class, marks and performance levels, attendance, homework, quiz scores, fee charges and payments, a record of how parental consent was obtained, and whether chat and Mwalimu AI are allowed.</td></tr>
<tr><td>Parents and guardians</td><td>Name, phone and/or email, relationship to the learner, meetings booked, M-Pesa payment requests you start (phone number, amount, M-Pesa receipt).</td></tr>
<tr><td>Staff</td><td>Name, role, phone and/or email, classes and subjects taught, marks entered, registers taken.</td></tr>
<tr><td>Schools</td><td>School name, code, county, contact phone and email, Paybill number, plan, invoices and payments to ${NAME()}.</td></tr>
</tbody></table>
<p>We do <b>not</b> collect learners' gender, date of birth, photos, health information, religion, ethnicity or home address. We do not use advertising, tracking or analytics tools.</p>

<h2>Why we use it, and the legal basis</h2>
<ul>
<li><b>Running the school's records and communication</b> (registers, marks, report cards, fees, announcements, meetings): on the school's instructions, for the performance of the school's agreement with ${NAME()} and the school's legitimate interests and legal duties in providing education.</li>
<li><b>Children's data</b>: under section 33 of the Act, the school must obtain consent from a parent or guardian before admitting a learner to ${NAME()}. The school records when and how that consent was given.</li>
<li><b>Optional features for learners</b> (chat and Mwalimu AI): only with the parent or guardian's consent, given in the parent portal, and only if the school has switched the feature on. A parent can withdraw it at any time in the same place.</li>
<li><b>SMS</b> (sign-in details, announcements, fee reminders, meeting notices): to deliver the service the school asked for. We never send marketing messages.</li>
<li><b>Billing schools</b>: performance of our contract and our legal duties to keep accounting records.</li>
<li><b>Security</b> (preventing misuse, investigating reported chats): legitimate interests and the safety of children.</li>
</ul>
<p>We do not sell personal data, use it for advertising, or profile learners. Performance levels (EE, ME, AE, BE) are worked out from marks that teachers enter and check; no decision about a learner is made by a computer alone.</p>

<h2>Who we share it with</h2>
<p>Only these service providers, and only what each needs to do its job:</p>
<table class="legal-table"><thead><tr><th scope="col">Provider</th><th scope="col">What for</th><th scope="col">Data involved</th></tr></thead><tbody>
<tr><td>Supabase (database, sign-in and server functions)</td><td>Storing and serving all ${NAME()} data</td><td>All of the above. Location: ${v('databaseLocation', 'Database location')}.</td></tr>
<tr><td>Website host (for example GitHub Pages)</td><td>Delivering the website files</td><td>Your IP address and browser details in the host's server logs. The host receives no school records.</td></tr>
<tr><td>Safaricom PLC (M-Pesa Daraja), if your school connects it</td><td>Fee payments by M-Pesa</td><td>Phone number, amount, learner admission number as the account reference, receipt.</td></tr>
<tr><td>Africa's Talking, if your school uses SMS</td><td>Sending SMS</td><td>Phone number and message text.</td></tr>
<tr><td>Anthropic (Claude API), if Mwalimu AI is on</td><td>Answering learner questions and drafting exam questions for teachers</td><td>The question text, the learner's grade and learning area. No names or account details are sent.</td></tr>
<tr><td>Jitsi (meet.jit.si or the call service your school uses)</td><td>Video and audio meetings</td><td>Your display name, audio and video during the call, and data the call service collects under its own privacy policy.</td></tr>
</tbody></table>
<p>We may also disclose data where Kenyan law requires it, for example to the Office of the Data Protection Commissioner or under a court order.</p>

<h2>Where the data is kept</h2>
<p>The ${NAME()} database is hosted at: ${v('databaseLocation', 'Database location')}. Where this is outside Kenya, we transfer data only with the safeguards required by sections 48 to 50 of the Act and the Data Protection (General) Regulations, 2021. Kenyan regulations require personal data processed for basic education to be processed in Kenya, or for at least one serving copy to be kept in a data centre in Kenya. That copy is kept at: ${v('kenyaCopyLocation', 'Location of the Kenyan copy')}. Mwalimu AI questions are processed by Anthropic in the United States.</p>

<h2>How long we keep it</h2>
<table class="legal-table"><thead><tr><th scope="col">Record</th><th scope="col">Kept for</th></tr></thead><tbody>
<tr><td>Chat messages</td><td>12 months, then deleted automatically</td></tr>
<tr><td>Resolved chat reports, meetings, quiz scores</td><td>24 months, then deleted automatically</td></tr>
<tr><td>SMS log, M-Pesa payment requests</td><td>12 months, then deleted automatically</td></tr>
<tr><td>Mwalimu AI usage counts (not the questions)</td><td>90 days. ${NAME()} does not store the questions or answers.</td></tr>
<tr><td>Marks, attendance, homework, fee records</td><td>While the learner is at the school, then as the school's own retention schedule requires. The school can delete a learner's records at any time.</td></tr>
<tr><td>Accounts</td><td>Until the school deletes them, or the school leaves ${NAME()}</td></tr>
<tr><td>All data of a school that leaves ${NAME()}</td><td>Deleted within 90 days of the end of the agreement, after the school has had the chance to export it</td></tr>
</tbody></table>

<h2>How we protect it</h2>
<ul>
<li>Every request is checked inside the database: each school can only reach its own records, and each role only what it is allowed to see. A parent can only see their own children.</li>
<li>Connections use HTTPS. Passwords are never stored in readable form. Everyone chooses their own password at first sign-in.</li>
<li>M-Pesa keys and other secrets are kept on the server and are never shown in the browser.</li>
<li>Learners can report chats; the school's welfare team can review reported conversations.</li>
</ul>
<p>If a personal data breach puts people at real risk, ${NAME()} will tell the affected school without delay (and within 48 hours), and the data controller will notify the Data Protection Commissioner within 72 hours as section 43 of the Act requires, and tell affected people where required.</p>

<h2>Your rights</h2>
<p>Under the Data Protection Act, 2019 you have the right to be informed about how your data is used; to access it; to object to its use; to have false or misleading data corrected or deleted; to have data deleted where there is no longer a lawful reason to keep it; and to receive your data in a portable format. Parents and guardians exercise these rights for their children.</p>
<ul>
<li><b>See or download your data</b>: signed in, go to <b>My account → Download my data</b>.</li>
<li><b>Correct or delete data</b>: ask your school office. Schools can correct and delete records in ${NAME()}.</li>
<li><b>Withdraw consent for chat or Mwalimu AI</b>: parents can switch these off for each child on their Home page.</li>
<li>If your school cannot help, contact ${privacyContact()}. We reply within 7 days.</li>
<li>You can complain to the Office of the Data Protection Commissioner (ODPC), www.odpc.go.ke.</li>
</ul>

<h2>Changes to this notice</h2>
<p>When this notice changes, the version date above changes and everyone is asked to read and accept it again the next time they sign in.</p>`);

const terms = () => page('Terms of service', `
<p>These terms are an agreement between ${operator()} ("${NAME()}", "we") and the school that subscribes to ${NAME()} (the "school"). They also set the rules for everyone who uses a ${NAME()} account given to them by a school ("users").</p>

<h2>1. The service</h2>
<p>${NAME()} is an online school management service: records of learners, staff and parents, registers, marks and report cards, fees and M-Pesa payments, announcements and SMS, messages, meetings, quizzes and the Mwalimu AI assistant. Some features depend on the school's plan and on the school connecting third-party services (M-Pesa, SMS).</p>

<h2>2. Accounts</h2>
<ul>
<li>Accounts are created by the school. Nobody can sign themselves up.</li>
<li>Keep your password private and choose your own at first sign-in. Tell your school straight away if you think someone else knows it.</li>
<li>Learners under 18 may only use ${NAME()} under their school's supervision and with the consent of a parent or guardian, obtained by the school.</li>
</ul>

<h2>3. The school's responsibilities</h2>
<ul>
<li>The school is the data controller for its records. It must have a lawful basis for the data it enters, obtain and record parental consent for every learner before admitting them (Data Protection Act, 2019, section 33), keep its records accurate, and respond to requests from parents, learners and staff.</li>
<li>The school must register with the Office of the Data Protection Commissioner where the law requires it.</li>
<li>The school decides who gets an account and which role and permissions each person has, and must remove access for people who leave.</li>
<li>The school is responsible for its own fee amounts, fee refunds to parents, and its M-Pesa, SMS and other accounts with third parties.</li>
</ul>

<h2>4. Our responsibilities</h2>
<ul>
<li>We process school records only on the school's instructions and as described in the <a href="#/privacy">Privacy notice</a>.</li>
<li>We keep the service running with reasonable skill and care, apply security measures appropriate to children's data, and tell the school without delay about any personal data breach that affects it.</li>
<li>We help the school answer data protection requests and, when the school leaves, give it a copy of its data and then delete it as set out in the Privacy notice.</li>
</ul>

<h2>5. Acceptable use</h2>
<p>You must not:</p>
<ul>
<li>bully, harass, threaten or send sexual or hateful content to anyone, or share someone's personal information without permission;</li>
<li>access, or try to access, accounts or records you are not allowed to see, or interfere with the service (this can be an offence under the Computer Misuse and Cybercrimes Act, 2018);</li>
<li>upload anything you do not have the right to share, or use ${NAME()} for advertising.</li>
</ul>
<p>Schools may suspend accounts that break these rules, and the school's welfare team may review reported chats.</p>

<h2>6. Mwalimu AI</h2>
<p>Mwalimu AI is an assistant powered by a third-party AI model. Its answers and draft questions can be wrong or incomplete. Learners should check important answers with a teacher. Teachers must review AI-drafted exam papers and marking schemes before use. AI is never used to decide a learner's marks. Do not enter personal details into Mwalimu AI.</p>

<h2>7. Fees and payment (schools)</h2>
<ul>
<li>New schools get a free trial. After that, ${NAME()} is billed per school term at the price of the school's plan, shown in the school's <b>${NAME()} plan</b> page before it is charged.</li>
<li>Invoices are due within 14 days. If an invoice is unpaid 30 days after its due date, we may suspend the school's access after giving at least 7 days' written notice. The school's data is kept during suspension.</li>
<li>Refunds are covered by the <a href="#/refunds">Refund policy</a>.</li>
</ul>

<h2>8. Ownership</h2>
<p>The school and its users own the data they put into ${NAME()}. We own the ${NAME()} software and brand. We give the school and its users a non-exclusive right to use ${NAME()} for the school's purposes while the subscription is active.</p>

<h2>9. Ending the agreement</h2>
<p>The school may stop using ${NAME()} at the end of any term by telling us in writing. We may end the agreement with 30 days' written notice, or immediately if the school seriously breaks these terms. Either way, the school can export its data for 30 days, after which we delete it as described in the Privacy notice.</p>

<h2>10. Liability</h2>
<p>We are responsible for losses caused by our breach of these terms or our negligence. Except where the law does not allow it, our total liability to a school in any 12 months is limited to the fees the school paid us in those 12 months, and we are not liable for indirect losses or for services run by third parties (such as M-Pesa, SMS networks or call services). Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or any right that cannot be limited under Kenyan law, including the Consumer Protection Act, 2012.</p>

<h2>11. Changes</h2>
<p>We will give schools at least 30 days' notice of changes to these terms that affect them. The new version date appears above, and users are asked to accept it the next time they sign in.</p>

<h2>12. Law and disputes</h2>
<p>These terms are governed by the laws of Kenya. If a dispute arises, we will first try to resolve it by discussion within 30 days. If that fails, the courts of Kenya have jurisdiction.</p>

<h2>13. Contact</h2>
<p>${operator()}, ${v('physicalAddress', 'Physical address')}. Email ${v('email', 'Business email')}, phone ${v('phone', 'Business phone')}.</p>`);

const cookies = () => page('Cookie policy', `
<p><b>${NAME()} does not use cookies</b>, and it does not use analytics, advertising or tracking tools.</p>
<h2>What we store on your device</h2>
<table class="legal-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Purpose</th><th scope="col">How long</th></tr></thead><tbody>
<tr><td><code>sb-…-auth-token</code></td><td>Browser local storage</td><td>Keeps you signed in. Without it you would have to sign in on every page. Strictly necessary.</td><td>Until you sign out (signing out removes it)</td></tr>
</tbody></table>
<p>Because this storage is strictly necessary for the service you asked for, and nothing else is stored, ${NAME()} does not show a cookie consent banner. If we ever add anything that is not strictly necessary, we will ask for your consent first and update this page.</p>
<h2>Other services</h2>
<ul>
<li>Fonts and program files are served from the ${NAME()} website itself, not from third-party servers.</li>
<li>When you join a video or audio meeting, the call opens on the call service (for example meet.jit.si), which may set its own cookies under its own policy.</li>
<li>The company hosting the website may record your IP address in its server logs for security.</li>
</ul>
<h2>Clearing it</h2>
<p>Sign out, or clear site data for ${NAME()} in your browser settings.</p>`);

const refunds = () => page('Refund policy', `
<p>This policy covers payments that <b>schools</b> make to ${NAME()} for their subscription.</p>
<h2>School fees paid by parents</h2>
<p>Fees that parents pay through M-Pesa go directly to the school's own Paybill or Till, not to ${NAME()}. ${NAME()} cannot reverse or refund school fees. For a refund of school fees, or a payment sent to the wrong account number, contact the school's bursar. For an M-Pesa transaction sent in error, you can also contact Safaricom.</p>
<h2>Free trial</h2>
<p>The trial is free. Nothing is charged unless the school chooses a plan.</p>
<h2>Subscription payments</h2>
<ul>
<li><b>Cancelling at the start of a term</b>: if a school cancels in writing within 14 days of the invoice date for a term, we refund that term's payment in full.</li>
<li><b>After 14 days</b>: the term is not refundable, and access continues to the end of the term.</li>
<li><b>Service problems</b>: if ${NAME()} is unavailable through our fault for more than 3 school days in a row, the school can ask for a credit for those days on the next invoice, or a refund for those days if it is leaving.</li>
<li><b>Paying twice or too much</b>: we refund the extra amount in full.</li>
<li><b>If we end the agreement</b> without the school being at fault, we refund the unused part of the term.</li>
</ul>
<h2>How to ask</h2>
<p>Email ${v('email', 'Business email')} with the school name, invoice and payment reference. We reply within 5 working days and pay approved refunds within 14 days, to the account the payment came from (M-Pesa or bank).</p>
<p>This policy does not take away any right a school or person has under Kenyan law.</p>`);

const contact = () => page('Contact and business details', `
<table class="legal-table"><tbody>
<tr><th scope="row">Service</th><td>${NAME()}</td></tr>
<tr><th scope="row">Operated by</th><td>${v('legalName', 'Registered business name')}</td></tr>
<tr><th scope="row">Registration number</th><td>${v('registrationNumber', 'BRS registration number')}</td></tr>
<tr><th scope="row">KRA PIN</th><td>${v('kraPin', 'KRA PIN')}</td></tr>
<tr><th scope="row">Physical address</th><td>${v('physicalAddress', 'Physical address')}</td></tr>
${B().postalAddress ? `<tr><th scope="row">Postal address</th><td>${esc(B().postalAddress)}</td></tr>` : ''}
<tr><th scope="row">Email</th><td>${v('email', 'Business email')}</td></tr>
<tr><th scope="row">Phone</th><td>${v('phone', 'Business phone')}</td></tr>
<tr><th scope="row">Data protection contact</th><td>${privacyContact()}</td></tr>
<tr><th scope="row">ODPC registration</th><td>${v('odpcRegistrationNumber', 'ODPC registration number')}</td></tr>
</tbody></table>
<p>Learners and parents: for questions about marks, fees, accounts or passwords, please contact your school office first.</p>
<h2>Credits</h2>
<p>Fonts: Bricolage Grotesque, Figtree and JetBrains Mono, used under the SIL Open Font License 1.1 (licence files in <code>vendor/fonts</code>). Supabase JavaScript library, MIT License. Icons are original to ${NAME()}. ${NAME()} uses no stock photos or third-party images.</p>`);

export const legalViews = { privacy, terms, cookies, refunds, contact };
