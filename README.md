# ShuleHub

School management for Kenyan schools. One website, five portals:

| Who | What they get |
|---|---|
| **ShuleHub owner** (you) | Every school on the platform, their plan, trial, suspension, per-term invoices and payments |
| **School leadership** (director, principal, deputy, head teacher, bursar) | Dashboard, learners and parents, staff and roles, a permissions table per role, fees with M-Pesa, results approval and publishing, announcements with SMS, welfare (reported chats), school setup |
| **Teachers** | Daily register, gradebook with CBE levels (EE / ME / AE / BE), Mwalimu AI exam builder, homework, parent video/audio meetings, messages |
| **Learners** | Results and report card, quiz arena with leaderboards and challenges, make-your-own quizzes, Mwalimu AI tutor (hints first, English or Kiswahili), homework, chats with classmates and teachers |
| **Parents** | Each child's report card and progress, school-wide results, fee statement and balance, pay by M-Pesa prompt, request meetings with teachers, messages |

**Before real schools use ShuleHub, read [Legal and compliance](#legal-and-compliance) below.** Some items are legal requirements in Kenya that code alone cannot satisfy.

Nobody signs themselves up. You add a school; the school adds its staff, learners and parents. Learners sign in with their **admission number + school code**, parents and staff with their **phone number** (or email). Everyone gets a temporary password (by SMS when SMS is set up) and chooses their own at first sign-in.

---

## What it is made of

- **Website**: plain HTML, CSS and JavaScript in this folder. No build step. Host it anywhere static, including GitHub Pages. Fonts and the Supabase library are self-hosted in `vendor/`, so visitors' browsers contact no third-party servers. There are no cookies, analytics or trackers.
- **Database, logins and security**: [Supabase](https://supabase.com) (free to start). Security rules in the database make sure each school only sees its own data, and each role only sees what it should. A parent can only ever see their own children.
- **Server functions** (in `supabase/functions`): creating accounts, M-Pesa, SMS and AI. Secret keys live here, never in the website.
- **M-Pesa**: Safaricom Daraja (STK push prompts, plus automatic receipting of manual Paybill payments).
- **SMS**: Africa's Talking.
- **Video and audio calls**: Jitsi (free).
- **Mwalimu AI**: the Claude API.

```
shulehub/
├── index.html              the website
├── vendor/                 self-hosted Supabase library and fonts, with their licences
├── css/styles.css
├── js/
│   ├── config.js           ← you paste your Supabase URL and key here
│   ├── app.js, state.js, lib.js, icons.js
│   └── views/              one file per portal (legal.js = privacy, terms, cookies, refunds, contact)
└── supabase/
    ├── migrations/         database tables and security rules
    ├── functions/          manage-users, mpesa, mpesa-callback, sms, ai
    └── config.toml
```

---

## Setup, step by step

You need: a Supabase account, Node.js installed (for the Supabase command-line tool), and Git/GitHub.

### 1. Create the Supabase project

1. Go to supabase.com, sign up, click **New project**. Choose a region and write it down: it goes into `databaseLocation` in `js/config.js` and the Privacy notice. Supabase has no data centre in Kenya, so read [Data localisation](#1-data-localisation-the-biggest-issue) first. Save the database password somewhere safe.
2. **Authentication → Sign In / Providers → Email**: keep Email on. Turn **off** "Allow new users to sign up" and turn **off** "Confirm email". (Schools create every account, so public sign-up must be off.)

### 2. Create the database

Open **SQL Editor** in Supabase. Paste the whole of `supabase/migrations/20261018000001_schema.sql`, click **Run**. Then do the same with `20261018000002_security.sql` and `20261018000003_retention.sql`.

The third file schedules a daily job that deletes old messages and logs, as the Privacy notice promises. If it prints "pg_cron is not available", enable **pg_cron** under Database → Extensions and run that file again.

(Or with the CLI: `npx supabase link --project-ref YOUR_PROJECT_ID` then `npx supabase db push`.)

### 3. Connect the website

In Supabase go to **Project Settings → API** (or **Data API / API Keys**). Copy the **Project URL** and the **anon public** key into `js/config.js`:

```js
supabaseUrl: 'https://abcdefgh.supabase.co',
supabaseAnonKey: 'eyJhbGciOi...',
appUrl: 'https://yourname.github.io/shulehub',   // where you will host it
```

The anon key is meant to be public. The service-role key is **not**: never put it in the website.

### 4. Make yourself the owner

1. **Authentication → Users → Add user → Create new user**. Use your email and a strong password. Tick "Auto confirm".
2. In **SQL Editor** run:
   ```sql
   select make_super_admin('you@example.com', 'Your Name');
   ```

### 5. Deploy the server functions

In a terminal, inside the `shulehub` folder:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_ID

# required: a long random secret that protects the M-Pesa callback URL
npx supabase secrets set MPESA_CALLBACK_SECRET=$(openssl rand -hex 24)
npx supabase secrets set APP_URL=https://yourname.github.io/shulehub

npx supabase functions deploy manage-users
npx supabase functions deploy mpesa
npx supabase functions deploy mpesa-callback --no-verify-jwt
npx supabase functions deploy sms
npx supabase functions deploy ai
```

(`--no-verify-jwt` is only for `mpesa-callback`, because Safaricom calls it without a ShuleHub login; it checks the secret instead.)

### 6. Put the website online (GitHub Pages)

```bash
git init && git add . && git commit -m "ShuleHub"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/shulehub.git
git push -u origin main
```

On GitHub: **Settings → Pages → Deploy from a branch → main / (root)**. After a minute your site is at `https://YOUR_USERNAME.github.io/shulehub/`.

Back in Supabase: **Authentication → URL Configuration** → set **Site URL** to that address and add it under **Redirect URLs** (needed for "reset by email").

### 7. Fill in your business details

Open `js/config.js` and complete the `business` section: registered name, BRS number, KRA PIN, address, contact details, data protection contact, ODPC registration number, database location and the location of the Kenyan copy. Until you do, every legal page shows a red **Draft** warning listing what is missing. Do not invent these details.

### 8. Try it

1. Open the site, sign in as yourself. You are the owner.
2. **Schools → Add a school**. You get the first principal's sign-in details.
3. Sign in as that principal (another browser or a private window). Follow **Getting started** on the dashboard: add the term, classes, staff, who teaches what, then learners with their parents.
4. **Fees**: add fee items for the term, then **Bill learners for this term**.
5. **Results**: create an exam. Teachers enter marks in their **Gradebook** and submit. You publish. Parents and learners see report cards.

---

## Optional services

Everything works without these; the matching features show a friendly "not set up yet" message until you add them.

### SMS (Africa's Talking)
Sign up at africastalking.com. Start with the sandbox (username `sandbox`), then apply for a live account and an alphanumeric **sender ID** (e.g. `JACARANDA`).
```bash
npx supabase secrets set AT_USERNAME=your_username AT_API_KEY=your_key AT_SENDER_ID=YOURSENDER
```
Used for: welcome messages with sign-in details, password resets, announcements, fee reminders and meeting bookings. Messages containing passwords are never written to the SMS log. ShuleHub sends no marketing SMS; keep it that way unless you add proper opt-in consent.

### M-Pesa (Safaricom Daraja)
1. Create an app at developer.safaricom.co.ke. Test with the **sandbox** first: shortcode `174379`, the sandbox passkey, and your app's consumer key and secret.
2. In ShuleHub, sign in as the principal → **Setup → M-Pesa** and paste the four values (sandbox).
3. As a parent, **Fees → Send M-Pesa prompt** to a test number. The payment appears on the statement once Safaricom confirms it.
4. For real money the school needs its own Paybill (or Till) and must "Go Live" on the Daraja portal. Then switch the environment to Production with the live keys, and press **Receipt manual Paybill payments automatically** so parents who pay by Paybill (account = admission number) are receipted too. Payments with an unknown account number appear on the Fees page for the bursar to assign.

Each school uses its own Paybill, so fee money goes straight to the school, not through you.

### Mwalimu AI (Claude API)
Create a key at console.anthropic.com, add credit, then:
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional: choose models (defaults shown)
npx supabase secrets set AI_MODEL_TUTOR=claude-haiku-5-5 AI_MODEL_EXAM=claude-sonnet-5-5
```
AI is available to schools on trial and on plans with the "Mwalimu AI" feature (Premium by default). For learners it is **off** until the school switches it on (Setup) **and** a parent allows it for their child (parent Home page). Each person is limited to 60 tutor questions and 25 exam drafts per day (change `LIMITS` in `supabase/functions/ai/index.ts`). No names or account details are sent to the AI service: only the question, grade and learning area. The tutor gives hints before answers, stays on schoolwork, and points learners who seem upset to a trusted adult or Childline Kenya (116, free, 24 hours). Review Anthropic's current commercial terms and data retention for API use before switching it on.

### Video and audio calls (Jitsi)
By default calls open on meet.jit.si in a new tab. meet.jit.si is a public service run by 8x8 with its own terms and privacy policy, and it may ask the first person to sign in before the call starts. For a service you control, use your own Jitsi server (ideally hosted in Kenya) or 8x8 JaaS (check its current pricing), then in `js/config.js` set `jitsiDomain`, `jitsiEmbed: true` and, for JaaS, `jitsiAppId`.

---

## How permissions work

- Directors always have every permission.
- Principal, deputy, head teacher and bursar get sensible defaults when a school is created. The principal can change them under **Staff & roles → What each role can do** (for example, let the deputy record payments).
- Teachers can take registers and enter marks only for the classes and learning areas they are assigned to under **Who teaches what**. Leaders who are assigned classes also see the teaching tools.
- Learner chat is **off** until the school switches it on (Setup) **and** a parent allows it for their child. Then learners can chat with classmates and their teachers. Parents can message staff. Learners cannot message parents, and parents cannot message learners. Learners can report a chat; the welfare team (principal and deputy by default) can read reported conversations.
- Only a parent or guardian can switch chat or Mwalimu AI **on** for a learner. Staff can switch them off.
- Suspending a school (owner) locks everyone at that school out immediately, without deleting anything.

All of this is enforced inside the database, not just hidden in the website.

---

## Running costs

Every service below charges differently and prices change, so check each provider's current pricing page before you set your own prices: Supabase (the free tier is for testing; use a paid plan with backups once schools rely on it), your website host, Africa's Talking (per SMS), Safaricom (Paybill charges, paid by the school) and Anthropic (per AI request).

---

## Legal and compliance

I am not a lawyer and this is not legal advice. This section lists what was checked and what is still on you. **Have a Kenyan advocate who handles data protection review the legal pages and these points before launch.**

### What the code now does
- **Privacy notice, Terms of service, Cookie policy, Refund policy, Contact page**: in `js/views/legal.js`, at `#/privacy`, `#/terms`, `#/cookies`, `#/refunds`, `#/contact`. Linked from the sign-in page, every legal page and the side menu.
- **Acceptance records**: everyone accepts the terms and privacy notice at first sign-in, and again whenever you change `legalVersion` in `js/config.js`. Directors or principals also accept on behalf of the school. Dates are stored.
- **Parental consent (Data Protection Act s.33)**: a learner cannot be admitted, singly or by CSV, without the school confirming a parent or guardian consented and how. This is recorded on the learner.
- **Off by default for children**: learner chat and Mwalimu AI are off until the school **and** a parent turn them on. Parents can withdraw at any time.
- **Data minimisation**: gender, date of birth and NEMIS UPI were removed (gender is "sensitive personal data" in Kenyan law, and ShuleHub did not use any of them). Payer phone numbers and raw M-Pesa payloads are no longer stored. AI requests carry no names.
- **Retention**: old messages, logs and requests are deleted automatically (see the Privacy notice table).
- **Rights**: everyone can download their data (My account). Schools can export everything (Setup), delete a learner, delete staff or parent accounts. The owner can delete a whole school.
- **No cookies, analytics, trackers, ads or third-party scripts.** Fonts and libraries are self-hosted. Session storage is strictly necessary, so **no cookie consent banner is needed**. If you ever add analytics, add a consent banner first.
- **No images**, so no image copyright risk. Fonts are under the SIL Open Font License and supabase-js under MIT; licence files are in `vendor/`. Icons are original. There are no reviews or testimonials anywhere.
- **Accessibility**: colour contrast measured in both themes (text at least 4.5:1, icons at least 3:1), skip link, visible focus, focus moves to each new page and is held inside dialogs, every form control labelled, charts described for screen readers, quiz timer can be switched off, larger touch targets.

### What you must still do (the code cannot do these)

#### 1. Data localisation (the biggest issue)
The Data Protection (General) Regulations, 2021 (regulation 26, under section 50 of the Act) require personal data processed for **early childhood and basic education** to be processed through a server and data centre in Kenya, **or** for at least one serving copy to be stored in a data centre in Kenya. Supabase's cloud has no Kenyan region. Options:
- Self-host Supabase (it is open source) on a server in a Kenyan data centre. This is the cleanest option.
- Keep Supabase cloud and keep a continuously updated copy in a Kenyan data centre. Ask your advocate whether the arrangement you choose counts as a "serving copy".
Then fill in `databaseLocation` and `kenyaCopyLocation` in `js/config.js`.

#### 2. Register with the ODPC
Education is on the list of sectors that must register with the Office of the Data Protection Commissioner whatever their size (registration certificates last two years). Each school must register as a data controller; you should register as a data processor (and as a controller for your own business data). Put your registration number in `js/config.js`.

#### 3. Agreements
- **With each school**: the Terms of service plus a written data processing agreement (what you process, on whose instructions, security, breach notice within 48 hours, deletion at the end).
- **With your processors**: accept and keep copies of Supabase's, Anthropic's, Africa's Talking's and Safaricom's data processing terms. For data leaving Kenya, use the transfer safeguards the ODPC requires (it has published standard contractual clauses) and keep a record of each transfer.

#### 4. Data protection impact assessment (DPIA)
Children's data is high risk. Write a DPIA before launch covering chat, Mwalimu AI and cross-border hosting, and give schools a summary. The ODPC's guidance on children's data expects one.

#### 5. Consent forms
Give schools a paper or digital consent form for parents that matches the Privacy notice. ShuleHub records that consent was obtained; the school keeps the signed form.

#### 6. Business details and promises
Fill in every business field. The policies promise replies to data requests within 7 days, refunds within 14 days and breach notice to schools within 48 hours. Change them if you cannot keep them, then bump `legalVersion`.

#### 7. Name check
Search the Business Registration Service and the Kenya Industrial Property Institute (KIPI) for "ShuleHub" before you register it as a business name or trademark. Other Kenyan school products may use similar names.

#### 8. Records schools must keep
Deleting a learner deletes their fee records too. Schools may have to keep accounting records for several years under Kenyan tax law, so tell bursars to download statements before deleting, and let schools' accountants advise.

#### 9. Security before launch
Turn on backups and test a restore. Turn on multi-factor authentication for your own Supabase account and the owner login. Keep the service-role key secret. Check function logs regularly. If a breach happens, the data controller (the school) must notify the ODPC within 72 hours where there is a real risk of harm, so you must tell the school without delay.

### Other risks to know about
- **Welcome SMS contain temporary passwords.** They are only valid until first sign-in, and are not logged, but an SMS can be read by anyone holding the phone.
- **Learners using chat** is the highest-risk feature for child safety. Keep it off unless a school has a clear safeguarding process, and make sure someone checks the Welfare page.
- **AI answers can be wrong.** The terms say so, teachers must review AI-drafted papers, and AI never sets marks.
- **meet.jit.si** is a third-party service outside your control; self-host for production.
- **The Consumer Protection Act, 2012** gives consumers rights that cannot be signed away; the Terms do not try to.

### Sources used for this checklist
- ODPC, Guidance Note for Processing Children's Data (2025): odpc.go.ke
- ODPC, Guidance Note on Registration of Data Controllers and Data Processors: odpc.go.ke
- DLA Piper, Data Protection Laws of the World: Kenya
- Afriwise, The data protection regulations, 2021: key points
- Captain Compliance, Kenya's ODPC 2026 cross-border transfer guidance
- CIPIT (Strathmore), E-Commerce and the Law in Kenya: Consumer Protection
- Child Helpline International: Childline Kenya, 116

Check these against the current Act and ODPC publications: the law and guidance change.

---

## Before real schools use it

- Complete everything under **What you must still do**.
- Turn on Supabase backups and test restoring one.
- Start with one school in a pilot term before onboarding others.

## Troubleshooting

- **Red "Draft" box on legal pages**: fill in the `business` section of `js/config.js`.

- **"The manage-users service is not reachable"**: deploy the functions (step 5).
- **"Your role does not allow this"**: the person's role lacks that permission; change it under Staff & roles.
- **A learner cannot sign in**: they need the admission number exactly as entered, plus the school code. A leader can reset the password from the learner's page.
- **Tables not visible to the website** in a brand-new Supabase project: under Project Settings → Data API, make sure the `public` schema is exposed.
- **Check server errors**: Supabase → Edge Functions → choose the function → Logs.
