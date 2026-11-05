const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

// データベースの初期化
const db = new sqlite3.Database('./invites.db');
db.run(`
  CREATE TABLE IF NOT EXISTS invites (
    user_id TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
  )
`);

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

// スラッシュコマンドの定義
const commands = [
  // /sc mm
  new SlashCommandBuilder()
    .setName('sc')
    .setDescription('サーバーに関するコマンド')
    .addSubcommand(subcommand =>
      subcommand
        .setName('mm')
        .setDescription('Botを除いたサーバーのメンバー数を表示します')
    ),

  // /inv (自分の招待数を表示)
  new SlashCommandBuilder()
    .setName('inv')
    .setDescription('現在の招待数を確認します'),

  // /inv-add (サーバー主のみ：招待数を追加)
  new SlashCommandBuilder()
    .setName('inv-add')
    .setDescription('【サーバー主専用】指定したユーザーの招待数を追加します')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 管理者権限が必要
    .addUserOption(option => 
      option.setName('target').setDescription('対象のユーザー').setRequired(true)
    )
    .addIntegerOption(option => 
      option.setName('count').setDescription('追加する招待数').setRequired(true)
    ),

  // /inv-remove (サーバー主のみ：招待数を削除)
  new SlashCommandBuilder()
    .setName('inv-remove')
    .setDescription('【サーバー主専用】指定したユーザーの招待数を減らします')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 管理者権限が必要
    .addUserOption(option => 
      option.setName('target').setDescription('対象のユーザー').setRequired(true)
    )
    .addIntegerOption(option => 
      option.setName('count').setDescription('減らす招待数').setRequired(true)
    )
].map(command => command.toJSON());

// スラッシュコマンドの登録
client.on('ready', async () => {
  console.log(`${client.user.tag} が起動したよ！`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('スラッシュコマンドの登録が完了したよ！');
  } catch (error) {
    console.error('コマンド登録エラー:', error);
  }
});

// 招待数の取得関数
function getInviteCount(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT count FROM invites WHERE user_id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.count : 0);
    });
  });
}

// 招待数の設定関数
function setInviteCount(userId, count) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO invites (user_id, count) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET count = ?',
      [userId, count, count],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// コマンド処理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  // --- /sc mm ---
  if (commandName === 'sc') {
    if (options.getSubcommand() === 'mm') {
      const guild = interaction.guild;
      const members = await guild.members.fetch();
      const humanCount = members.filter(member => !member.user.bot).size;
      await interaction.reply(`現在のサーバー人数（Bot除く）は **${humanCount}人** だよ！`);
    }
  }

  // --- /inv (確認) ---
  if (commandName === 'inv') {
    const targetUser = interaction.user;
    const count = await getInviteCount(targetUser.id);
    
    let message = `${targetUser.username}さんの招待数は${count}です！`;

    if (count < 6) {
      const remain = 6 - count;
      message += ` > 残りカウント${remain}で「招き猫🐱」ロール`;
    } else if (count < 10) {
      const remain = 10 - count;
      message += ` > 残りカウント${remain}で「招き猫の親🐱」ロール`;
    } else if (count < 15) {
      const remain = 15 - count;
      message += ` > 残りカウント${remain}で「招き猫の神(=^・^=)🐱」ロール`;
    }

    await interaction.reply(message);
  }

  // --- /inv-add (追加：サーバー主のみ) ---
  if (commandName === 'inv-add') {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'このコマンドはサーバー主のみが使用できます！', ephemeral: true });
    }

    const target = options.getUser('target');
    const addCount = options.getInteger('count');
    const currentCount = await getInviteCount(target.id);
    const newCount = currentCount + addCount;

    await setInviteCount(target.id, newCount);
    await interaction.reply(`${target.username} さんの招待数を **${addCount}** 追加しました。（現在: ${newCount}）`);
  }

  // --- /inv-remove (削除：サーバー主のみ) ---
  if (commandName === 'inv-remove') {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'このコマンドはサーバー主のみが使用できます！', ephemeral: true });
    }

    const target = options.getUser('target');
    const removeCount = options.getInteger('count');
    const currentCount = await getInviteCount(target.id);
    const newCount = Math.max(0, currentCount - removeCount); // 0未満にはならないように設定

    await setInviteCount(target.id, newCount);
    await interaction.reply(`${target.username} さんの招待数を **${removeCount}** 減らしました。（現在: ${newCount}）`);
  }
});

client.login(process.env.DISCORD_TOKEN);
