const admin = require('firebase-admin');

// Firebase configuration
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Constants
const CONFIG = {
  BOT: {
    STATUS: { ACTIVE: 'active', MAINTENANCE: 'maintenance' }
  },
  USER: {
    STATUS: { ACTIVE: 'active', BLOCKED: 'blocked', PENDING: 'pending' }
  },
  PAYMENT: {
    DEFAULT_AMOUNT: 500,
    STATUS: { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' }
  },
  WITHDRAWAL: {
    MIN_PAID_REFERRALS: 4,
    MIN_AMOUNT: 30,
    COMMISSION_PER_REFERRAL: 30,
    STATUS: { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' }
  },
  ADMIN: {
    ROLES: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', MODERATOR: 'moderator' }
  }
};

// Bot settings
let botSettings = {
  status: CONFIG.BOT.STATUS.ACTIVE,
  features: {
    registration: true,
    screenshot_upload: true,
    payments: true,
    referrals: true,
    withdrawals: true
  },
  maintenance_message: '🚧 Bot is under maintenance. Please try again later.',
  payment_methods: {
    telebirr: {
      account_name: 'JU Tutorial Classes',
      account_number: '251912345678',
      active: true,
      instructions: 'Send via Telebirr App to this number'
    },
    cbe: {
      account_name: 'JU Tutorial Classes',
      account_number: '1000123456789',
      active: true,
      instructions: 'Transfer to CBE Account'
    }
  }
};

module.exports = { admin, db, CONFIG, botSettings };
