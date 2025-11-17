const { Markup } = require('telegraf');
const database = require('./database');
const notification = require('./notification');
const { CONFIG } = require('./config');

class ReferralHandler {
  async showReferralInfo(ctx) {
    const userId = ctx.from.id;
    const user = await database.getUser(userId);
    
    if (!user) {
      await ctx.reply('❌ Please complete registration first.');
      return;
    }

    const referrals = await database.getReferralsByReferrer(userId);
    const paidReferrals = referrals.filter(ref => ref.status === 'completed');
    const pendingReferrals = referrals.filter(ref => ref.status === 'pending');

    const referralText = `👥 *YOUR REFERRAL NETWORK*\n\n` +
      `🎯 Your Referral Code: \`${user.referralCode}\`\n\n` +
      `🔗 Your Referral Link:\n` +
      `https://t.me/${process.env.BOT_USERNAME}?start=${user.referralCode}\n\n` +
      `💰 *Earnings Summary:*\n` +
      `• Commission per referral: ${CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL} ETB\n` +
      `• Total earned: ${user.totalEarned} ETB\n` +
      `• Available balance: ${user.balance} ETB\n\n` +
      `📊 *Referral Stats:*\n` +
      `• ✅ Paid referrals: ${user.paidReferrals}\n` +
      `• ⏳ Pending: ${user.unpaidReferrals}\n` +
      `• 📈 Total invited: ${user.totalReferrals}\n\n` +
      `💡 *Withdrawal Eligibility:*\n` +
      `Need ${CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS} paid referrals to withdraw\n` +
      `Current: ${user.paidReferrals}/${CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS}`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📤 Share Link', 'share_referral')],
      [Markup.button.callback('💸 Withdraw Earnings', 'withdraw_earnings')],
      [Markup.button.callback('📊 Detailed Stats', 'referral_stats')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);

    await ctx.replyWithMarkdown(referralText, keyboard);
  }

