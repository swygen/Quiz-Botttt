import { Telegraf, Markup } from 'telegraf';
import { BOT_TOKEN, GROUP_ID, GROUP_LINK } from './config.js';
import quiz from './quiz.json' assert { type: 'json' };

const bot = new Telegraf(BOT_TOKEN);
const userState = {};

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  userState[userId] = {
    score: 0,
    currentQuestion: 0,
    joined: false,
    feedback: [],
    questions: shuffleArray(quiz)
  };

  await ctx.reply(
    `স্বাগতম ${ctx.from.first_name}!\n\nএই কুইজ বট ব্যবহার করতে আগে আমাদের গ্রুপে জয়েন করুন:`,
    Markup.inlineKeyboard([
      Markup.button.url('গ্রুপে যাও', GROUP_LINK),
      Markup.button.callback('✅ Joined', 'check_join')
    ])
  );
});

bot.action('check_join', async (ctx) => {
  const userId = ctx.from.id;
  try {
    const member = await ctx.telegram.getChatMember(GROUP_ID, userId);
    if (['member', 'creator', 'administrator'].includes(member.status)) {
      userState[userId].joined = true;
      await ctx.editMessageText('গ্রুপে জয়েন নিশ্চিত ✅ নিচের মেনু থেকে বেছে নিন:');
      await showMainMenu(ctx);
    } else {
      await ctx.answerCbQuery('গ্রুপে জয়েন করুন আগে!', { show_alert: true });
    }
  } catch {
    await ctx.reply('গ্রুপ যাচাই করা যাচ্ছে না। আবার চেষ্টা করুন।');
  }
});

async function showMainMenu(ctx) {
  await ctx.reply(
    'মেনু থেকে আপনার পছন্দ বেছে নিন:',
    Markup.keyboard([
      ['🧠 Start Quiz'],
      ['👤 Profile', '⭐ Feedback'],
      ['📤 Share']
    ]).resize()
  );
}

bot.hears('🧠 Start Quiz', async (ctx) => {
  const userId = ctx.from.id;
  userState[userId].score = 0;
  userState[userId].currentQuestion = 0;
  userState[userId].questions = shuffleArray(quiz);
  await sendQuestion(ctx, userId);
});

async function sendQuestion(ctx, userId) {
  const state = userState[userId];
  const q = state.questions[state.currentQuestion];

  if (!q) {
    await ctx.reply(`✅ কুইজ শেষ! আপনার স্কোর: ${state.score}/${state.questions.length}`);
    return showMainMenu(ctx);
  }

  await ctx.reply(
    `বিষয়: ${q.subject}\n\nপ্রশ্ন ${state.currentQuestion + 1}:\n${q.question}`,
    Markup.keyboard(q.options.map(opt => [opt])).oneTime().resize()
  );
}

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const input = ctx.message.text;
  const state = userState[userId];

  if (!state || !state.joined) return;

  // Handle Feedback
  if (state.waitingFeedback) {
    state.feedback.push(input);
    state.waitingFeedback = false;
    return ctx.reply('ধন্যবাদ আপনার মতামতের জন্য!');
  }

  switch (input) {
    case '👤 Profile':
      return ctx.reply(`নাম: ${ctx.from.first_name}\nস্কোর: ${state.score}/${state.questions.length}`);
    case '⭐ Feedback':
      state.waitingFeedback = true;
      return ctx.reply('আমাদের বট কেমন লেগেছে? আপনার মতামত লিখে পাঠান:');
    case '📤 Share':
      return ctx.reply(
        `আমি দারুণ একটা কুইজ বট পেয়েছি! চেষ্টা করে দেখো:\n👉 https://t.me/your_bot_username`
      );
  }

  // Handle Quiz Answer
  const q = state.questions[state.currentQuestion];
  if (!q) return;

  if (input === q.answer) {
    state.score++;
    await ctx.reply('সঠিক উত্তর! ✅');
  } else {
    await ctx.reply(`ভুল উত্তর ❌\nসঠিক উত্তর: ${q.answer}`);
  }

  state.currentQuestion++;
  await sendQuestion(ctx, userId);
});

function shuffleArray(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

bot.launch();
