# 日文翻译文件（对应 game/l10n_test.rpy）
# 组织：game/tl/japanese/ 目录，translate 语句重写 say，strings 块做 old/new

translate japanese hello_line:
    # e "你好，这是需要翻译的对白。"
    e "こんにちは、これは翻訳が必要な台詞です。"

translate japanese strings:
    old "艾琳"
    new "アイリン"

    old "继续"
    new "続ける"

    old "结束"
    new "終了"

    old "字符串翻译测试：_() 标记的字符串"
    new "文字列翻訳テスト：_() でマークされた文字列"
