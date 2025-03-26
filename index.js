import { CAINode } from 'cainode';
import { Telegraf } from 'telegraf';
import fs from 'fs';

// Config
const config = {
  telegramToken: 'YOUR_TELEGRAM_BOT_TOKEN',
  caiToken: 'YOUR_CAI_TOKEN',
  sessionFile: 'sessions.json'
};

// Init
const cai = new CAINode();
const bot = new Telegraf(config.telegramToken);
let sessions = {};

try {
  sessions = fs.existsSync(config.sessionFile) 
    ? JSON.parse(fs.readFileSync(config.sessionFile)) 
    : {};
} catch(err) {
  console.error('Gagal load session:', err);
}

async function loginCAI() {
  try {
    await cai.login(config.caiToken);
    console.log('✅ Login CAI berhasil');
  } catch(err) {
    console.error('❌ Gagal login CAI:', err);
    setTimeout(loginCAI, 5000);
  }
}

// Command
bot.command('set', async (ctx) => {
  const [_, charId] = ctx.message.text.split(' ');
  
  if(!charId) return ctx.reply('Contoh: /set ABC123');
  try {
    const newChat = await cai.character.create_new_conversation(true, { char_id: charId });
    const chatId = newChat.chat?.chat_id || newChat[0]?.chat.chat_id;
    const { character } = await cai.character.info(charId);
    sessions[ctx.chat.id] = {
      charId,
      chatId
    };
    saveSessions();
    const avatarUrl = `https://characterai.io/i/400/static/avatars/${character.avatar_file_name}?webp=true`;
    const message = 
        `Sukses set character ke *${character.name}*\n`+
      `🎭 *${character.title}*\n` +
      `_${character.description}_\n\n` +
      `👤 Creator: ${character.user__username || '-'}\n` +
      `💬 Interactions: ${character.participant__num_interactions?.toLocaleString() || 0}\n` +
      `🔗 ID: \`${charId}\``;
    await ctx.replyWithPhoto(avatarUrl, {
      caption: message,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Open in Browser', url: `https://character.ai/chat?char=${charId}` }]
        ]
      }
    });
    
  } catch(err) {
    console.error('Error:', err);
    ctx.reply('❌ Gagal mengatur karakter. Cek ID atau coba lagi.');
  }
});

bot.command('resetchat', async (ctx) => {
  const session = sessions[ctx.chat.id];
  if(!session?.charId) return ctx.reply('❌ Belum ada karakter yg diatur');
  
  try {
    const newChat = await cai.character.create_new_conversation(true, { char_id: session.charId });
    sessions[ctx.chat.id].chatId = newChat.chat?.chat_id || newChat[0]?.chat.chat_id;
    saveSessions();
    
    ctx.reply('🔄 Percakapan baru dimulai!');
  } catch(err) {
    ctx.reply('❌ Gagal reset chat');
  }
});

bot.command('status', (ctx) => {
  const session = sessions[ctx.chat.id];
  
  if(!session?.charId) {
    return ctx.reply('ℹ️ Tidak ada sesi aktif. Gunakan /set terlebih dahulu');
  }
  
  const statusMessage = 
    `📋 *Status Sesi*:\n` +
    `• Character ID: \`${session.charId}\`\n` +
    `• Chat ID: \`${session.chatId}\`\n` +
    `• Terakhir Update: ${new Date().toLocaleString()}`;
  
  ctx.replyWithMarkdown(statusMessage);
});

bot.start((ctx) => {
  ctx.replyWithMarkdown(
    `🤖 *CAI Bot*\n` +
    `Welcome to my bot!\n\n` +
    `📝 List Command:\n` +
    `/set [id_karakter] - Atur karakter\n` +
    `/resetchat - Mulai percakapan baru\n` +
    `/status - Cek status sesi`
  );
});

bot.on('text', async (ctx) => {
  const session = sessions[ctx.chat.id];
  if(!session?.chatId) return ctx.reply('ℹ️ Gunakan /set dulu');  
  try {
    await ctx.sendChatAction('typing');
    const response = await cai.character.send_message(
      ctx.message.text,
      false,
      "",
      {
        char_id: session.charId,
        chat_id: session.chatId,
        timeout_ms: 30000
      }
    );    
    if(response.turn?.candidates?.[0]?.raw_content) {
      ctx.replyWithMarkdown(response.turn.candidates[0].raw_content);
    } else {
      ctx.reply('❌ Tidak dapat respons');
    }
  } catch(err) {
    ctx.reply('⌛ Timeout. Coba pesan lebih pendek');
  }
});

function saveSessions() {
  try {
    fs.writeFileSync(config.sessionFile, JSON.stringify(sessions));
  } catch(err) {
    console.error('Gagal save session:', err);
  }
}

(async () => {
  await loginCAI();
  bot.launch();
  console.log('🤖 Bot jalan!');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));