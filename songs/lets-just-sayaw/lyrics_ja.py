# Japanese lyrics for "let's just sayaw", one sung syllable (token) per note.
# Each phrase: (tokens, written Japanese, original English, English back-translation[, rhyme note]).
# Tokens are space-separated per note; "|" marks word breaks (used for the romaji guide and
# the rhythm check). Tokens are phonetic: particles are written as sung (は→わ, へ→え, を→お),
# "br" is a breath.
# Rules: one sung syllable per note (a long vowel, ん or っ stays inside its syllable; never two
# different vowels on one note); only notes a quarter or longer are split, into eighths (SPLITS
# below); no particle on a beat; say what the English says, in natural Japanese. Where a line has
# fewer notes than the English needs, minor words are left out and listed in the back-translation
# as [not sung: ...]. Lines that repeat in English are worded the same in Japanese, changing only
# where the English changes.

V1 = ("br | ま い に ち | だ る く て | お く れ が ち | じ み な | た す く | お わ ら ず | ま た | しゅっ しゃ | お な じ | て じゅん | はん せ い",
      "（ブレス）毎日 だるくて 遅れがち 地味なタスク 終わらず また出社 同じ手順 反省",
      "Every day's feeling like a drag, suffering from the lag, mundane tasks, coming endless tasks, clocking in again with the same approach, reflect",
      "Every day's a drag, always lagging. Mundane tasks, never ending. Clocking in again, the same routine; reflect.")
V1_NB = (V1[0].split("|", 1)[1], V1[1].replace("（ブレス）", ""), V1[2], V1[3])
WAIT = ("ちょ | い つ ま で", "ちょ いつまで", "Wait, when will this end", "Wait, how long will this go on?")
V2 = (WAIT[0] + " | こ こ | の | お と | ずっ と | お う | ぜ ん ぶ | しょ う きゅ う | ね ら い | ま じ | み あ う | う ん め い | しょ う き | のお",
      WAIT[1] + " ここの音 ずっと追う 全部 昇給狙い マジ 見合う？ 運命 正気 ノー",
      "Wait, when will this end? The humming of this place, an endless chase, all of this just for a chance of a raise. Is it really worth my fate, my sanity? No.",
      "Wait, how long will this go on? The sound of this place, always chasing. All of it, going for a raise. Really worth it? My fate, my sanity? No. [not sung: just]")
CASH = ("ぶっ ちゃ け | さ | か ね | い る", "ぶっちゃけさ 金要る", "Frankly, but I need some cash",
        "Frankly, y'know, I need cash. [not sung: but (the backing sings it)]")
CASH5 = ("で も | か ね | い る", "でも 金要る", "But I need some cash", "But I need cash.")
# "I can't help but dance to the tune, one": 曲 (the tune), つい踊っちゃう (I can't help dancing).
HOOK9 = ("きょ く | つ い | お どっ ちゃ う | い ち", "曲 つい踊っちゃう いち", "I can't help but dance to the tune, one",
         "The tune: I can't help dancing. One!")
HOOK9_BACK = ("きょ く | つ い | お どっ ちゃ う | い", "曲 つい踊っちゃう い(ち)", HOOK9[2],
              HOOK9[3] + " (its last note is too short to split, so it holds い)")
HOOK7 = ("つ い | お どっ ちゃ う | い ち", "つい踊っちゃう いち", "...help but dance to the tune, one", "...can't help dancing. One!")
SONG10 = ("で も | う た | つ い | お どっ ちゃ う", "でも 歌 つい踊っちゃう", "But with song, can't help but dance to the tune",
          "But a song, and I can't help dancing. [not sung: to the tune]")
