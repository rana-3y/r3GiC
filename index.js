const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages] });
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is awake!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

client.on('ready', () => console.log(`${client.user.tag} が起動したよ！`));

client.on('messageCreate', message => {
  if (message.author.bot) return;
  if (message.content === 'こんにちは') {
    message.reply('こんにちは！');
  }
});

client.login(process.env.DISCORD_TOKEN);
