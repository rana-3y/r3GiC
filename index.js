// --- /say (メッセージ送信：サーバー主のみ) ---
  if (commandName === 'say') {
    // サーバー主チェック
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'このコマンドはサーバー主のみが使用できます！', ephemeral: true });
    }

    const messageText = options.getString('message');

    // コマンドを実行したチャンネルにBotとしてメッセージを送信
    await interaction.channel.send(messageText);

    // コマンド実行者だけに「送信完了」の通知を返す
    await interaction.reply({ content: 'メッセージを送信したよ！', ephemeral: true });
  }