THREE = ("さん | けん", "３件", "Three more", "Three more")
TWO = ("に | けん", "２件", "Two more", "Two more")
LAST_BACK = ("さ い", "最(後)", "One last", "The last (doubles the main line's 最後; its notes are too short to split)")
SO_DANCE7 = ("だ か ら | お ど る | よ", "だから 踊るよ", "So I dance, dance to the tune", "So I dance! [not sung: dance to the tune]")
SO_DANCE8 = ("だ か ら | お ど る | よ | い ち", "だから 踊るよ いち", "So I just dance to the tune, one",
             "So I dance! One! [not sung: just, to the tune]")
LETS = ("さあ | い ま | お ど ろ", "さあ 今 踊ろ", "Let's just dance", "Come on, now, let's dance.")
LIES = ("な ぜ | う そ | う の み", "なぜ 嘘 鵜呑み", "Why do we feed to such lies", "Why swallow lies whole? [not sung: such]")
LIES_NOW = ("な ぜ | う そ | う の み | い ま | お ど る", "なぜ 嘘 鵜呑み 今 踊る",
            "Why do we feed to such lies, but now I dance here", "Why swallow lies whole? Now I dance. [not sung: such, but, here]")
AGAIN_UNREAL = ("ん | なん ど も | ふ し ぎ", "（ん）何度も 不思議", "Again and again, unreal", "Over and over, unreal.")
WORRIES_GONE = ("な や み | き え る | ま で", "悩み消えるまで", "Until my problems go away", "Until my worries go away.")
BURN12 = ("も え て | もっ と | こ こ ろ | ま う | もっ と", "燃えて もっと 心舞う もっと", "I'm burning brighter, my soul is lifted higher",
          "Burning more and more; my heart dances, higher and higher.")
CLEAR10 = ("もう | く り あ | な ん ど も | ゆ め", "もう クリア 何度も 夢", "So damn clear, again and again, surreal",
           "So clear now. Again and again, like a dream.")
FREE13 = ("じ ゆ う | な や み | ぜん ぶ | き え た | い ま", "自由 悩み全部 消えた 今",
          "I'm truly free since now all my worries washed away", "Free. All my worries vanished, now. [not sung: truly]")
TOGETHER8 = ("いっ しょ に | ね | お ど ろ う", "一緒にね 踊ろう", "Together we dance to the tune",
             "Together, okay? Let's dance. [not sung: to the tune]")
# The two "steps tell a story" lines are worded alike; only tense and legacy / symphony change.
STORY = ("br | あ し | か た る | た ま し い | そ れ | な や み | と る | ろ す | も | れ が しい | に",
         "（ブレス）足 語る 魂それ 悩み取る ロスも レガシーに",
         "(breath) Steps tell a story, stray from the soul that takes your worries, from loss to legacy",
         "(breath) My steps tell it: straying from the soul, they take worries. Even loss becomes legacy. [not sung: your]")
STORY2 = ("br | あ し | か たっ た | た ま し い | そ れ | な や み | とっ た | ろ す | も | しん ふぉ にい | に",
          "（ブレス）足 語った 魂それ 悩み取った ロスも シンフォニーに",
          "(breath) Steps told a story, stray from my soul that took my worries, from loss to symphony",
          "(breath) My steps told it: straying from the soul, they took worries. Even loss became a symphony. [not sung: my]")
LA20 = (" ".join(["ら"] * 20), "ら ら ら…", "la la la...", "la la la...")
LA13 = (" ".join(["ら"] * 13), "ら ら ら…", "la la la...", "la la la...")

