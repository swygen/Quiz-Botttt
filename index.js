import express from 'express';
import fs from 'fs';
import { Telegraf, Markup } from 'telegraf';
import { BOT_TOKEN, GROUP_ID, GROUP_LINK } from './config.js';

const quiz = JSON.parse(fs.readFileSync('./quiz.json', 'utf-8'));

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('✅ Keep-alive server running on port 3000'));

const bot = new Telegraf(BOT_TOKEN);

const userState = {};  // per-user data store

function shuffleArray(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

// শুরু বট
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  userState[userId] = {
    score: 0,
    currentQuestion: 0,
    joined: false,
    questions: shuffleArray(quiz),
    timeoutId: null,
    countdownInterval: null,
    lastMessageId: null,
    waitingFeedback: false
  };

  await ctx.reply(
    `স্বাগতম ${ctx.from.first_name}! কুইজ বট ব্যবহার করার আগে অবশ্যই গ্রুপে জয়েন করুন।`,
    Markup.inlineKeyboard([
      Markup.button.url('গ্রুপে জয়েন করুন', GROUP_LINK),
      Markup.button.callback('✅ Joined', 'check_join')
    ])
  );
});

// গ্রুপ জয়েন চেক
bot.action('check_join', async (ctx) => {
  const userId = ctx.from.id;
  try {
    const member = await ctx.telegram.getChatMember(GROUP_ID, userId);
    if (["member", "administrator", "creator"].includes(member.status)) {
      userState[userId].joined = true;
      await ctx.editMessageText('✅ গ্রুপে জয়েন নিশ্চিত হয়েছে! এখন মেনু থেকে অপশন বেছে নিন।');
      return showMainMenu(ctx);
    } else {
      return ctx.answerCbQuery('⚠️ প্রথমে গ্রুপে জয়েন করুন!', { show_alert: true });
    }
  } catch {
    return ctx.answerCbQuery('গ্রুপ যাচাই করা যায়নি, আবার চেষ্টা করুন!', { show_alert: true });
  }
});

// মেইন মেনু দেখানো
async function showMainMenu(ctx) {
  await ctx.reply(
    'মেনু থেকে একটি অপশন বেছে নিন:',
    Markup.keyboard([
      ['🧠 Start Quiz'],
      ['👤 Profile', '⭐ Feedback'],
      ['📤 Share']
    ]).resize()
  );
}

// মেনু অপশন হ্যান্ডেলিং
bot.hears('🧠 Start Quiz', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  if (!state || !state.joined) return ctx.reply('গ্রুপে জয়েন করে নিন আগে।');

  state.score = 0;
  state.currentQuestion = 0;
  state.questions = shuffleArray(quiz);
  await sendQuestion(ctx, userId);
});

bot.hears('👤 Profile', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  if (!state) return ctx.reply('প্রথমে /start দিন।');

  ctx.reply(`নাম: ${ctx.from.first_name}\nস্কোর: ${state.score}/${state.questions.length}`);
});

bot.hears('⭐ Feedback', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  if (!state) return ctx.reply('প্রথমে /start দিন।');

  state.waitingFeedback = true;
  ctx.reply('আপনার মতামত লিখুন:');
});

bot.hears('📤 Share', async (ctx) => {
  ctx.reply(`আমি এই মজার কুইজ বট ব্যবহার করছি! তুমি ও চেষ্টা করো:\nhttps://t.me/your_bot_username`);
});

// ফিডব্যাক গ্রহণ
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  if (!state) return;

  if (state.waitingFeedback) {
    // ফিডব্যাক হিসেবে ধরে নিচ্ছি
    state.waitingFeedback = false;
    ctx.reply('✅ ধন্যবাদ আপনার মতামতের জন্য!');
    return;
  }

  // কুইজ চলাকালীন উত্তর হ্যান্ডেল
  if (!state.joined) return;

  const q = state.questions[state.currentQuestion];
  if (!q) return;

  const answer = ctx.message.text;

  clearTimeout(state.timeoutId);
  clearInterval(state.countdownInterval);

  if (answer === q.answer) {
    state.score++;
    await ctx.reply('✅ অভিনন্দন! সঠিক উত্তর।');
  } else {
    await ctx.reply(`❌ ভুল উত্তর!\nসঠিক উত্তর: ${q.answer}`);
  }

  state.currentQuestion++;

  setTimeout(() => {
    sendQuestion(ctx, userId);
  }, 5000);
});

// প্রশ্ন পাঠানো (টাইমারসহ)
async function sendQuestion(ctx, userId) {
  const state = userState[userId];
  if (!state) return;

  if (state.currentQuestion >= state.questions.length) {
    await ctx.reply(`🎉 কুইজ শেষ! আপনার স্কোর: ${state.score}/${state.questions.length}`);
    return showMainMenu(ctx);
  }

  const q = state.questions[state.currentQuestion];
  let seconds = 60;

  // প্রশ্ন মেসেজ পাঠাও
  const sentMessage = await ctx.reply(
    `⏳ সময় বাকি: ${seconds}s\n\nবিষয়: ${q.subject}\nপ্রশ্ন: ${q.question}`,
    Markup.keyboard(q.options.map(opt => [opt])).oneTime().resize()
  );

  state.lastMessageId = sentMessage.message_id;

  // প্রতি ১০ সেকেন্ডে টাইমার আপডেট
  state.countdownInterval = setInterval(async () => {
    seconds -= 10;
    if (seconds <= 0) {
      clearInterval(state.countdownInterval);
      return;
    }

    try {
      await ctx.telegram.editMessageText(ctx.chat.id, sentMessage.message_id, null,
        `⏳ সময় বাকি: ${seconds}s\n\nবিষয়: ${q.subject}\nপ্রশ্ন: ${q.question}`,
        Markup.keyboard(q.options.map(opt => [opt])).oneTime().resize()
      );
    } catch (e) {
      // কোনো এরর হলে স্কিপ করো
    }
  }, 10000);

  // ১ মিনিটের টাইমআউট
  state.timeoutId = setTimeout(async () => {
    clearInterval(state.countdownInterval);
    await ctx.reply(`⏰ সময় শেষ!\nসঠিক উত্তর: ${q.answer}`);
    state.currentQuestion++;
    setTimeout(() => sendQuestion(ctx, userId), 3000);
  }, 60000);
}

bot.launch();
