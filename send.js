const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds] 
});

// コマンドライン引数から「チャンネルID」と「メッセージ」を取得
const channelId = process.argv[2];
const messageText = process.argv[slice(3)].join(' ') || process.argv[3];

if (!channelId || !messageText) {
  console.log('❌ 使い方: node send.js <チャンネルID> <送信したいメッセージ>');
  process.exit(1);
}

client.once('ready', async () => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(messageText);
      console.log('✅ メッセージの送信に成功したよ！');
    } else {
      console.log('❌ チャンネルが見つからないか、テキストチャンネルではありません。');
    }
  } catch (error) {
    console.error('❌ 送信エラー:', error);
  }
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