GROUPS = {
    "c0cc1d55": [V1, V2, CASH],                      # rap (verse 1)
    "3cf084c3": [V1_NB, V2, CASH5],                  # backing: verse 1
    "8ae78072": [HOOK7],                             # main singing
    "0150b320": [(                                   # rap_R (verse 2)
        "ろ く じ | き しょ う | い や だ | りょ う きん | は ら う | く そ | ちょっ と | ち こ く | み ち | も | び みょ う | きゅ う りょ う | へ ら さ れ | わあ | しょ る い | お | て | に | お ど る | と らん す | の | り ず む | の る | ねえ | の り | か ん じ る | " + HOOK9[0],
        "六時起床 いやだ 料金払う くそ ちょっと遅刻 道も微妙 給料減らされ わあ 書類を手に 踊る トランスのリズム乗る ねえ ノリ感じる？ " + HOOK9[1],
        "Wake up at six AM, don't want to, but I got bills to pay. Too damn... Clocked in a bit late, traffic wasn't that great, but I get my pay reduced too. Wow. Paperwork in my hands, then I start to dance to the rhythm of this trance. Whoa yo, you feeling this groove? I can't help but dance to the tune, one",
        "Up at six. Don't want to. Bills to pay. Damn. A little late; the roads weren't great either. My pay got cut. Wow. Paperwork in hand, I dance, riding the trance's rhythm. Hey, feeling the groove? The tune: I can't help dancing. One! [not sung: but (x2), too (damn), too (pay cut), then, start to, this]",
        "od-oru / n-oru (dance / ride)")],
    "8ccfbf01": [("そ", "（く）そ", "Damn", "(Da)mn: doubles the end of the main line's くそ"),
                 ("へ ら さ れ | わあ", "減らされ わあ", "Pay reduced too, wow", "Got cut. Wow."),
                 ("こ の | り ず む | の る", "このリズム乗る", "To the rhythm of this trance", "Riding this rhythm.")],
    "72bac218": [HOOK9_BACK],
    "f9a58923": [(                                   # rap_R_R (count verse)
        "に | ま た か | さん | よん | わ | ざ ん ぎょう | ご | ろ く | お な じ | て | " + SONG10[0] + " | さん",
        "２ またか ３ ４は 残業 ５ ６ 同じ手 " + SONG10[1] + " ３",
        "Two, nothing new. Three, four, go work some more. Five, six, the same old trick, but with song can't help but dance to the tune. Three",
        "Two: this again. Three, four: overtime. Five, six: the same old trick. But a song, and I can't help dancing. Three! [not sung: to the tune]")],
    "cd3756da": [SONG10],
    "069ed0d1": [THREE, TWO, LAST_BACK, SO_DANCE7],
    "23024df8": [(                                   # rap_R_R_R (countdown)
        "お どっ ちゃ う | さん | けん | の | く じょ う | に | けん | の | ほう こ く | さ い ご | なん | の | た め",
        "踊っちゃう ３件の苦情 ２件の報告 最後 何のため",
        "Dance to the tune. Three more complaints before, two more reports to store, one last... but what's it for?",
        "I can't help dancing. Three complaints, two reports, the last one... what's it for? [not sung: to the tune, more, before, to store, but]"),
        SO_DANCE8],
    "32a1d401": [("br | しん ぱ い | な い", "（ブレス）心配ない", "(breath) No need to worry", "(breath) No need to worry."),
                 STORY,
                 ("じ ゆ う | い ま", "自由 今", "I feel untethered", "Free, now. [not sung: I feel]",
                  "i-ma / pafo-ma (untethered / performer)"),
                 ("ぱ ふぉ ま", "パフォーマー", "Performer", "Performer.")],
    "62b9e1ec": [("ぱ ふぉ ま | も え て る | み た い | け ど | つ か れ | な い",
                  "パフォーマー 燃えてるみたい けど 疲れない",
                  "Performer, I feel like I'm on fire, yet I do not feel tired",
                  "Performer. Like I'm on fire, yet I'm not tired.",
                  "mita-i / tsukare-nai (fire / tired)"),
                 LIES_NOW,
                 ("わ か ら な い | きょ う | も | こ こ | で | お な じ | るう てぃ ん | " + AGAIN_UNREAL[0].split("|", 1)[1] + " | あ し | で | ゆ め み",
                  "わからない 今日もここで 同じルーティン 何度も 不思議 足で夢見",
                  "Currently nothing's clear, another day here, yet it's all the same routine, again and again, unreal, dreaming with my feet",
                  "Nothing's clear. Here again today, the same routine. Over and over, unreal. Dreaming with my feet. [not sung: currently, yet, all]"),
                 ("ま よっ て る | な や み | き え る | ま で", "迷ってる 悩み消えるまで",
                  "I'm still lost, so until my problems go away", "I'm lost, until my worries go away. [not sung: still, so]"),
                 LETS],
    "08029339": [LIES, AGAIN_UNREAL],
    "774fb473": [WORRIES_GONE, LETS],
    "8604f826": [LA20, LA13],
    "c2dc885a": [LA20, LA13],
    "14728cc3": [(                                   # lalala_R
        "ど こ | え | い け ば | お ふぃ す | ま た | だ | ざ つ よう | と けい | ち く | た く | り ず む | う た | つ い | お どっ ちゃ う | さん | ま よ い | む し | に | あ し | ゆ か | ふ む | いっ ぽ | ど あ | お | で る",
        "どこへ行けば オフィス まただ 雑用 時計 チクタク リズム 歌 つい踊っちゃう ３ 迷い無視 ２ 足 床踏む １歩 ドアを出る",
        "And don't know where to go, another chore on the office floor. Clock ticks, the rhythm clicks, so with song can't help but dance to the tune. Three more doubts to ignore, two more feet to the floor, one last step through the door",
        "Where should I go? The office, chores again. The clock goes tick-tock, a rhythm. A song, and I can't help dancing. Three: ignore the doubts. Two: feet on the floor. One step: out the door. [not sung: clicks, so, to the tune, more, last]"),
        ("いっ", "（一緒）", "Together", "(To-)gether: doubles the start of 一緒")],
    "7f010356": [("へい", "ヘイ", "Hey!", "Hey!"),
                 ("ま い に ち | お な じ | や す め ず | ね む い | の に | さ え る | で | ね て | ば れ | ぶ ちょ う | よ び | も ん く | い え ず | い え ば",
                  "毎日 同じ 休めず 眠いのに 冴える で 寝てバレ 部長呼び 文句言えず 言えば…",
                  "Day and day it's all the same, can't catch a break, wanna sleep but I'm wide awake. Caught napping in the stall, boss called, yet I can't even complain, if you do, you're...",
                  "Every day the same, no break. Sleepy, yet wide awake. Then caught sleeping; the boss calls me in; can't complain. If you do... [not sung: in the stall, even]"),
                 ("ま た | ま た | そ し て | ま た | て い ぎ | し て | きょ う き | の | い み | お",
                  "また また そして また 定義して 狂気の意味を",
                  "Again, and again, and then again. Wait, please define the meaning of insanity",
                  "Again, and again, and then again. Please define the meaning of insanity. [not sung: wait]"),
                 ("げ ん じ つ | わ | ね | す べ て | が | きょ え い | な ん て | ひ げ き | わ た し | と | しょ う き",
                  "現実はね すべてが虚栄 なんて悲劇 私と正気",
                  "In reality, it's all an empty vanity. Oh, what a tragedy for me and my sanity",
                  "In reality, everything is empty vanity. What a tragedy, for me and my sanity. [not sung: oh]",
                  "kyoe-i / hige-ki / shou-ki (vanity / tragedy / sanity)")],
    "17e19177": [("br | へい", "（ブレス）ヘイ", "(breath) Hey!", "(breath) Hey!")],
    "8d9f4509": [("ま た | こ こ | さ む く | し ば ら れ | じゅう じ | ま で", "またここ 寒く 縛られ 十時まで",
                  "Here we are again, same old same cold place, controlled, work till ten",
                  "Here again: cold, tied down, until ten. [not sung: same old same, work]"),
                 ("ま た | な や む | あっ て る | は ん せい", "また悩む 合ってる？ 反省",
                  "Wondering again if I'm correct, reflect", "Worrying again: am I right? Reflect."),
                 V2, CASH],
    "bf71f061": [WAIT],
    "9c645ae1": [("ほ ら | う た | つ い | お どっ ちゃ う | さん | ま", "ほら 歌 つい踊っちゃう ３（迷い）",
                  "So with song, can't help but dance to the tune, three more", "So, a song, and I can't help dancing. Three... (doubles the main line)"),
                 ("に | あ", "２ 足", "Two more", "Two: feet (its last note is too short to split, so it holds あ)"),
                 ("いっ ぽ", "１歩", "One last", "One step"),
                 TOGETHER8],
    "de46ba17": [(TOGETHER8[0] + " | い えい", TOGETHER8[1] + " イェイ", "Together we dance to the tune, yeah",
                  "Together, okay? Let's dance. Yeah! [not sung: to the tune]")],
    "65c2dd6c": [("い えい", "イェイ", "Yeah", "Yeah!"),                                 # 2nd chorus
                 ("しん ぱ い | せ ず", "心配せず", "I do not worry", "Not worrying."),
                 STORY2,
                 ("じ ゆ う | の | み | い つ も | " + BURN12[0],
                  "自由の身 いつも " + BURN12[1],
                  "I'm still untethered forever, I'm burning brighter, my soul is lifted higher",
                  "Free, always. Burning more and more; my heart dances, higher and higher. [not sung: still]",
                  "itsu-mo / mot-to / mot-to (forever / brighter / higher)"),
                 (LIES_NOW[0], LIES_NOW[1], "Why did I feed to such lies, and now I dance here", LIES_NOW[3]),
                 ("む ね | は れ て | やっ と | だ | こ こ | で | も う | く り あ | な ん ど も | ゆ め | こ こ | に | た つ",
                  "胸 晴れて やっとだ ここで " + CLEAR10[1] + " ここに立つ",
                  "My mind fully clear, finally here, and it's all so damn clear, again and again, surreal, I'm here with my feet",
                  "My heart clears. Finally: here. So clear now. Again and again, like a dream. Standing here on my feet. [not sung: fully, and it's all]"),
                 FREE13, LETS],
    "b4c6ca78": [BURN12],
    "14573d10": [LIES, CLEAR10],
    "3de4494d": [FREE13, LETS],
}

