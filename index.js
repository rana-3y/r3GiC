const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

// データベースの初期化
const db = new sqlite3.Database('./bot_data.db');
db.run(`
  CREATE TABLE IF NOT EXISTS invites (
    user_id TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS special_roles (
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
  // /sc mm と /sc rl
  new SlashCommandBuilder()
    .setName('sc')
    .setDescription('サーバーに関するコマンド')
    .addSubcommand(subcommand =>
      subcommand
        .setName('mm')
        .setDescription('Botを除いたサーバーのメンバー数を表示します')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rl')
        .setDescription('現在の特別ロール所持数を確認します')
    ),

  // /inv
  new SlashCommandBuilder()
    .setName('inv')
    .setDescription('現在の招待数を確認します'),

  // /inv-add (サーバー主のみ)
  new SlashCommandBuilder()
    .setName('inv-add')
    .setDescription('【サーバー主専用】指定したユーザーの招待数を追加します')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option => 
      option.setName('target').setDescription('対象のユーザー').setRequired(true)
    )
    .addIntegerOption(option => 
      option.setName('count').setDescription('追加する招待数').setRequired(true)
    ),

  // /inv-remove (サーバー主のみ)
  new SlashCommandBuilder()
    .setName('inv-remove')
    .setDescription('【サーバー主専用】指定したユーザーの招待数を減らします')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option => 
      option.setName('target').setDescription('対象のユーザー').setRequired(true)
    )
    .addIntegerOption(option => 
      option.setName('count').setDescription('減らす招待数').setRequired(true)
    ),

  // /rl-add (管理者権限持ちのみ：特別ロール追加)
  new SlashCommandBuilder()
    .setName('rl-add')
    .setDescription('【運営専用】指定したユーザーの特別ロール所持数を追加します')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option => 
      option.setName('target').setDescription('対象のユーザー').setRequired(true)
    )
    .addIntegerOption(option => 
      option.setName('count').setDescription('追加する数').setRequired(true)
    ),

  // /rl-remove (管理者権限持ちのみ：特別ロール削除)
  new SlashCommandBuilder()
    .setName('rl-remove')
    .setDescription('【運営専用】指定したユーザーの特別ロール所持数を減らします')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option => 
      option.setName('target').setDescription('対象のユーザー').setRequired(true)
    )
    .addIntegerOption(option => 
      option.setName('count').setDescription('減らす数').setRequired(true)
    ),

  // /say (サーバー主のみ)
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('【サーバー主専用】Botに指定したメッセージを送信させます')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => 
      option.setName('message').setDescription('送信したいメッセージ').setRequired(true)
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

// データベース処理用関数（招待数）
function getInviteCount(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT count FROM invites WHERE user_id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.count : 0);
    });
  });
}

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

// データベース処理用関数（特別ロール所持数）
function getRoleCount(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT count FROM special_roles WHERE user_id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.count : 0);
    });
  });
}

function setRoleCount(userId, count) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO special_roles (user_id, count) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET count = ?',
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

  // --- /sc mm または /sc rl ---
  if (commandName === 'sc') {
    const subcommand = options.getSubcommand();
    
    if (subcommand === 'mm') {
      const guild = interaction.guild;
      const members = await guild.members.fetch();
      const humanCount = members.filter(member => !member.user.bot).size;
      await interaction.reply(`現在のサーバー人数（Bot除く）は **${humanCount}人** だよ！`);
    } 
    else if (subcommand === 'rl') {
      const targetUser = interaction.user;
      const count = await getRoleCount(targetUser.id);
      await interaction.reply(`${targetUser.username}さんの特別ロール所持数は${count}です！`);
    }
  }

  // --- /inv ---
  if (commandName === 'inv') {
    const targetUser = interaction.user;
    const count = await getInviteCount(targetUser.id);
    
    let message = `${targetUser.username}さんの招待数は${count}です！`;

    if (count < 6) {
      const remain = 6 - count;
      message += ` > 残りカウント${remain}で「招き猫🐱」ロール`;
    } else if (count < 10) {
      const
