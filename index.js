// index.js
import express from 'express';
import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

let quizData = JSON.parse(fs.readFileSync('./quiz.json', 'utf-8'));
let askedQuestions = new Set();

// Keep Alive
app.get('/', (req, res) => {
  res.send('Quiz Bot is running');
});
app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

const joinChannelLink = 'https://t.me/your_channel_username'; // Replace with actual channel link

bot.start(async (ctx) => {
  await ctx.reply(
    'বট ব্যবহার করতে আমাদের গ্রুপে জয়েন করুন।',
    Markup.inlineKeyboard([
      Markup.button.url('Join Group', joinChannelLink),
      Markup.button.callback('Joined', 'joined')
    ])
  );
});

bot.action('joined', async (ctx) => {
  await ctx.reply(
    'Welcome! Choose an option:',
    Markup.keyboard([['Start Quiz'], ['Feedback', 'Profile'], ['Share']]).resize()
  );
});

bot.hears('Start Quiz', (ctx) => {
  sendQuestion(ctx);
});

function sendQuestion(ctx) {
  if (askedQuestions.size >= quizData.length) {
    askedQuestions.clear();
  }
  const remainingQuestions = quizData.filter((_, idx) => !askedQuestions.has(idx));
  const randomIndex = Math.floor(Math.random() * remainingQuestions.length);
  const question = remainingQuestions[randomIndex];
  const questionIndex = quizData.indexOf(question);
  askedQuestions.add(questionIndex);

  ctx.reply(
    `${question.subject} প্রশ্ন:
${question.question}

সময়: ১ মিনিট`,
    Markup.inlineKeyboard(
      question.options.map((opt) => Markup.button.callback(opt, `answer:${question.answer}:${opt}`))
    )
  );

  setTimeout(() => {
    ctx.deleteMessage().catch(() => {});
    sendQuestion(ctx);
  }, 60000); // 1 minute
}

bot.action(/answer:(.+):(.+)/, async (ctx) => {
  const correct = ctx.match[1];
  const chosen = ctx.match[2];

  if (correct === chosen) {
    await ctx.reply('সঠিক উত্তর! অভিনন্দন!');
    ctx.deleteMessage().catch(() => {});
    sendQuestion(ctx);
  } else {
    await ctx.reply(`ভুল উত্তর! সঠিক উত্তর ছিল: ${correct}`);
    setTimeout(() => {
      ctx.deleteMessage().catch(() => {});
      sendQuestion(ctx);
    }, 5000);
  }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
