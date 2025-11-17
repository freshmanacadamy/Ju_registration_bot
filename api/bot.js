require('dotenv').config();
const { Telegraf, session, Markup } = require('telegraf');

// Import all modules
const config = require('../lib/config');
const database = require('../lib/database');
const notification = require('../lib/notification');
const registration = require('../lib/registration');
const payment = require('../lib/payment');
const referral = require('../lib/referral');
const admin = require('../lib/admin');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Set bot instance for notifications
notification.setBot(bot);

// Middleware
bot.use(session());
bot.use(async (ctx, next) => {
  // Initialize session
  ctx.session = ctx.session || {};
  
  // Get user data
  const userData = await database.getUser(ctx.from?.id);
  ctx.userData = userData;
  
  // Check if user is blocked
  if (userData?.status === config.CONFIG.USER.STATUS.BLOCKED) {
    await ctx.reply('❌ Your account has been blocked. Contact admin for support.');
    return;
  }
  
  // Check maintenance mode
  if (config.botSettings.status === config.CONFIG.BOT.STATUS.MAINTENANCE && !admin.isAdmin(ctx.from?.id)) {
    await ctx.reply(config.botSettings.maintenance_message);
    return;
  }
  
  await next();
});

// ==================== START COMMAND ====================
bot.start(async (ctx) => {
  await registration.handleReferralStart(ctx);
  
  // If user exists, show main menu immediately
  if (ctx.userData) {
    await showMainMenu(ctx);
  } else {
    // New user - show welcome with main menu
    await ctx.replyWithMarkdown(
      `🎓 *Welcome to JU Tutorial Classes!*\n\n` +
      `Join our tutorial classes and earn through our referral program!\n\n` +
      `💰 *Registration Fee:* 500 ETB\n` +
      `👥 *Earn:* 30 ETB per successful referral\n` +
      `💸 *Withdraw:* After 4+ paid referrals\n\n` +
      `Choose an option to get started:`
    );
    await showMainMenu(ctx);
  }
});

// ==================== MAIN MENU BUTTONS ====================
async function showMainMenu(ctx) {
  const menuText = `🎓 *JU Tutorial Classes*\n\nChoose an option:`;
  
  const buttons = [
    ['💰 Balance', '👥 My Referrals'],
    ['🏆 Leaderboard', '💸 Withdraw']
  ];
  
  // Add Register button only for new users
  if (!ctx.userData) {
    buttons.push(['📝 Register for Classes']);
  }
  
  // Add Admin button only for admins
  if (admin.isAdmin(ctx.from.id)) {
    buttons.push(['🔧 Admin']);
  } else {
    buttons.push(['⚙️ Settings']);
  }
  
  const keyboard = Markup.keyboard(buttons).resize();
  
  await ctx.replyWithMarkdown(menuText, keyboard);
}

bot.command('menu', async (ctx) => {
  await showMainMenu(ctx);
});

// ==================== REGISTRATION BUTTON ====================
bot.hears('📝 Register for Classes', async (ctx) => {
  if (!ctx.userData) {
    await registration.startRegistration(ctx);
  } else {
    await ctx.reply('❌ You are already registered! Use the menu above.');
  }
});

// ==================== TEXT HANDLER ====================
bot.on('text', async (ctx) => {
  // Handle registration steps
  if (ctx.session.registration) {
    await registration.handleRegistrationStep(ctx);
    return;
  }
  
  // Handle payment rejection reason
  if (ctx.session.rejectingPayment) {
    await payment.handlePaymentRejection(ctx, ctx.message.text);
    return;
  }
  
  // Handle admin messaging
  if (ctx.session.messagingUser) {
    await admin.sendUserMessage(ctx, ctx.message.text);
    return;
  }
  
  // Handle withdrawal amount
  if (ctx.session.withdrawal && ctx.session.withdrawal.step === 'amount') {
    await referral.processWithdrawalAmount(ctx, ctx.message.text);
    return;
  }
  
  // Handle Telebirr phone
  if (ctx.session.withdrawal && ctx.session.withdrawal.step === 'phone') {
    await referral.processTelebirrPhone(ctx, ctx.message.text);
    return;
  }
  
  // Handle CBE account number
  if (ctx.session.withdrawal && ctx.session.withdrawal.step === 'account') {
    await referral.processCBEDetails(ctx, ctx.message.text);
    return;
  }
  
  // Handle CBE account name
  if (ctx.session.withdrawal && ctx.session.withdrawal.step === 'name') {
    await referral.processCBEAccountName(ctx, ctx.message.text);
    return;
  }
});