# Long notes split to fit one syllable per note: (groups, phrase, note, sixteenths in the first part),
# applied in this order to the original project (phrases as in apply_lyrics.py). Every resulting
# note is an eighth or longer.
SPLITS = [
    ("c0cc1d55", 2, 6, 2), ("3cf084c3", 2, 4, 2), ("8d9f4509", 3, 6, 2),          # 要る
    ("0150b320", 0, 70, 2), ("8ae78072", 0, 6, 2),                                 # いち (hook)
    ("f9a58923", 0, 10, 2),                                                        # ご｜ろく
    ("23024df8", 0, 21, 2), ("23024df8", 1, 7, 2),                                 # ため, いち
    ("32a1d401", 1, 20, 2), ("32a1d401", 1, 14, 2), ("32a1d401", 1, 6, 2),         # story
    ("65c2dd6c", 2, 20, 2), ("65c2dd6c", 2, 14, 2), ("65c2dd6c", 2, 6, 2),         # story 2
    ("62b9e1ec", 2, 27, 2),                                                        # 夢見
    ("62b9e1ec", 4, 2, 2), ("62b9e1ec", 4, 3, 2), ("62b9e1ec", 4, 1, 2),           # 今 踊ろ
    ("774fb473", 1, 2, 2), ("774fb473", 1, 3, 2), ("774fb473", 1, 1, 2),
    ("65c2dd6c", 7, 2, 2), ("65c2dd6c", 7, 3, 2), ("65c2dd6c", 7, 1, 2),
    ("3de4494d", 1, 2, 2), ("3de4494d", 1, 3, 2), ("3de4494d", 1, 1, 2),
    ("14728cc3", 0, 48, 2), ("14728cc3", 0, 38, 2), ("14728cc3", 0, 15, 2),       # 出る, 足, 時計
    ("de46ba17", 0, 8, 2), ("65c2dd6c", 0, 0, 2),                                  # イェイ
]
