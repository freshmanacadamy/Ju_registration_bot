const { Markup } = require('telegraf');
const database = require('./database');
const notification = require('./notification');
const { CONFIG, botSettings } = require('./config');

class AdminHandler {
  isAdmin(userId) {
    const adminIds = process.env.ADMIN_IDS?.split(',') || [];
    return adminIds.includes(userId.toString());
  }

  async showAdminDashboard(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Access denied. Admin only.');
      return;
    }

    const stats = await this.getAdminStats();

    const adminText = `🔧 *ADMIN DASHBOARD*\n\n` +
      `📊 *Statistics*\n` +
      `👥 Total Students: ${stats.totalStudents}\n` +
      `💰 Total Revenue: ${stats.totalRevenue} ETB\n` +
      `⏳ Pending Payments: ${stats.pendingPayments}\n` +
      `💸 Pending Withdrawals: ${stats.pendingWithdrawals}\n` +
      `🏫 Natural Science: ${stats.naturalStudents} students\n` +
      `📚 Social Science: ${stats.socialStudents} students\n\n` +
      `⚡ *Quick Actions*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📝 Pending Registrations', 'admin_pending_payments'),
        Markup.button.callback('💸 Pending Withdrawals', 'admin_pending_withdrawals')
      ],
      [
        Markup.button.callback('👥 Student Management', 'admin_user_management'),
        Markup.button.callback('📊 Analytics', 'admin_analytics')
      ],
      [
        Markup.button.callback('⚙️ Bot Settings', 'admin_bot_settings'),
        Markup.button.callback('📢 Broadcast', 'admin_broadcast')
      ],
      [
        Markup.button.callback('📤 Export Data', 'admin_export_data'),
        Markup.button.callback('🔄 Refresh', 'admin_refresh')
      ]
    ]);

    await ctx.replyWithMarkdown(adminText, keyboard);
  }

  async getAdminStats() {
    const students = await database.getAllStudents();
    const payments = await database.getPendingPayments();
    const withdrawals = await database.getPendingWithdrawals();

    const totalRevenue = students.filter(s => s.status === 'active').length * CONFIG.PAYMENT.DEFAULT_AMOUNT;
    const naturalStudents = students.filter(s => s.stream === 'natural').length;
    const socialStudents = students.filter(s => s.stream === 'social').length;

    return {
      totalStudents: students.length,
      totalRevenue: totalRevenue,
      pendingPayments: payments.length,
      pendingWithdrawals: withdrawals.length,
      naturalStudents: naturalStudents,
      socialStudents: socialStudents
    };
  }

  async showPendingPayments(ctx) {
    if (!this.isAdmin(ctx.from.id)) return;

    const pendingPayments = await database.getPendingPayments();

    if (pendingPayments.length === 0) {
      await ctx.editMessageText('✅ No pending payments.');
      return;
    }

    await ctx.editMessageText(`📸 *Pending Payments (${pendingPayments.length})*\n\nSelect a payment to view:`);

    for (const payment of pendingPayments.slice(0, 5)) {
      const user = await database.getUser(payment.userId);
      const paymentText = `📸 *Pending Payment*\n\n` +
        `👤 User: ${user?.fullName || 'Unknown'}\n` +
        `📱 Username: @${user?.username || 'N/A'}\n` +
        `💰 Amount: ${payment.amount} ETB\n` +
        `🎓 JU ID: ${user?.juId || 'N/A'}\n` +
        `🏫 Stream: ${user?.stream === 'natural' ? '🔬 Natural' : '📚 Social'}\n` +
        `🆔 Payment ID: ${payment.paymentId}\n` +
        `📅 Submitted: ${new Date(payment.submittedAt).toLocaleString()}`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Approve', `approve_payment_${payment.paymentId}`),
          Markup.button.callback('❌ Reject', `reject_payment_${payment.paymentId}`)
        ],
        [
          Markup.button.callback('📩 Message User', `message_user_${payment.userId}`),
          Markup.button.callback('👀 View User', `view_user_${payment.userId}`)
        ]
      ]);

      await ctx.replyWithMarkdown(paymentText, keyboard);

      // Forward screenshot
      try {
        await ctx.telegram.forwardMessage(ctx.from.id, payment.userId, payment.screenshotFileId);
      } catch (error) {
        console.error('Error forwarding screenshot:', error);
      }
    }
  }

  async showPendingWithdrawals(ctx) {
    if (!this.isAdmin(ctx.from.id)) return;

    const pendingWithdrawals = await database.getPendingWithdrawals();

    if (pendingWithdrawals.length === 0) {
      await ctx.editMessageText('✅ No pending withdrawals.');
      return;
    }

    await ctx.editMessageText(`💸 *Pending Withdrawals (${pendingWithdrawals.length})*\n\nSelect a withdrawal to process:`);

    for (const withdrawal of pendingWithdrawals.slice(0, 5)) {
      const user = await database.getUser(withdrawal.userId);
      let paymentInfo = '';
      
      if (withdrawal.paymentMethod === 'telebirr') {
        paymentInfo = `📱 Phone: ${withdrawal.paymentDetails.phone}`;
      } else {
        paymentInfo = `🏦 Account: ${withdrawal.paymentDetails.accountNumber}\n👤 Name: ${withdrawal.paymentDetails.accountName}`;
      }

      const withdrawalText = `💸 *Pending Withdrawal*\n\n` +
        `👤 User: ${user?.fullName || 'Unknown'}\n` +
        `📱 Username: @${user?.username || 'N/A'}\n` +
        `💵 Amount: ${withdrawal.amount} ETB\n` +
        `💳 Method: ${withdrawal.paymentMethod}\n` +
        `${paymentInfo}\n` +
        `📊 Paid Referrals: ${user?.paidReferrals || 0}/${CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS}\n` +
        `💰 User Balance: ${user?.balance || 0} ETB\n` +
        `🆔 Withdrawal ID: ${withdrawal.withdrawalId}`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Approve', `approve_withdrawal_${withdrawal.withdrawalId}`),
          Markup.button.callback('❌ Reject', `reject_withdrawal_${withdrawal.withdrawalId}`)
        ],
        [
          Markup.button.callback('📩 Message User', `message_user_${withdrawal.userId}`),
          Markup.button.callback('👀 View User', `view_user_${withdrawal.userId}`)
        ]
      ]);

      await ctx.replyWithMarkdown(withdrawalText, keyboard);
    }
  }

  async showUserManagement(ctx) {
    if (!this.isAdmin(ctx.from.id)) return;

    const students = await database.getAllStudents();
    const activeStudents = students.filter(s => s.status === 'active');
    const blockedStudents = students.filter(s => s.status === 'blocked');
    const naturalStudents = students.filter(s => s.stream === 'natural');
    const socialStudents = students.filter(s => s.stream === 'social');

    const userManagementText = `👥 *Student Management*\n\n` +
      `📊 Statistics:\n` +
      `• Total Students: ${students.length}\n` +
      `• Active: ${activeStudents.length}\n` +
      `• Blocked: ${blockedStudents.length}\n` +
      `• 🔬 Natural: ${naturalStudents.length}\n` +
      `• 📚 Social: ${socialStudents.length}\n\n` +
      `🎯 Management Actions:`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔍 Search Student', 'admin_search_user'),
        Markup.button.callback('📋 List Students', 'admin_list_users')
      ],
      [
        Markup.button.callback('🔬 Natural Students', 'admin_natural_students'),
        Markup.button.callback('📚 Social Students', 'admin_social_students')
      ],
      [
        Markup.button.callback('🗑️ Delete Old Students', 'admin_delete_old'),
        Markup.button.callback('📊 Student Analytics', 'admin_student_analytics')
      ],
      [
        Markup.button.callback('🔙 Back', 'admin_back')
      ]
    ]);

    await ctx.editMessageText(userManagementText, keyboard);
  }

  async showBotSettings(ctx) {
    if (!this.isAdmin(ctx.from.id)) return;

    const settingsText = `⚙️ *Bot Settings*\n\n` +
      `🤖 Bot Status: ${botSettings.status === CONFIG.BOT.STATUS.ACTIVE ? '🟢 ACTIVE' : '🔴 MAINTENANCE'}\n\n` +
      `🔧 *Feature Toggles:*\n` +
      `📝 Registration: ${botSettings.features.registration ? '🟢 ON' : '🔴 OFF'}\n` +
      `📸 Screenshots: ${botSettings.features.screenshot_upload ? '🟢 ON' : '🔴 OFF'}\n` +
      `💰 Payments: ${botSettings.features.payments ? '🟢 ON' : '🔴 OFF'}\n` +
      `👥 Referrals: ${botSettings.features.referrals ? '🟢 ON' : '🔴 OFF'}\n` +
      `💸 Withdrawals: ${botSettings.features.withdrawals ? '🟢 ON' : '🔴 OFF'}\n\n` +
      `💰 *Financial Settings:*\n` +
      `Registration Fee: ${CONFIG.PAYMENT.DEFAULT_AMOUNT} ETB\n` +
      `Commission per Referral: ${CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL} ETB\n\n` +
      `*Settings Actions:*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(botSettings.status === CONFIG.BOT.STATUS.ACTIVE ? '🔴 Maintenance Mode' : '🟢 Activate Bot', 'admin_toggle_bot_status'),
        Markup.button.callback('💰 Edit Financial', 'admin_edit_financial')
      ],
      [
        Markup.button.callback('💳 Payment Methods', 'admin_payment_methods'),
        Markup.button.callback('🔄 Toggle Features', 'admin_toggle_features')
      ],
      [
        Markup.button.callback('🔙 Back', 'admin_back')
      ]
    ]);

    await ctx.editMessageText(settingsText, keyboard);
  }

  async showExportData(ctx) {
    if (!this.isAdmin(ctx.from.id)) return;

    const students = await database.getAllStudents();

    const exportText = `📤 *Export Data*\n\n` +
      `Available exports for ${students.length} students:\n\n` +
      `*Export Options:*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('👥 All Students', 'admin_export_all_students'),
        Markup.button.callback('🔬 Natural Stream', 'admin_export_natural')
      ],
      [
        Markup.button.callback('📚 Social Stream', 'admin_export_social'),
        Markup.button.callback('💰 Payment Data', 'admin_export_payments')
      ],
      [
        Markup.button.callback('💸 Withdrawal Data', 'admin_export_withdrawals'),
        Markup.button.callback('📊 Full Report', 'admin_export_full')
      ],
      [
        Markup.button.callback('🔙 Back', 'admin_back')
      ]
    ]);

    await ctx.editMessageText(exportText, keyboard);
  }

  async exportAllStudents(ctx) {
    if (!this.isAdmin(ctx.from.id)) return;

    await ctx.answerCbQuery('⏳ Generating CSV file...');

    try {
      const students = await database.getAllStudents();
      
      let csv = 'Telegram ID,Full Name,Username,Contact,JU ID,Stream,Status,Balance,Paid Referrals,Total Referrals,Registration Date\n';
      
      students.forEach(student => {
        csv += `${student.telegramId},"${student.fullName}","${student.username || 'N/A'}","${student.contactNumber}","${student.juId}","${student.stream}","${student.status}",${student.balance},${student.paidReferrals},${student.totalReferrals},"${student.registrationDate}"\n`;
      });

      const filename = `all_students_${new Date().toISOString().split('T')[0]}.csv`;
      
      await ctx.replyWithDocument({
        source: Buffer.from(csv, 'utf8'),
        filename: filename
      }, {
        caption: `📊 Exported: ${filename}\nTotal Students: ${students.length}\nGenerated: ${new Date().toLocaleString()}`
      });

    } catch (error) {
      await ctx.reply('❌ Error generating export file.');
      console.error('Export error:', error);
    }
  }

  async handleUserView(ctx, userId) {
    if (!this.isAdmin(ctx.from.id)) return;

    const user = await database.getUser(userId);
    if (!user) {
      await ctx.answerCbQuery('❌ User not found.');
      return;
    }

    const userText = `👤 *Student Profile*\n\n` +
      `🆔 Telegram ID: ${user.telegramId}\n` +
      `👤 Name: ${user.fullName}\n` +
      `📱 Username: @${user.username || 'N/A'}\n` +
      `📞 Contact: ${user.contactNumber}\n` +
      `🎓 JU ID: ${user.juId}\n` +
      `🏫 Stream: ${user.stream === 'natural' ? '🔬 Natural Science' : '📚 Social Science'}\n` +
      `📊 Status: ${user.status}\n\n` +
      `💰 *Financial Info*\n` +
      `💵 Balance: ${user.balance} ETB\n` +
      `📈 Total Earned: ${user.totalEarned} ETB\n` +
      `📉 Total Withdrawn: ${user.totalWithdrawn} ETB\n\n` +
      `👥 *Referral Stats*\n` +
      `✅ Paid Referrals: ${user.paidReferrals}\n` +
      `⏳ Unpaid Referrals: ${user.unpaidReferrals}\n` +
      `📊 Total Referrals: ${user.totalReferrals}\n\n` +
      `📅 Registered: ${new Date(user.registrationDate).toLocaleString()}\n` +
      `⏰ Last Seen: ${new Date(user.lastSeen).toLocaleString()}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📩 Message Student', `message_user_${userId}`),
        Markup.button.callback('✏️ Edit Student', `admin_edit_user_${userId}`)
      ],
      [
        Markup.button.callback(user.status === CONFIG.USER.STATUS.ACTIVE ? '🚫 Block Student' : '✅ Unblock Student', `admin_toggle_block_${userId}`),
        Markup.button.callback('💰 Adjust Balance', `admin_adjust_balance_${userId}`)
      ],
      [
        Markup.button.callback('🗑️ Delete Student', `admin_delete_user_${userId}`),
        Markup.button.callback('🔙 Back', 'admin_user_management')
      ]
    ]);

    await ctx.editMessageText(userText, keyboard);
  }

  async handleUserMessage(ctx, userId) {
    if (!this.isAdmin(ctx.from.id)) return;

    const user = await database.getUser(userId);
    if (!user) {
      await ctx.answerCbQuery('❌ User not found.');
      return;
    }

    await ctx.editMessageText(
      `📩 Message Student: ${user.fullName} (@${user.username || 'N/A'})\n\n` +
      `Please type your message:`
    );

    ctx.session.messagingUser = userId;
  }

  async sendUserMessage(ctx, message) {
    if (!ctx.session.messagingUser) return;

    const userId = ctx.session.messagingUser;
    const user = await database.getUser(userId);

    try {
      await ctx.telegram.sendMessage(
        userId,
        `📩 *Message from Admin*\n\n${message}`
      );

      await ctx.reply(`✅ Message sent to ${user.fullName} (@${user.username || 'N/A'})`);
      ctx.session.messagingUser = null;

    } catch (error) {
      await ctx.reply(`❌ Failed to send message to user. They may have blocked the bot.`);
      ctx.session.messagingUser = null;
    }
  }

  async deleteStudent(ctx, userId) {
    if (!this.isAdmin(ctx.from.id)) return;

    const user = await database.getUser(userId);
    if (!user) {
      await ctx.answerCbQuery('❌ User not found.');
      return;
    }

    try {
      await database.deleteStudent(userId);
      await ctx.editMessageText(`✅ Student ${user.fullName} has been deleted.`);
    } catch (error) {
      await ctx.editMessageText('❌ Error deleting student.');
      console.error('Delete error:', error);
    }
  }
}

module.exports = new AdminHandler();
