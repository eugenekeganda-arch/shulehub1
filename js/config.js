// ShuleHub settings. Fill these in after creating your Supabase project (see README.md, step 3).
// The anon key is designed to be public: the database security rules protect the data.
window.SHULEHUB_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_ID.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_PUBLIC_KEY',

  appName: 'ShuleHub',
  // The address people use to open ShuleHub. It is included in welcome SMS messages.
  appUrl: '',

  // Video and audio calls (Jitsi). meet.jit.si is free and opens the call in a new tab.
  // For calls inside ShuleHub, use your own Jitsi server or 8x8 JaaS and set jitsiEmbed to true.
  jitsiDomain: 'meet.jit.si',
  jitsiEmbed: false,
  jitsiAppId: '', // only for 8x8 JaaS (domain '8x8.vc')

  // Date of the current Terms, Privacy Notice, Cookie Policy and Refund Policy.
  // Change it whenever you change those pages: everyone is then asked to accept again.
  legalVersion: '2026-10-18',

  // YOUR business details. These appear on the legal pages and the Contact page.
  // Every field marked "required" must be filled in before real schools use ShuleHub.
  business: {
    legalName: '',            // required: registered business or company name (or your full name if a sole proprietor)
    tradingName: 'ShuleHub',  // the name people see
    registrationNumber: '',   // required: Business Registration Service (BRS) number
    kraPin: '',               // required for invoicing: KRA PIN
    physicalAddress: '',      // required: building, street, town
    postalAddress: '',        // optional: P.O. Box
    email: '',                // required: support / business email
    phone: '',                // required: business phone
    privacyContactName: '',   // required: person or role who handles data protection requests (e.g. "Data Protection Officer")
    privacyEmail: '',         // required: email for data protection requests
    odpcRegistrationNumber: '', // required once registered with the Office of the Data Protection Commissioner
    databaseLocation: '',     // required: where the database is hosted, e.g. "Supabase on AWS, Frankfurt, Germany"
    kenyaCopyLocation: '',    // where the copy of education data kept in Kenya is held (see README: data localisation)
  },
};