// ==================== CONTACT SHARING HANDLER ====================
bot.on('contact', async (ctx) => {
  // Handle contact sharing during registration
  if (ctx.session.registration && ctx.session.registration.step === 2) {
    const session = ctx.session.registration;
    session.data.contactNumber = `+${ctx.message.contact.phone_number}`;
    session.step = 3;
    
    await ctx.replyWithMarkdown(
      `✅ Contact saved: ${session.data.contactNumber}\n\n` +
      `📝 *Registration Form - Step 3/4*\n\n` +
      `Please enter your JU ID (Format: RU1234/18):`,
      Markup.removeKeyboard()
    );
  }
});

// ==================== STREAM SELECTION ====================
bot.action(/stream_(natural|social)/, async (ctx) => {
  const stream = ctx.match[1];
  await registration.handleStreamSelection(ctx, stream);
});

// ==================== PAYMENT HANDLING ====================
bot.on('photo', async (ctx) => {
  await payment.handlePaymentScreenshot(ctx);
});

// Payment approval
bot.action(/approve_payment_(.+)/, async (ctx) => {
  await payment.approvePayment(ctx, ctx.match[1]);
});

// Payment rejection
bot.action(/reject_payment_(.+)/, async (ctx) => {
  await payment.rejectPayment(ctx, ctx.match[1]);
});

// ==================== BALANCE BUTTON ====================
bot.hears('💰 Balance', async (ctx) => {
  const user = ctx.userData;
  if (!user) {
    await ctx.reply('❌ Please complete registration first.');
    return;
  }
  
  const needed = config.CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS - user.paidReferrals;
  const eligible = user.paidReferrals >= config.CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS;
  
  const balanceText = `💰 *Your Balance*\n\n` +
    `💵 Available Balance: *${user.balance} ETB*\n` +
    `📈 Total Earned: *${user.totalEarned} ETB*\n` +
    `📉 Total Withdrawn: *${user.totalWithdrawn} ETB*\n\n` +
    `👥 Referral Stats:\n` +
    `✅ Paid Referrals: *${user.paidReferrals}*\n` +
    `⏳ Unpaid Referrals: *${user.unpaidReferrals}*\n` +
    `📊 Total Referrals: *${user.totalReferrals}*\n\n` +
    (eligible ? 
      `🎉 *You are eligible for withdrawal!*` : 
      `❌ Need *${needed}* more paid referrals to withdraw`);
  
  await ctx.replyWithMarkdown(balanceText);
});

bot.command('balance', async (ctx) => {
  const user = ctx.userData;
  if (!user) {
    await ctx.reply('❌ Please complete registration first.');
    return;
  }
  
  const needed = config.CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS - user.paidReferrals;
  const eligible = user.paidReferrals >= config.CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS;
  
  const balanceText = `💰 *Your Balance*\n\n` +
    `💵 Available Balance: *${user.balance} ETB*\n` +
    `📈 Total Earned: *${user.totalEarned} ETB*\n` +
    `📉 Total Withdrawn: *${user.totalWithdrawn} ETB*\n\n` +
    `👥 Referral Stats:\n` +
    `✅ Paid Referrals: *${user.paidReferrals}*\n` +
    `⏳ Unpaid Referrals: *${user.unpaidReferrals}*\n` +
    `📊 Total Referrals: *${user.totalReferrals}*\n\n` +
    (eligible ? 
      `🎉 *You are eligible for withdrawal!*` : 
      `❌ Need *${needed}* more paid referrals to withdraw`);
  
  await ctx.replyWithMarkdown(balanceText);
});

// ==================== REFERRAL SYSTEM ====================
bot.hears('👥 My Referrals', async (ctx) => {
  await referral.showReferralInfo(ctx);
});

bot.command('referrals', async (ctx) => {
  await referral.showReferralInfo(ctx);
});

