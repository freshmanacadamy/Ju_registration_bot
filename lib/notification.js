const { Telegraf, Markup } = require('telegraf');
const database = require('./database');
const { CONFIG, botSettings } = require('./config');

class NotificationService {
  constructor() {
    this.bot = null;
  }

  setBot(botInstance) {
    this.bot = botInstance;
  }

  async notifyAdmins(message, keyboard = null) {
    try {
      const adminIds = process.env.ADMIN_IDS?.split(',') || [];
      
      for (const adminId of adminIds) {
        try {
          if (keyboard) {
            await this.bot.telegram.sendMessage(adminId, message, {
              parse_mode: 'Markdown',
              reply_markup: keyboard
            });
          } else {
            await this.bot.telegram.sendMessage(adminId, message, {
              parse_mode: 'Markdown'
            });
          }
        } catch (error) {
          console.error(`Failed to notify admin ${adminId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in notifyAdmins:', error);
    }
  }

  async notifyNewRegistration(userId, userData) {
    const user = await database.getUser(userId);
    if (!user) return;

    const message = `🎯 *NEW STUDENT REGISTRATION!*\n\n` +
      `👤 *Student Information:*\n` +
      `├── 📝 Name: ${userData.fullName}\n` +
      `├── 📞 Contact: ${userData.contactNumber}\n` +
      `├── 🎓 JU ID: ${userData.juId}\n` +
      `├── 🏫 Stream: ${userData.stream === 'natural' ? '🔬 Natural Science' : '📚 Social Science'}\n` +
      `├── 📅 Registered: Just now\n` +
      `└── 🆔 Telegram: @${user.username || 'N/A'}\n\n` +
      `*Quick Actions:*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('👀 View Profile', `view_user_${userId}`),
        Markup.button.callback('📩 Message', `message_user_${userId}`)
      ],
      [
        Markup.button.callback('✅ Approve', `approve_user_${userId}`),
        Markup.button.callback('🚫 Block', `block_user_${userId}`)
      ]
    ]);

    await this.notifyAdmins(message, keyboard.reply_markup);
  }

  async notifyPaymentSubmission(userId, paymentId, screenshotFileId) {
    const user = await database.getUser(userId);
    if (!user) return;

    const message = `💰 *PAYMENT SUBMITTED - AWAITING APPROVAL!*\n\n` +
      `👤 *Student:* ${user.fullName}\n` +
      `📞 Contact: ${user.contactNumber}\n` +
      `🎓 JU ID: ${user.juId}\n` +
      `🏫 Stream: ${user.stream === 'natural' ? '🔬 Natural Science' : '📚 Social Science'}\n` +
      `💵 Amount: ${CONFIG.PAYMENT.DEFAULT_AMOUNT} ETB\n` +
      `🆔 Payment ID: ${paymentId}\n\n` +
      `*Quick Actions:*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve Payment', `approve_payment_${paymentId}`),
        Markup.button.callback('❌ Reject', `reject_payment_${paymentId}`)
      ],
      [
        Markup.button.callback('📩 Message Student', `message_user_${userId}`),
        Markup.button.callback('👀 View Student', `view_user_${userId}`)
      ]
    ]);

    // Send notification
    await this.notifyAdmins(message, keyboard.reply_markup);

    // Forward screenshot to admins
    const adminIds = process.env.ADMIN_IDS?.split(',') || [];
    for (const adminId of adminIds) {
      try {
        await this.bot.telegram.forwardMessage(adminId, userId, screenshotFileId);
      } catch (error) {
        console.error(`Failed to forward screenshot to admin ${adminId}:`, error);
      }
    }
  }

  async notifyWithdrawalRequest(userId, withdrawalId, amount, paymentMethod, paymentDetails) {
    const user = await database.getUser(userId);
    if (!user) return;

    let paymentInfo = '';
    if (paymentMethod === 'telebirr') {
      paymentInfo = `📱 Telebirr: ${paymentDetails.phone}`;
    } else if (paymentMethod === 'cbe') {
      paymentInfo = `🏦 CBE: ${paymentDetails.accountNumber} (${paymentDetails.accountName})`;
    }

    const message = `💸 *NEW WITHDRAWAL REQUEST!*\n\n` +
      `👤 *User:* ${user.fullName} (@${user.username || 'N/A'})\n` +
      `🎓 JU ID: ${user.juId}\n` +
      `💵 Amount: ${amount} ETB\n` +
      `💳 Method: ${paymentMethod}\n` +
      `${paymentInfo}\n` +
      `📊 Paid Referrals: ${user.paidReferrals}/${CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS} ✅\n` +
      `💰 Current Balance: ${user.balance} ETB\n` +
      `🆔 Withdrawal ID: ${withdrawalId}\n\n` +
      `*Quick Actions:*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve', `approve_withdrawal_${withdrawalId}`),
        Markup.button.callback('❌ Reject', `reject_withdrawal_${withdrawalId}`)
      ],
      [
        Markup.button.callback('📩 Message User', `message_user_${userId}`),
        Markup.button.callback('👀 View Details', `view_withdrawal_${withdrawalId}`)
      ]
    ]);

    await this.notifyAdmins(message, keyboard.reply_markup);
  }

  async notifyPaymentApproval(userId, paymentId) {
    try {
      const user = await database.getUser(userId);
      if (!user) return;

      const message = `🎉 *PAYMENT APPROVED!*\n\n` +
        `Your payment has been verified and approved!\n` +
        `You are now officially registered for JU Tutorial Classes.\n\n` +
        `📝 Name: ${user.fullName}\n` +
        `🎓 JU ID: ${user.juId}\n` +
        `🏫 Stream: ${user.stream === 'natural' ? '🔬 Natural Science' : '📚 Social Science'}\n` +
        `💵 Amount: ${CONFIG.PAYMENT.DEFAULT_AMOUNT} ETB\n\n` +
        `You can now use your referral link to invite friends and earn commissions!`;

      await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying payment approval:', error);
    }
  }

  async notifyWithdrawalApproval(userId, withdrawalId, amount) {
    try {
      const user = await database.getUser(userId);
      if (!user) return;

      const message = `🎉 *WITHDRAWAL APPROVED!*\n\n` +
        `Your withdrawal request has been approved!\n` +
        `Amount: *${amount} ETB*\n\n` +
        `The funds will be transferred to your account within 24-48 hours.\n\n` +
        `💰 New Balance: ${user.balance - amount} ETB`;

      await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying withdrawal approval:', error);
    }
  }

  async notifyUser(userId, message) {
    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error(`Failed to notify user ${userId}:`, error);
    }
  }
}

module.exports = new NotificationService();
