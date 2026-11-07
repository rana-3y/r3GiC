const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
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
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value INTEGER
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
  // /help
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Botのコマンド一覧と使い方を表示します'),

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

  // /say (サーバー主、または許可されたロール持ち)
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Botに指定したメッセージを送信させます')
    .addStringOption(option => 
      option.setName('message').setDescription('送信したいメッセージ').setRequired(true)
    ),

  // /say-allow (サーバー主のみ：sayのロール開放)
  new SlashCommandBuilder()
    .setName('say-allow')
    .setDescription('【サーバー主専用】Say使用権ロール持ちにsayコマンドを許可します'),

  // /say-deny (サーバー主のみ：sayのロール制限)
  new SlashCommandBuilder()
    .setName('say-deny')
    .setDescription('【サーバー主専用】sayコマンドをサーバー主のみに制限します'),

  // /mdv (姉妹鯖の案内)
  new SlashCommandBuilder()
    .setName('mdv')
    .setDescription('姉妹鯖の情報を表示します')
].map(command => command.toJSON());

// スラッシュコマンドの登録＆ステータス設定
client.on('ready', async () => {
  console.log(`${client.user.tag} が起動したよ！`);

  client.user.setPresence({
    activities: [{ name: '/help | 1 on 1稼働', type: ActivityType.Playing }],
    status: 'online',
  });

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

// sayコマンドの許可状態を取得・設定する関数
function getSayAllowed() {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', ['say_allowed'], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.value : 0); // 0は不許可(主のみ), 1は許可(ロール持ちOK)
    });
  });
}

function setSayAllowed(value) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
      ['say_allowed', value, value],
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

  // --- /help ---
  if (commandName === 'help') {
    const helpMessage = `🤖 **r3GiC Bot コマンド一覧** 🤖
• \`/help\` : このヘルプメッセージを表示します
• \`/sc mm\` : Botを除いたサーバーのメンバー数を表示します
• \`/sc rl\` : 現在の特別ロール所持数を確認します
• \`/inv\` : 現在の招待数と次のロールまでの残りを確認します
• \`/mdv\` : 姉妹鯖の情報を表示します
• \`/say\` : 指定したメッセージをBotに喋らせる (サーバー主 or 許可時の「@⭐ | Say使用権」持ち)

🔒 **【管理者・運営・主専用コマンド】**
• \`/inv-add\` : 招待数を追加する (サーバー主)
• \`/inv-remove\` : 招待数を減らす (サーバー主)
• \`/rl-add\` : 特別ロール所持数を追加する (運営)
• \`/rl-remove\` : 特別ロール所持数を減らす (運営)
• \`/say-allow\` : Say使用権ロール持ちにsayを許可する (サーバー主)
• \`/say-deny\` : sayをサーバー主のみに制限する (サーバー主)`;

    await interaction.reply({ content: helpMessage, ephemeral: true });
  }

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
      message += ` > 残りカウント${remain}でサーバーの「招き猫🐱」ロール`;
    } else if (count < 10) {
      const remain = 10 - count;
      message += ` > 残りカウント${remain}でサーバーの「招き猫の親🐱」ロール`;
    } else if (count < 15) {
      const remain = 15 - count;
      message += ` > 残りカウント${remain}でサーバーの「招き猫の神(=^・^=)🐱」ロール`;
    }

    await interaction.reply(message);
  }

  // --- /inv-add (サーバー主のみ) ---
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

  // --- /inv-remove (サーバー主のみ) ---
  if (commandName === 'inv-remove') {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'このコマンドはサーバー主のみが使用できます！', ephemeral: true });
    }

    const target = options.getUser('target');
    const removeCount = options.getInteger('count');
    const currentCount = await getInviteCount(target.id);
    const newCount = Math.max(0, currentCount - removeCount);

    await setInviteCount(target.id, newCount);
    await interaction.reply(`${target.username} さんの招待数を **${removeCount}** 減らしました。（現在: ${newCount}）`);
  }

  // --- /rl-add (管理者権限持ちのみ) ---
  if (commandName === 'rl-add') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'このコマンドは管理者権限を持つ運営メンバーのみが使用できます！', ephemeral: true });
    }

    const target = options.getUser('target');
    const addCount = options.getInteger('count');
    const currentCount = await getRoleCount(target.id);
    const newCount = currentCount + addCount;

    await setRoleCount(target.id, newCount);
    await interaction.reply(`${target.username} さんの特別ロール所持数を **${addCount}** 追加しました。（現在: ${newCount}）`);
  }

  // --- /rl-remove (管理者権限持ちのみ) ---
  if (commandName === 'rl-remove') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'このコマンドは管理者権限を持つ運営メンバーのみが使用できます！', ephemeral: true });
    }

    const target = options.getUser('target');
    const removeCount = options.getInteger('count');
    const currentCount = await getRoleCount(target.id);
    const newCount = Math.max(0, currentCount - removeCount);

    await setRoleCount(target.id, newCount);
    await interaction.reply(`${target.username} さんの特別ロール所持数を **${removeCount}** 減らしました。（現在: ${newCount}）`);
  }

  // --- /say-allow (サーバー主のみ：ロール持ちのsayを許可) ---
  if (commandName === 'say-allow') {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'このコマンドはサーバー主のみが使用できます！', ephemeral: true });
    }

    await setSayAllowed(1);
    await interaction.reply({ content: '「@⭐ | Say使用権」ロールを持っているメンバーも `/say` を使えるように許可したよ！', ephemeral: true });
  }

  // --- /say-deny (サーバー主のみ：sayを主のみに制限) ---
  if (commandName === 'say-deny') {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'このコマンドはサーバー主のみが使用できます！', ephemeral: true });
    }

    await setSayAllowed(0);
    await interaction.reply({ content: '`/say` をサーバー主のみ使用可能に制限したよ！', ephemeral: true });
  }

  // --- /say ---
  if (commandName === 'say') {
    const isOwner = (interaction.guild.ownerId === interaction.user.id);
    const isAllowed = await getSayAllowed();
    const targetRoleId = '1568415235159629975';
    const hasRole = interaction.member.roles.cache.has(targetRoleId);

    // 権限チェック：
    // 1. サーバー主ならOK
    // 2. /say-allow が有効になっていて、かつ指定のロールを持っていればOK
    if (!isOwner && !(isAllowed === 1 && hasRole)) {
      return interaction.reply({ content: 'このコマンドを使用する権限がありません！', ephemeral: true });
    }

    const messageText = options.getString('message');
    await interaction.channel.send(messageText);
    await interaction.reply({ content: 'メッセージを送信したよ！', ephemeral: true });
  }

  // --- /mdv ---
  if (commandName === 'mdv') {
    await interaction.reply('姉妹鯖関係を結んでいるのはmaison de vacancier様です！');
  }
});

client.login(process.env.DISCORD_TOKEN);
