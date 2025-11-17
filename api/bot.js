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
  // Handle withdrawal rejection reason
  if (ctx.session.rejectingWithdrawal) {
    const withdrawalId = ctx.session.rejectingWithdrawal;
    const reason = ctx.message.text;
    
    const withdrawal = await database.getWithdrawal(withdrawalId);
    
    if (withdrawal) {
      await database.updateWithdrawal(withdrawalId, {
        status: 'rejected',
        rejectionReason: reason,
        processedBy: ctx.from.username,
        processedAt: new Date().toISOString()
      });
      
      await notification.notifyWithdrawalRejection(withdrawal.userId, reason);
      await ctx.reply(`✅ Withdrawal ${withdrawalId} rejected with reason.`);
    }
    
    ctx.session.rejectingWithdrawal = null;
    return;
  }

  // Handle payment rejection reason
  if (ctx.session.rejectingPayment) {
    const paymentId = ctx.session.rejectingPayment;
    const reason = ctx.message.text;
    
    const payment = await database.getPayment(paymentId);
    
    if (payment) {
      await database.updatePayment(paymentId, {
        status: 'rejected',
        rejectionReason: reason,
        verifiedBy: ctx.from.username,
        verifiedAt: new Date().toISOString()
      });
      
      await notification.notifyPaymentRejection(payment.userId, reason);
      await ctx.reply(`✅ Payment ${paymentId} rejected with reason.`);
    }
    
    ctx.session.rejectingPayment = null;
    return;
  }
  
  // Handle admin messaging
  if (ctx.session.messagingUser) {
    await admin.sendUserMessage(ctx, ctx.message.text);
    return;
  }
  
  // Handle registration steps
  if (ctx.session.registration) {
    await registration.handleRegistrationStep(ctx);
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

// ==================== REGISTRATION BUTTON HANDLERS ====================
bot.action('registration_home', async (ctx) => {
  ctx.session.registration = null;
  await showMainMenu(ctx);
});

bot.action('registration_cancel', async (ctx) => {
  ctx.session.registration = null;
  await ctx.editMessageText('❌ Registration cancelled. Use /start to begin again.');
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
  
  const balanceText = `💰 *Your Balance*\n\n` +
    `💵 Available Balance: *${user.balance} ETB*\n` +
    `📈 Total Earned: *${user.totalEarned} ETB*\n` +
    `📉 Total Withdrawn: *${user.totalWithdrawn} ETB*\n\n` +
    `👥 Referral Stats:\n` +
    `✅ Paid Referrals: *${user.paidReferrals}*\n` +
    `⏳ Unpaid Referrals: *${user.unpaidReferrals}*\n` +
    `📊 Total Referrals: *${user.totalReferrals}*`;
  
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
  const students = await database.getAllStudents();
  const sortedUsers = students
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

// ==================== ADMIN SYSTEM ====================
bot.hears('🔧 Admin', async (ctx) => {
  await admin.showAdminDashboard(ctx);
});

bot.command('admin', async (ctx) => {
  await admin.showAdminDashboard(ctx);
});

// ==================== ADMIN DASHBOARD BUTTONS ====================
bot.action('admin_back', async (ctx) => {
  await admin.showAdminDashboard(ctx);
});

bot.action('admin_refresh', async (ctx) => {
  await ctx.answerCbQuery('🔄 Refreshing...');
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

// ==================== ADMIN EXPORT BUTTONS ====================
bot.action('admin_export_all_students', async (ctx) => {
  await admin.exportAllStudents(ctx);
});

bot.action('admin_export_natural', async (ctx) => {
  await ctx.answerCbQuery('⏳ Exporting Natural Science students...');
  const students = await database.getStudentsByStream('natural');
  
  let csv = 'Telegram ID,Full Name,Username,Contact,JU ID,Status,Balance,Paid Referrals\n';
  students.forEach(student => {
    csv += `${student.telegramId},"${student.fullName}","${student.username || 'N/A'}","${student.contactNumber}","${student.juId}","${student.status}",${student.balance},${student.paidReferrals}\n`;
  });

  const filename = `natural_students_${new Date().toISOString().split('T')[0]}.csv`;
  
  await ctx.replyWithDocument({
    source: Buffer.from(csv, 'utf8'),
    filename: filename
  }, {
    caption: `📊 Exported: ${filename}\nNatural Science Students: ${students.length}`
  });
});

bot.action('admin_export_social', async (ctx) => {
  await ctx.answerCbQuery('⏳ Exporting Social Science students...');
  const students = await database.getStudentsByStream('social');
  
  let csv = 'Telegram ID,Full Name,Username,Contact,JU ID,Status,Balance,Paid Referrals\n';
  students.forEach(student => {
    csv += `${student.telegramId},"${student.fullName}","${student.username || 'N/A'}","${student.contactNumber}","${student.juId}","${student.status}",${student.balance},${student.paidReferrals}\n`;
  });

  const filename = `social_students_${new Date().toISOString().split('T')[0]}.csv`;
  
  await ctx.replyWithDocument({
    source: Buffer.from(csv, 'utf8'),
    filename: filename
  }, {
    caption: `📊 Exported: ${filename}\nSocial Science Students: ${students.length}`
  });
});

// ==================== ADMIN USER MANAGEMENT BUTTONS ====================
bot.action('admin_search_user', async (ctx) => {
  await ctx.editMessageText(
    '🔍 *Search Student*\n\n' +
    'Send me the student\'s:\n' +
    '• Telegram ID\n' +
    '• JU ID\n' +
    '• Username (without @)\n\n' +
    'I\'ll find their profile.',
    { parse_mode: 'Markdown' }
  );
});

bot.action('admin_list_users', async (ctx) => {
  const students = await database.getAllStudents();
  const recentStudents = students.slice(0, 10);
  
  let userList = '👥 *Recent Students (Last 10)*\n\n';
  
  recentStudents.forEach((student, index) => {
    userList += `${index + 1}. ${student.fullName} (@${student.username || 'no_username'})\n`;
    userList += `   🆔: ${student.telegramId} | 💰: ${student.balance} ETB\n`;
    userList += `   ✅ ${student.paidReferrals} paid | 📊 ${student.totalReferrals} total\n\n`;
  });
  
  userList += `📊 Total Students: ${students.length}`;
  
  await ctx.editMessageText(userList, { parse_mode: 'Markdown' });
});

bot.action('admin_natural_students', async (ctx) => {
  const students = await database.getStudentsByStream('natural');
  const activeStudents = students.filter(s => s.status === 'active');
  
  await ctx.editMessageText(
    `🔬 *Natural Science Students*\n\n` +
    `📊 Statistics:\n` +
    `• Total: ${students.length} students\n` +
    `• Active: ${activeStudents.length} students\n` +
    `• Pending: ${students.length - activeStudents.length} students\n\n` +
    `💰 Total Balance: ${students.reduce((sum, s) => sum + s.balance, 0)} ETB`,
    { parse_mode: 'Markdown' }
  );
});

bot.action('admin_social_students', async (ctx) => {
  const students = await database.getStudentsByStream('social');
  const activeStudents = students.filter(s => s.status === 'active');
  
  await ctx.editMessageText(
    `📚 *Social Science Students*\n\n` +
    `📊 Statistics:\n` +
    `• Total: ${students.length} students\n` +
    `• Active: ${activeStudents.length} students\n` +
    `• Pending: ${students.length - activeStudents.length} students\n\n` +
    `💰 Total Balance: ${students.reduce((sum, s) => sum + s.balance, 0)} ETB`,
    { parse_mode: 'Markdown' }
  );
});

// ==================== ADMIN BOT SETTINGS BUTTONS ====================
bot.action('admin_toggle_bot_status', async (ctx) => {
  const { botSettings, CONFIG } = require('../lib/config');
  
  if (botSettings.status === CONFIG.BOT.STATUS.ACTIVE) {
    botSettings.status = CONFIG.BOT.STATUS.MAINTENANCE;
    await ctx.editMessageText(
      '🔴 *Maintenance Mode Activated*\n\n' +
      'Bot is now in maintenance mode. Only admins can access it.',
      { parse_mode: 'Markdown' }
    );
  } else {
    botSettings.status = CONFIG.BOT.STATUS.ACTIVE;
    await ctx.editMessageText(
      '🟢 *Bot Activated*\n\n' +
      'Bot is now active and accessible to all users.',
      { parse_mode: 'Markdown' }
    );
  }
});

// ==================== ADMIN QUICK ACTION BUTTONS ====================
bot.action(/view_user_(.+)/, async (ctx) => {
  await admin.handleUserView(ctx, ctx.match[1]);
});

bot.action(/message_user_(.+)/, async (ctx) => {
  await admin.handleUserMessage(ctx, ctx.match[1]);
});

bot.action(/block_user_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  const user = await database.getUser(userId);
  
  if (user) {
    await database.updateUser(userId, {
      status: 'blocked',
      blockReason: 'Manual block by admin',
      blockedAt: new Date().toISOString()
    });
    
    await notification.notifyUserBlocked(userId, 'Manual block by admin');
    await ctx.editMessageText(`✅ User ${user.fullName} has been blocked.`);
  } else {
    await ctx.answerCbQuery('❌ User not found.');
  }
});

bot.action(/approve_user_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  const user = await database.getUser(userId);
  
  if (user) {
    await database.updateUser(userId, {
      status: 'active'
    });
    
    await notification.notifyUser(userId, '✅ Your account has been approved by admin!');
    await ctx.editMessageText(`✅ User ${user.fullName} has been approved.`);
  } else {
    await ctx.answerCbQuery('❌ User not found.');
  }
});

// ==================== ADMIN PAYMENT/WITHDRAWAL APPROVAL ====================
bot.action(/approve_payment_(.+)/, async (ctx) => {
  await payment.approvePayment(ctx, ctx.match[1]);
});

bot.action(/reject_payment_(.+)/, async (ctx) => {
  await payment.rejectPayment(ctx, ctx.match[1]);
});

bot.action(/approve_withdrawal_(.+)/, async (ctx) => {
  await referral.approveWithdrawal(ctx, ctx.match[1]);
});

bot.action(/reject_withdrawal_(.+)/, async (ctx) => {
  ctx.session.rejectingWithdrawal = ctx.match[1];
  await ctx.editMessageText(
    `❌ Rejecting withdrawal ${ctx.match[1]}\n\n` +
    `Please send the rejection reason:`
  );
});

// ==================== REFERRAL ACTION BUTTONS ====================
bot.action('share_referral', async (ctx) => {
  const user = ctx.userData;
  if (!user) return;
  
  const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=${user.referralCode}`;
  
  await ctx.editMessageText(
    `👥 *Share Your Referral Link*\n\n` +
    `Your referral link:\n` +
    `${referralLink}\n\n` +
    `Share this link with friends to earn ${CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL} ETB per successful referral!`,
    Markup.inlineKeyboard([
      [Markup.button.url('📤 Share on Telegram', `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=Join%20JU%20Tutorial%20Classes%20and%20earn%20money%20through%20referrals!`)],
      [Markup.button.callback('🔙 Back', 'admin_back')]
    ])
  );
});

bot.action('withdraw_telebirr', async (ctx) => {
  await referral.handleTelebirrWithdrawal(ctx);
});

bot.action('withdraw_cbe', async (ctx) => {
  await referral.handleCBEWithdrawal(ctx);
});

// ==================== SETTINGS BUTTON ====================
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
