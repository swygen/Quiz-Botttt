import json
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, CallbackQueryHandler, ContextTypes
from config import BOT_TOKEN, GROUP_ID, GROUP_LINK
from keep_alive import keep_alive
import random

user_state = {}

def shuffle_questions(qs):
    random.shuffle(qs)
    return qs

def load_quiz():
    with open("quiz.json", "r", encoding="utf-8") as f:
        return json.load(f)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    user_state[user_id] = {
        "score": 0,
        "current": 0,
        "joined": False,
        "feedback": [],
        "waiting_feedback": False,
        "questions": shuffle_questions(load_quiz())
    }

    keyboard = [
        [InlineKeyboardButton("গ্রুপে যাও", url=GROUP_LINK)],
        [InlineKeyboardButton("✅ Joined", callback_data="check_join")]
    ]
    await update.message.reply_text(
        f"স্বাগতম {update.effective_user.first_name}! আগে গ্রুপে জয়েন করুন:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

async def check_join(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = query.from_user.id

    try:
        member = await context.bot.get_chat_member(chat_id=GROUP_ID, user_id=user_id)
        if member.status in ['member', 'administrator', 'creator']:
            user_state[user_id]["joined"] = True
            await query.edit_message_text("✅ গ্রুপে জয়েন নিশ্চিত! মেনু দেখুন:")
            await show_menu(query.message.chat_id, context)
        else:
            await query.answer("⚠️ আগে গ্রুপে জয়েন করুন!", show_alert=True)
    except:
        await query.message.reply_text("গ্রুপ যাচাই করা যায়নি।")

async def show_menu(chat_id, context):
    keyboard = [["🧠 Start Quiz"], ["👤 Profile", "⭐ Feedback"], ["📤 Share"]]
    await context.bot.send_message(chat_id=chat_id, text="মেনু থেকে একটি অপশন বেছে নিন:",
                                   reply_markup=ReplyKeyboardMarkup(keyboard, resize_keyboard=True))

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    text = update.message.text
    state = user_state.get(user_id)

    if not state or not state.get("joined"):
        return

    if state["waiting_feedback"]:
        state["feedback"].append(text)
        state["waiting_feedback"] = False
        await update.message.reply_text("✅ ধন্যবাদ আপনার মতামতের জন্য!")
        return

    if text == "👤 Profile":
        await update.message.reply_text(
            f"নাম: {update.effective_user.first_name}\nস্কোর: {state['score']}/{len(state['questions'])}")
        return

    if text == "⭐ Feedback":
        state["waiting_feedback"] = True
        await update.message.reply_text("আপনার মতামত লিখুন:")
        return

    if text == "📤 Share":
        await update.message.reply_text("আমি একটি মজার কুইজ বট ব্যবহার করছি! দেখুন: https://t.me/your_bot_username")
        return

    if text == "🧠 Start Quiz":
        state["score"] = 0
        state["current"] = 0
        state["questions"] = shuffle_questions(load_quiz())
        await send_question(update, context)
        return

    # Check answer
    if state["current"] >= len(state["questions"]):
        return

    q = state["questions"][state["current"]]
    if text == q["answer"]:
        state["score"] += 1
        await update.message.reply_text("✅ অভিনন্দন! সঠিক উত্তর!")
    else:
        await update.message.reply_text(f"❌ ভুল উত্তর! সঠিক উত্তর: {q['answer']}")

    state["current"] += 1
    await asyncio.sleep(2)
    await send_question(update, context)

async def send_question(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    state = user_state[user_id]

    if state["current"] >= len(state["questions"]):
        await update.message.reply_text(f"✅ কুইজ শেষ! আপনার স্কোর: {state['score']}/{len(state['questions'])}")
        await show_menu(update.effective_chat.id, context)
        return

    q = state["questions"][state["current"]]
    options = [[opt] for opt in q["options"]]
    await update.message.reply_text(
        f"⏳ সময় বাকি: 60s\n\nপ্রশ্ন: {q['question']}\nবিষয়: {q['subject']}",
        reply_markup=ReplyKeyboardMarkup(options, one_time_keyboard=True, resize_keyboard=True)
    )

    await asyncio.sleep(60)
    if state["current"] < len(state["questions"]):
        await update.message.reply_text(f"⏰ সময় শেষ!\nসঠিক উত্তর: {q['answer']}")
        state["current"] += 1
        await send_question(update, context)

if __name__ == "__main__":
    keep_alive()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(check_join))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    print("✅ Bot is running...")
    app.run_polling()
