const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

// Botの作成（メンバー情報を取得するために GuildMembers インテントが必要）
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ] 
});

// Express（UptimeRobot用）
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is awake!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// スラッシュコマンドの定義 (/sc mm)
const commands = [
  new SlashCommandBuilder()
    .setName('sc')
    .setDescription('サーバーに関するコマンド')
    .addSubcommand(subcommand =>
      subcommand
        .setName('mm')
        .setDescription('Botを除いたサーバーのメンバー数を表示します')
    )
].map(command => command.toJSON());

// Botの起動＆スラッシュコマンド登録
client.on('ready', async () => {
  console.log(`${client.user.tag} が起動したよ！`);

  // Discordにスラッシュコマンドを登録
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('スラッシュコマンドを登録中...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('スラッシュコマンドの登録が完了したよ！');
  } catch (error) {
    console.error('コマンド登録エラー:', error);
  }
});

// スラッシュコマンドが実行されたときの処理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'sc') {
    if (options.getSubcommand() === 'mm') {
      // サーバーの全メンバーを取得（キャッシュ＋取得）
      const guild = interaction.guild;
      const members = await guild.members.fetch();
      
      // Botを除外したメンバー数をカウント
      const humanCount = members.filter(member => !member.user.bot).size;

      // 返信
      await interaction.reply(`現在のサーバー人数（Bot除く）は **${humanCount}人** だよ！`);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