  async showReferralStats(ctx) {
    const userId = ctx.from.id;
    const user = await database.getUser(userId);
    
    if (!user) {
      await ctx.answerCbQuery('❌ Please complete registration first.');
      return;
    }

    const referrals = await database.getReferralsByReferrer(userId);
    const paidReferrals = referrals.filter(ref => ref.status === 'completed');
    const pendingReferrals = referrals.filter(ref => ref.status === 'pending');

    let statsText = `📊 *DETAILED REFERRAL STATS*\n\n`;
    
    if (referrals.length === 0) {
      statsText += `No referrals yet. Share your link to start earning!`;
    } else {
      statsText += `📈 *All Referrals (${referrals.length})*\n\n`;
      
      referrals.forEach((ref, index) => {
        const statusEmoji = ref.status === 'completed' ? '✅' : '⏳';
        statsText += `${index + 1}. ${statusEmoji} ${ref.referredUserId}\n`;
        if (ref.status === 'completed') {
          statsText += `   💰 Earned: ${ref.commissionAmount} ETB\n`;
        }
        statsText += `   📅 Date: ${new Date(ref.date).toLocaleDateString()}\n\n`;
      });
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📤 Share Link', 'share_referral')],
      [Markup.button.callback('💸 Withdraw', 'withdraw_earnings')],
      [Markup.button.callback('🔙 Back to Referrals', 'show_referrals')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(statsText, keyboard);
    } else {
      await ctx.replyWithMarkdown(statsText, keyboard);
    }
  }

  async handleWithdrawalRequest(ctx) {
    const userId = ctx.from.id;
    const user = await database.getUser(userId);
    
    if (!user) {
      await ctx.reply('❌ Please complete registration first.');
      return;
    }

    // Check eligibility
    if (user.paidReferrals < CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS) {
      const needed = CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS - user.paidReferrals;
      await ctx.replyWithMarkdown(
        `❌ *WITHDRAWAL NOT ELIGIBLE*\n\n` +
        `You need *${CONFIG.WITHDRAWAL.MIN_PAID_REFERRALS}* paid referrals to withdraw.\n` +
        `You have *${user.paidReferrals}* paid referrals.\n` +
        `Need *${needed}* more paid referrals.\n\n` +
        `Keep inviting friends to earn more!`
      );
      return;
    }

    if (user.balance < CONFIG.WITHDRAWAL.MIN_AMOUNT) {
      await ctx.replyWithMarkdown(
        `❌ *INSUFFICIENT BALANCE*\n\n` +
        `Minimum withdrawal amount: *${CONFIG.WITHDRAWAL.MIN_AMOUNT} ETB*\n` +
        `Your balance: *${user.balance} ETB*`
      );
      return;
    }

    // Show withdrawal options
    await ctx.replyWithMarkdown(
      `💸 *REQUEST WITHDRAWAL*\n\n` +
      `Available Balance: *${user.balance} ETB*\n` +
      `Minimum Withdrawal: *${CONFIG.WITHDRAWAL.MIN_AMOUNT} ETB*\n\n` +
      `Choose payment method:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📱 Telebirr', 'withdraw_telebirr'),
          Markup.button.callback('🏦 CBE', 'withdraw_cbe')
        ],
        [
          Markup.button.callback('❌ Cancel', 'show_referrals'),
          Markup.button.callback('🏠 Main Menu', 'main_menu')
        ]
      ])
    );
  }

  async handleTelebirrWithdrawal(ctx) {
    const user = await database.getUser(ctx.from.id);
    if (!user) return;

    ctx.session.withdrawal = {
      method: 'telebirr',
      step: 'amount'
    };

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel Withdrawal', 'show_referrals')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);

    await ctx.editMessageText(
      `📱 *Telebirr Withdrawal*\n\n` +
      `Available: ${user.balance} ETB\n\n` +
      `Enter amount to withdraw (minimum ${CONFIG.WITHDRAWAL.MIN_AMOUNT} ETB):\n` +
      `Example: 100`,
      keyboard
    );
  }

  async handleCBEWithdrawal(ctx) {
    const user = await database.getUser(ctx.from.id);
    if (!user) return;

    ctx.session.withdrawal = {
      method: 'cbe',
      step: 'amount'
    };

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel Withdrawal', 'show_referrals')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);

    await ctx.editMessageText(
      `🏦 *CBE Withdrawal*\n\n` +
      `Available: ${user.balance} ETB\n\n` +
      `Enter amount to withdraw (minimum ${CONFIG.WITHDRAWAL.MIN_AMOUNT} ETB):\n` +
      `Example: 100`,
      keyboard
    );
  }

  async processWithdrawalAmount(ctx, amount) {
    const numericAmount = parseInt(amount);
    const user = await database.getUser(ctx.from.id);

    if (!user) return;

    if (isNaN(numericAmount) || numericAmount < CONFIG.WITHDRAWAL.MIN_AMOUNT) {
      await ctx.reply(`❌ Amount must be at least ${CONFIG.WITHDRAWAL.MIN_AMOUNT} ETB`);
      return;
    }

    if (numericAmount > user.balance) {
      await ctx.reply(`❌ Amount exceeds your available balance of ${user.balance} ETB`);
      return;
    }

    ctx.session.withdrawal.amount = numericAmount;

    const cancelKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel Withdrawal', 'show_referrals')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);

    if (ctx.session.withdrawal.method === 'telebirr') {
      ctx.session.withdrawal.step = 'phone';
      await ctx.reply('Please enter your Telebirr phone number (Format: 251912345678):', cancelKeyboard);
    } else {
      ctx.session.withdrawal.step = 'account';
      await ctx.reply('Please enter your CBE account number:', cancelKeyboard);
    }
  }

  async processTelebirrPhone(ctx, phone) {
    const phoneRegex = /^251\d{9}$/;
    if (!phoneRegex.test(phone)) {
      await ctx.reply('❌ Invalid phone format. Use: 251912345678');
      return;
    }

    ctx.session.withdrawal.phone = phone;
    await this.submitWithdrawalRequest(ctx);
  }

  async processCBEDetails(ctx, accountNumber) {
    ctx.session.withdrawal.accountNumber = accountNumber;
    ctx.session.withdrawal.step = 'name';
    
    const cancelKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel Withdrawal', 'show_referrals')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await ctx.reply('Please enter the account holder name:', cancelKeyboard);
  }

  async processCBEAccountName(ctx, accountName) {
    ctx.session.withdrawal.accountName = accountName;
    await this.submitWithdrawalRequest(ctx);
  }

  async submitWithdrawalRequest(ctx) {
    const userId = ctx.from.id;
    const { withdrawal } = ctx.session;
    const user = await database.getUser(userId);

    if (!user) return;

    try {
      const withdrawalId = `WD_${userId}_${Date.now()}`;
      const withdrawalData = {
        withdrawalId: withdrawalId,
        userId: userId,
        amount: withdrawal.amount,
        paymentMethod: withdrawal.method,
        status: CONFIG.WITHDRAWAL.STATUS.PENDING,
        requestedAt: new Date().toISOString()
      };

      // Add payment details based on method
      if (withdrawal.method === 'telebirr') {
        withdrawalData.paymentDetails = { phone: withdrawal.phone };
      } else {
        withdrawalData.paymentDetails = {
          accountNumber: withdrawal.accountNumber,
          accountName: withdrawal.accountName
        };
      }

      // Save withdrawal to database
      await database.createWithdrawal(withdrawalData);

      // Notify admin
      await notification.notifyWithdrawalRequest(
        userId, 
        withdrawalId, 
        withdrawal.amount, 
        withdrawal.method, 
        withdrawalData.paymentDetails
      );

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('👥 My Referrals', 'show_referrals')],
        [Markup.button.callback('💰 Check Balance', 'check_balance')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ]);

      await ctx.replyWithMarkdown(
        `✅ *Withdrawal Request Submitted!*\n\n` +
        `Amount: *${withdrawal.amount} ETB*\n` +
        `Method: *${withdrawal.method}*\n` +
        `Withdrawal ID: \`${withdrawalId}\`\n\n` +
        `Admins have been notified. You will receive an update soon.`,
        keyboard
      );

      // Clear session
      ctx.session.withdrawal = null;

    } catch (error) {
      console.error('Error submitting withdrawal:', error);
      await ctx.reply('❌ Error processing withdrawal request. Please try again.');
    }
  }

  async approveWithdrawal(ctx, withdrawalId) {
    const withdrawal = await database.getWithdrawal(withdrawalId);
    if (!withdrawal) {
      await ctx.answerCbQuery('❌ Withdrawal not found.');
      return;
    }

    try {
      // Update withdrawal status
      await database.updateWithdrawal(withdrawalId, {
        status: CONFIG.WITHDRAWAL.STATUS.APPROVED,
        processedBy: ctx.from.username,
        processedAt: new Date().toISOString()
      });

      // Update user balance
      const user = await database.getUser(withdrawal.userId);
      if (user) {
        await database.updateUser(withdrawal.userId, {
          balance: user.balance - withdrawal.amount,
          totalWithdrawn: user.totalWithdrawn + withdrawal.amount
        });

        // Notify user
        await notification.notifyWithdrawalApproval(withdrawal.userId, withdrawalId, withdrawal.amount);
      }

      await ctx.editMessageText(`✅ Withdrawal ${withdrawalId} approved successfully!`);
      await ctx.answerCbQuery('Withdrawal approved!');

    } catch (error) {
      console.error('Error approving withdrawal:', error);
      await ctx.answerCbQuery('❌ Error approving withdrawal.');
    }
  }
}

module.exports = new ReferralHandler();
