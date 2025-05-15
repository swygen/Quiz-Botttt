// index.js
import express from 'express';
import { Telegraf, Markup } from 'telegraf';
import { BOT_TOKEN, GROUP_ID, GROUP_LINK } from './config.js';
import quiz from './quiz.json' assert { type: 'json' };

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('✅ Keep-alive server running on port 3000'));

const bot = new Telegraf(BOT_TOKEN);
const userState = {};

// Start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  userState[userId] = {
    score: 0,
    currentQuestion: 0,
    joined: false,
    feedback: [],
    questions: shuffleArray(quiz),
    timeoutId: null,
    waitingFeedback: false,
    lastMessageId: null
  };

  await ctx.reply(
    `স্বাগতম ${ctx.from.first_name}! এই কুইজ বট ব্যবহারের আগে গ্রুপে জয়েন করুন:`,
    Markup.inlineKeyboard([
      Markup.button.url('গ্রুপে যাও', GROUP_LINK),
      Markup.button.callback('✅ Joined', 'check_join')
    ])
  );
});

// Group Check
bot.action('check_join', async (ctx) => {
  const userId = ctx.from.id;
  try {
    const member = await ctx.telegram.getChatMember(GROUP_ID, userId);
    if (["member", "administrator", "creator"].includes(member.status)) {
      userState[userId].joined = true;
      await ctx.editMessageText('✅ গ্রুপে জয়েন নিশ্চিত! মেনু দেখুন:');
      return showMainMenu(ctx);
    } else {
      return ctx.answerCbQuery('⚠️ আগে গ্রুপে জয়েন করুন!', { show_alert: true });
    }
  } catch {
    return ctx.reply('গ্রুপ যাচাই করা যায়নি, আবার চেষ্টা করুন।');
  }
});

// Show Main Menu
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

// Start Quiz
bot.hears('🧠 Start Quiz', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  if (!state || !state.joined) return;

  state.score = 0;
  state.currentQuestion = 0;
  state.questions = shuffleArray(quiz);
  await sendQuestion(ctx, userId);
});

// Send Question with Timer
async function sendQuestion(ctx, userId) {
  const state = userState[userId];
  const q = state.questions[state.currentQuestion];

  if (!q) {
    await ctx.reply(`✅ কুইজ শেষ! আপনার স্কোর: ${state.score}/${state.questions.length}`);
    return showMainMenu(ctx);
  }

  let seconds = 60;

  const sent = await ctx.reply(
    `⏳ সময় বাকি: 60s\n\nপ্রশ্ন: ${q.question}\nবিষয়: ${q.subject}`,
    Markup.keyboard(q.options.map(opt => [opt])).oneTime().resize()
  );
  state.lastMessageId = sent.message_id;

  const countdown = setInterval(async () => {
    seconds -= 10;
    if (seconds <= 0) return clearInterval(countdown);
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        state.lastMessageId,
        null,
        `⏳ সময় বাকি: ${seconds}s\n\nপ্রশ্ন: ${q.question}\nবিষয়: ${q.subject}`,
        {
          reply_markup: {
            keyboard: q.options.map(opt => [opt]),
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    } catch {}
  }, 10000);

  state.timeoutId = setTimeout(async () => {
    clearInterval(countdown);
    await ctx.reply(`⏰ সময় শেষ!\nসঠিক উত্তর: ${q.answer}`);
    state.currentQuestion++;
    setTimeout(() => sendQuestion(ctx, userId), 3000);
  }, 60000);
}

// Handle Answers and Feedback
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  const input = ctx.message.text;

  if (!state || !state.joined) return;

  if (state.waitingFeedback) {
    state.feedback.push(input);
    state.waitingFeedback = false;
    return ctx.reply('✅ ধন্যবাদ আপনার মতামতের জন্য!');
  }

  if (input === '👤 Profile') {
    return ctx.reply(`নাম: ${ctx.from.first_name}\nস্কোর: ${state.score}/${state.questions.length}`);
  }

  if (input === '⭐ Feedback') {
    state.waitingFeedback = true;
    return ctx.reply('আপনার মতামত লিখুন:');
  }

  if (input === '📤 Share') {
    return ctx.reply('আমি একটি মজার কুইজ বট ব্যবহার করছি! দেখুন: https://t.me/Quiz_Learn_BD_bot');
  }

  const q = state.questions[state.currentQuestion];
  if (!q) return;

  clearTimeout(state.timeoutId);

  if (input === q.answer) {
    state.score++;
    await ctx.reply('✅ অভিনন্দন! সঠিক উত্তর!');
  } else {
    await ctx.reply(`❌ ভুল উত্তর! সঠিক উত্তর: ${q.answer}`);
  }

  state.currentQuestion++;
  setTimeout(() => sendQuestion(ctx, userId), 5000);
});

// Shuffle Utility
function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

bot.launch();