// Leaderboard button
bot.hears('🏆 Leaderboard', async (ctx) => {
  const topUsers = await database.getAllStudents();
  const sortedUsers = topUsers
    .filter(u => u.paidReferrals > 0)
    .sort((a, b) => b.paidReferrals - a.paidReferrals)
    .slice(0, 6);
  
  const currentUser = ctx.userData;
  
  let leaderboardText = `🏆 *Top Referrers*\n\n`;
  
  if (sortedUsers.length === 0) {
    leaderboardText += `No users on leaderboard yet. Be the first!`;
  } else {
    sortedUsers.forEach((user, index) => {
      const rankEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'][index];
      leaderboardText += `${rankEmoji} *${user.fullName}*\n   📊 ${user.paidReferrals} paid referrals\n\n`;
    });
  }
  
  if (currentUser) {
    leaderboardText += `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `*Your Position:* ${currentUser.paidReferrals} paid referrals\n` +
      `*Eligible for Withdrawal:* ${currentUser.paidReferrals >= 4 ? '✅ Yes' : '❌ No'}`;
  }
  
  await ctx.replyWithMarkdown(leaderboardText);
});

// Withdraw button
bot.hears('💸 Withdraw', async (ctx) => {
  await referral.handleWithdrawalRequest(ctx);
});

// Withdrawal methods
bot.action('withdraw_telebirr', async (ctx) => {
  await referral.handleTelebirrWithdrawal(ctx);
});

bot.action('withdraw_cbe', async (ctx) => {
  await referral.handleCBEWithdrawal(ctx);
});

// Withdrawal approval
bot.action(/approve_withdrawal_(.+)/, async (ctx) => {
  await referral.approveWithdrawal(ctx, ctx.match[1]);
});

// Withdrawal rejection
bot.action(/reject_withdrawal_(.+)/, async (ctx) => {
  await ctx.editMessageText(
    `❌ Rejecting withdrawal ${ctx.match[1]}\n\n` +
    `Please send the rejection reason:`
  );
  ctx.session.rejectingWithdrawal = ctx.match[1];
});

// ==================== ADMIN SYSTEM ====================
bot.hears('🔧 Admin', async (ctx) => {
  await admin.showAdminDashboard(ctx);
});

bot.command('admin', async (ctx) => {
  await admin.showAdminDashboard(ctx);
});

// Admin actions
bot.action('admin_back', async (ctx) => {
  await admin.showAdminDashboard(ctx);
});

bot.action('admin_pending_payments', async (ctx) => {
  await admin.showPendingPayments(ctx);
});

bot.action('admin_pending_withdrawals', async (ctx) => {
  await admin.showPendingWithdrawals(ctx);
});

bot.action('admin_user_management', async (ctx) => {
  await admin.showUserManagement(ctx);
});

bot.action('admin_bot_settings', async (ctx) => {
  await admin.showBotSettings(ctx);
});

bot.action('admin_export_data', async (ctx) => {
  await admin.showExportData(ctx);
});

bot.action('admin_export_all_students', async (ctx) => {
  await admin.exportAllStudents(ctx);
});

// User view and message
bot.action(/view_user_(.+)/, async (ctx) => {
  await admin.handleUserView(ctx, ctx.match[1]);
});

bot.action(/message_user_(.+)/, async (ctx) => {
  await admin.handleUserMessage(ctx, ctx.match[1]);
});

// User deletion
bot.action(/admin_delete_user_(.+)/, async (ctx) => {
  await admin.deleteStudent(ctx, ctx.match[1]);
});

// Settings button (for non-admins)
bot.hears('⚙️ Settings', async (ctx) => {
  await ctx.replyWithMarkdown(
    `⚙️ *Settings*\n\n` +
    `For any changes or support, please contact the admin.\n\n` +
    `📞 Contact admin for:\n` +
    `• Profile updates\n` +
    `• Payment issues\n` +
    `• Account problems\n` +
    `• General inquiries`
  );
});

// ==================== HELP COMMAND ====================
bot.help((ctx) => {
  ctx.replyWithMarkdown(`
🎓 *JU Tutorial Classes Bot Help*

*Main Menu Buttons:*
💰 Balance - Check your earnings & referrals
👥 My Referrals - Your referral network & link
🏆 Leaderboard - Top referrers
💸 Withdraw - Request withdrawal
📝 Register - New user registration
🔧 Admin - Admin panel (admins only)

*Registration Process:*
1. Click "Register for Classes"
2. Complete the 4-step form
3. Pay 500 ETB registration fee
4. Send payment screenshot
5. Wait for admin approval

*Referral Program:*
• Earn 30 ETB per successful referral
• Need 4+ paid referrals to withdraw
• Share your referral link with friends

*Support:*
Contact admin through the Settings menu.
  `);
});

// ==================== ERROR HANDLER ====================
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('❌ An error occurred. Please try again or contact admin.');
});

// ==================== VERCEL HANDLER ====================
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).send('OK');
  }
};

// ==================== LOCAL DEVELOPMENT ====================
if (process.env.NODE_ENV === 'development') {
  bot.launch().then(() => {
    console.log('🚀 JU Tutorial Bot started in development mode');
  });
  
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
        }
