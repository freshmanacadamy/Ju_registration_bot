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
      `💰 *Awaiting Payment Submission*\n\n` +
      `*Quick Actions:*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('👀 View Profile', `view_user_${userId}`),
        Markup.button.callback('📩 Message', `message_user_${userId}`)
      ],
      [
        Markup.button.callback('🚫 Block Student', `block_user_${userId}`)
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

    // Send notification and screenshot to all admins
    const adminIds = process.env.ADMIN_IDS?.split(',') || [];
    
    for (const adminId of adminIds) {
      try {
        // Send the text message with buttons
        await this.bot.telegram.sendMessage(adminId, message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
        
        // Send the screenshot as photo (FIXED: using sendPhoto instead of forwardMessage)
        await this.bot.telegram.sendPhoto(adminId, screenshotFileId, {
          caption: `📸 Payment screenshot from ${user.fullName} (${user.juId})`
        });
        
      } catch (error) {
        console.error(`Failed to notify admin ${adminId}:`, error);
      }
    }
  }

  async notifyWithdrawalRequest(userId, withdrawalId, amount, paymentMethod, paymentDetails) {
    const user = await database.getUser(userId);
    if (!user) return;

    let paymentInfo = '';
    if (paymentMethod === 'telebirr') {
      paymentInfo = `📱 Telebirr Phone: ${paymentDetails.phone}`;
    } else if (paymentMethod === 'cbe') {
      paymentInfo = `🏦 CBE Account: ${paymentDetails.accountNumber}\n👤 Account Name: ${paymentDetails.accountName}`;
    }

    const message = `💸 *NEW WITHDRAWAL REQUEST!*\n\n` +
      `👤 *User:* ${user.fullName} (@${user.username || 'N/A'})\n` +
      `🎓 JU ID: ${user.juId}\n` +
      `💵 Amount: ${amount} ETB\n` +
      `💳 Method: ${paymentMethod}\n` +
      `${paymentInfo}\n` +
      `📊 Paid Referrals: ${user.paidReferrals}/${CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS} ✅\n` +
      `💰 Current Balance: ${user.balance} ETB\n` +
      `💰 Total Earned: ${user.totalEarned} ETB\n` +
      `💰 Total Withdrawn: ${user.totalWithdrawn} ETB\n` +
      `🆔 Withdrawal ID: ${withdrawalId}\n\n` +
      `*Quick Actions:*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve Withdrawal', `approve_withdrawal_${withdrawalId}`),
        Markup.button.callback('❌ Reject', `reject_withdrawal_${withdrawalId}`)
      ],
      [
        Markup.button.callback('📩 Message User', `message_user_${userId}`),
        Markup.button.callback('👀 View User', `view_user_${userId}`)
      ]
    ]);

    await this.notifyAdmins(message, keyboard.reply_markup);
  }

  async notifyPaymentApproval(userId, paymentId) {
    try {
      const user = await database.getUser(userId);
      if (!user) return;

      const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=${user.referralCode}`;

      const message = `🎉 *PAYMENT APPROVED!*\n\n` +
        `Your payment has been verified and approved!\n` +
        `You are now officially registered for JU Tutorial Classes.\n\n` +
        `📝 Name: ${user.fullName}\n` +
        `🎓 JU ID: ${user.juId}\n` +
        `🏫 Stream: ${user.stream === 'natural' ? '🔬 Natural Science' : '📚 Social Science'}\n` +
        `💵 Amount: ${CONFIG.PAYMENT.DEFAULT_AMOUNT} ETB\n\n` +
        `🎯 *Start Earning Now!*\n\n` +
        `Share your referral link to invite friends:\n` +
        `${referralLink}\n\n` +
        `💰 *Earn ${CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL} ETB* per successful referral!\n` +
        `💸 Withdraw after ${CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS} paid referrals`;

      await this.bot.telegram.sendMessage(userId, message, { 
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('👥 Share Referral Link', 'share_referral')]
        ]).reply_markup
      });
    } catch (error) {
      console.error('Error notifying payment approval:', error);
    }
  }

  async notifyPaymentRejection(userId, reason) {
    try {
      const user = await database.getUser(userId);
      if (!user) return;

      const message = `❌ *PAYMENT REJECTED*\n\n` +
        `Your payment has been rejected by the admin.\n\n` +
        `📝 Reason: ${reason}\n\n` +
        `Please submit a valid payment screenshot or contact admin for assistance.`;

      await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying payment rejection:', error);
    }
  }

  async notifyWithdrawalApproval(userId, withdrawalId, amount) {
    try {
      const user = await database.getUser(userId);
      if (!user) return;

      const message = `🎉 *WITHDRAWAL APPROVED!*\n\n` +
        `Your withdrawal request has been approved!\n\n` +
        `💰 Amount: *${amount} ETB*\n` +
        `🆔 Withdrawal ID: ${withdrawalId}\n\n` +
        `The funds will be transferred to your account within 24-48 hours.\n\n` +
        `💵 New Balance: ${user.balance - amount} ETB\n` +
        `📈 Total Withdrawn: ${user.totalWithdrawn + amount} ETB`;

      await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying withdrawal approval:', error);
    }
  }

  async notifyWithdrawalRejection(userId, reason) {
    try {
      const user = await database.getUser(userId);
      if (!user) return;

      const message = `❌ *WITHDRAWAL REJECTED*\n\n` +
        `Your withdrawal request has been rejected.\n\n` +
        `📝 Reason: ${reason}\n\n` +
        `You can submit a new withdrawal request if eligible.`;

      await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying withdrawal rejection:', error);
    }
  }

  async notifyReferralEarned(referrerId, referredUserId, amount) {
    try {
      const referrer = await database.getUser(referrerId);
      const referredUser = await database.getUser(referredUserId);
      
      if (!referrer || !referredUser) return;

      const message = `🎉 *You Earned ${amount} ETB!*\n\n` +
        `Your friend ${referredUser.fullName} completed registration and payment!\n\n` +
        `💰 Commission: ${amount} ETB\n` +
        `💵 New Balance: ${referrer.balance + amount} ETB\n` +
        `✅ Paid Referrals: ${referrer.paidReferrals + 1}\n\n` +
        `Keep sharing your referral link to earn more!`;

      await this.bot.telegram.sendMessage(referrerId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying referral earnings:', error);
    }
  }

  async notifyUserBlocked(userId, reason) {
    try {
      const message = `🚫 *ACCOUNT BLOCKED*\n\n` +
        `Your account has been blocked by admin.\n\n` +
        `📝 Reason: ${reason}\n\n` +
        `Contact admin for more information or to appeal.`;

      await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying user block:', error);
    }
  }

  async notifyUserUnblocked(userId) {
    try {
      const message = `✅ *ACCOUNT RESTORED*\n\n` +
        `Your account has been unblocked and restored.\n\n` +
        `You can now access all features of the bot.`;

      await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying user unblock:', error);
    }
  }

  async notifyAdminActivity(adminId, activity, targetUser = null) {
    try {
      let message = `🔧 *Admin Activity Log*\n\n`;
      
      if (targetUser) {
        const user = await database.getUser(targetUser);
        message += `👤 Target: ${user?.fullName || 'Unknown'} (@${user?.username || 'N/A'})\n`;
      }
      
      message += `📝 Activity: ${activity}\n` +
                 `👤 Admin: @${this.bot.telegram.getChat(adminId).username || 'Unknown'}\n` +
                 `⏰ Time: ${new Date().toLocaleString()}`;

      // Send to all other admins (excluding the one who performed the action)
      const adminIds = process.env.ADMIN_IDS?.split(',') || [];
      const otherAdmins = adminIds.filter(id => id !== adminId.toString());
      
      for (const otherAdminId of otherAdmins) {
        try {
          await this.bot.telegram.sendMessage(otherAdminId, message, { parse_mode: 'Markdown' });
        } catch (error) {
          console.error(`Failed to notify admin ${otherAdminId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error notifying admin activity:', error);
    }
  }

  async notifyUser(userId, message, keyboard = null) {
    try {
      const options = { parse_mode: 'Markdown' };
      if (keyboard) {
        options.reply_markup = keyboard;
      }
      
      await this.bot.telegram.sendMessage(userId, message, options);
    } catch (error) {
      console.error(`Failed to notify user ${userId}:`, error);
    }
  }

  async broadcastToUsers(message, users, progressCallback = null) {
    let successCount = 0;
    let failCount = 0;
    
    for (const user of users) {
      try {
        await this.bot.telegram.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
        successCount++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (progressCallback) {
          progressCallback(successCount + failCount, users.length);
        }
      } catch (error) {
        failCount++;
        console.error(`Failed to broadcast to user ${user.telegramId}:`, error);
      }
    }
    
    return { successCount, failCount };
  }
}

module.exports = new NotificationService();
