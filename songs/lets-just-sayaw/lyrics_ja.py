# Japanese lyrics for "let's just sayaw", one sung syllable (token) per note.
# Each phrase: (tokens, written Japanese, original English, English back-translation[, rhyme note]).
# Tokens are space-separated per note; "|" marks word breaks (used for the romaji guide and
# the rhythm check). Tokens are phonetic: particles are written as sung (は→わ, へ→え, を→お),
# "br" is a breath.
# Priorities, in order: say what the English says in natural Japanese; no particle on a beat
# and no two-syllable token on a 16th note; words start on strong beats where possible;
# rhyme only where it costs no meaning.

V1 = ("br | ま い にち | け だ る く て | お く れ が ち | じ み な | た す く | お わ ら ず | しゅっ き ん し | お な じ | て じゅん | はん せ い",
      "（ブレス）毎日 けだるくて 遅れがち 地味なタスク 終わらず 出勤し 同じ手順 反省",
      "Every day's feeling like a drag, suffering from the lag, mundane tasks, coming endless tasks, clocking in again with the same approach, reflect",
      "Every day: sluggish, always lagging. Mundane tasks, never ending. I clock in, the same routine, and reflect.")
V1_NB = (V1[0].split("|", 1)[1], V1[1].replace("（ブレス）", ""), V1[2], V1[3])
V2 = ("い つ | お わ る | こ こ | の | お と | ずっ と | お い かけ | ぜ ん ぶ | しょ う きゅ う | ね ら い | み あ う | う ん め い | と | しょ う き | のお",
      "いつ終わる ここの音 ずっと追いかけ 全部 昇給狙い 見合う？ 運命と 正気 ノー",
      "Wait, when will this end? The humming of this place, an endless chase, all of this just for a chance of a raise. Is it really worth my fate, my sanity? No.",
      "When will it end? The sound of this place, always chasing. All of it, just angling for a raise. Is it worth it, my fate and my sanity? No.")
CASH = ("ぶっ ちゃ け | さ | か ね | いる", "ぶっちゃけさ 金要る", "Frankly, but I need some cash", "Frankly, y'know, I need cash.")
CASH5 = ("そ う | か ね | いる", "そう 金要る", "But I need some cash", "Yeah, I need cash.")
HOOK9 = ("ほ ら | つ い | お どっ ちゃ う | いち", "ほら つい踊っちゃう いち", "I can't help but dance to the tune, one", "See, I can't help dancing. One!")
HOOK7 = ("つ い | お どっ ちゃ う | いち", "つい踊っちゃう いち", "...help but dance to the tune, one", "Can't help dancing. One!")
SONG10 = ("で も | う た | つ い | お どっ ちゃ う", "でも 歌 つい踊っちゃう", "But with song, can't help but dance to the tune", "But a song, and I can't help dancing.")
THREE = ("さん | けん", "３件", "Three more", "Three more")
TWO = ("に | けん", "２件", "Two more", "Two more")
LAST = ("さい ご", "最後", "One last", "The last")
SO_DANCE7 = ("だ か ら | お ど る | だけ", "だから 踊るだけ", "So I dance, dance to the tune", "So I just dance.")
SO_DANCE8 = ("だ か ら | お ど る | だけ | いち", "だから 踊るだけ いち", "So I just dance to the tune, one", "So I just dance. One!")
LETS = ("さあ | いま | おどろ", "さあ 今 踊ろ", "Let's just dance", "Come on, now, let's dance.")
LIES = ("な ぜ | う そ | う の み", "なぜ 嘘 鵜呑み", "Why do we feed to such lies", "Why swallow lies whole?")
LIES_NOW = ("な ぜ | う そ | う の み | い ま | お ど る", "なぜ 嘘 鵜呑み 今 踊る",
            "Why do we feed to such lies, but now I dance here", "Why swallow lies whole? Now I dance.")
AGAIN_UNREAL = ("ん | く り か え し | ふしぎ", "（ん）繰り返し 不思議", "Again and again, unreal", "Over and over, strange, unreal.")
WORRIES_GONE = ("な や み | き え る | ま で", "悩み消えるまで", "Until my problems go away", "Until my worries go away.")
BURN12 = ("も え て | もっ と | こ こ ろ | ま う | もっ と", "燃えて もっと 心舞う もっと", "I'm burning brighter, my soul is lifted higher", "Burning more and more; my heart dances, higher and higher.")
CLEAR10 = ("もう | く り あ | な ん ど も | ゆ め", "もう クリア 何度も 夢", "So damn clear, again and again, surreal", "So clear now. Again and again, like a dream.")
FREE13 = ("じ ゆ う | な や み | ぜん ぶ | き え た | い ま", "自由 悩み全部 消えた 今",
          "I'm truly free since now all my worries washed away", "Free. All my worries vanished, now.")
TOGETHER8 = ("いっ しょ に | ね | お ど ろ う", "一緒にね 踊ろう", "Together we dance to the tune", "Together, okay? Let's dance.")
STORY = ("br | あ し | が | か た る | きみ | の | な や み | う ば う | ろ す | も | れ が しい",
         "（ブレス）足が語る 君の悩み奪う ロスも レガシー",
         "(breath) Steps tell a story, stray from the soul that takes your worries, from loss to legacy",
         "(breath) My steps tell the story; they take away your worries. Even loss becomes legacy.")
LA20 = (" ".join(["ら"] * 20), "ら ら ら…", "la la la...", "la la la...")
LA13 = (" ".join(["ら"] * 13), "ら ら ら…", "la la la...", "la la la...")

GROUPS = {
    "c0cc1d55": [V1, V2, CASH],                      # rap (verse 1)
    "3cf084c3": [V1_NB, V2, CASH5],                  # backing: verse 1
    "8ae78072": [HOOK7],                             # main singing
    "0150b320": [(                                   # rap_R (verse 2)
        "ろ く じ | き しょ う | い や だ | や ち ん | は ら う | あ | くそ | ちょっ と | ち こ く | み ち | も | び みょ う | きゅ う りょ う | へ ら さ れ | わあ | しょ る い | お | て | に | お ど る | と らん す | の | り ず む | に | のる | ねえ | の り | か ん じ る | ほ ら | つ い | お どっ ちゃ う | いち",
        "六時起床 いやだ 家賃払う あー くそ ちょっと遅刻 道も微妙 給料減らされ わあ 書類を手に 踊る トランスのリズムに乗る ねえ ノリ感じる？ ほら つい踊っちゃう いち",
        "Wake up at six AM, don't want to, but I got bills to pay. Too damn... Clocked in a bit late, traffic wasn't that great, but I get my pay reduced too. Wow. Paperwork in my hands, then I start to dance to the rhythm of this trance. Whoa yo, you feeling this groove? I can't help but dance to the tune, one",
        "Up at six. Don't want to. Rent to pay. Ugh, damn. A little late; the roads weren't great either. My pay got cut. Wow. Paperwork in hand, I dance, riding the rhythm of the trance. Hey, feeling the groove? See, I can't help dancing. One!",
        "od-oru / n-oru (dance / trance)")],
    "8ccfbf01": [("くそ", "くそ", "Damn", "Damn."),
                 ("へ ら さ れ | わあ", "減らされ わあ", "Pay reduced too, wow", "Got cut. Wow."),
                 ("こ の | り ず む | に | のる", "このリズムに乗る", "To the rhythm of this trance", "Riding this rhythm.")],
    "72bac218": [HOOK9],
    "f9a58923": [(                                   # rap_R_R (count verse)
        "に | ま た か | さん | よん | わ | ざ ん ぎょう | ご | ろく | お な じ | て | で も | う た | つ い | お どっ ちゃ う | さん",
        "２ またか ３ ４は 残業 ５ ６ 同じ手 でも 歌 つい踊っちゃう ３",
        "Two, nothing new. Three, four, go work some more. Five, six, the same old trick, but with song can't help but dance to the tune. Three",
        "Two: this again. Three, four: overtime. Five, six: the same old trick. But a song, and I can't help dancing. Three!")],
    "cd3756da": [SONG10],
    "069ed0d1": [THREE, TWO, LAST, SO_DANCE7],
    "23024df8": [(                                   # rap_R_R_R (countdown)
        "お どっ ちゃ う | さん | けん | の | く じょ う | に | けん | の | ほう こ く | さい ご | だ | なん | の | ため",
        "踊っちゃう ３件の苦情 ２件の報告 最後だ 何のため",
        "Dance to the tune. Three more complaints before, two more reports to store, one last... but what's it for?",
        "I dance. Three complaints, two reports, the last one: what's it for?"),
        SO_DANCE8],
    "32a1d401": [("br | しん ぱ い | な い", "（ブレス）心配ない", "(breath) No need to worry", "(breath) No need to worry."),
                 STORY,
                 ("じ ゆ う | い ま", "自由 今", "I feel untethered", "Free, now.",
                  "i-ma / pafo-ma (untethered / performer)"),
                 ("ぱ ふぉ ま", "パフォーマー", "Performer", "Performer.")],
    "62b9e1ec": [("ぱ ふぉ ま | ほ の お | き え な い | でも | つ か れ | も | な い",
                  "パフォーマー 炎消えない でも 疲れもない",
                  "Performer, I feel like I'm on fire, yet I do not feel tired",
                  "Performer. The flame won't go out, yet I'm not tired at all.",
                  "kie-nai / tsukaremo-nai (fire / tired)"),
                 LIES_NOW,
                 ("わ か ら な い | きょ う | も | こ こ | で | お な じ | るう てぃ ん | く り か え し | ふしぎ | あ し | で | ゆ めみ",
                  "わからない 今日もここで 同じルーティン 繰り返し 不思議 足で夢見",
                  "Currently nothing's clear, another day here, yet it's all the same routine, again and again, unreal, dreaming with my feet",
                  "Nothing's clear. Here again today, the same routine, over and over. Strange, unreal. Dreaming with my feet."),
                 ("ま よっ て る | な や み | き え る | ま で", "迷ってる 悩み消えるまで",
                  "I'm still lost, so until my problems go away", "I'm lost, until my worries go away."),
                 LETS],
    "08029339": [LIES, AGAIN_UNREAL],
    "774fb473": [WORRIES_GONE, LETS],
    "8604f826": [LA20, LA13],
    "c2dc885a": [LA20, LA13],
    "14728cc3": [(                                   # lalala_R
        "ど こ | え | い け ば | お ふぃ す | ま た | だ | ざ つ よう | とけい | ち く | た く | り ず む | う た | つ い | お どっ ちゃ う | さん | ま よ い | む し | に | あし | ゆ か | に | つく | いっ ぽ | ど あ | お | でる",
        "どこへ行けば オフィス まただ 雑用 時計 チクタク リズム 歌 つい踊っちゃう ３ 迷い無視 ２ 足 床につく １歩 ドアを出る",
        "And don't know where to go, another chore on the office floor. Clock ticks, the rhythm clicks, so with song can't help but dance to the tune. Three more doubts to ignore, two more feet to the floor, one last step through the door",
        "Where should I go? The office, chores again. The clock goes tick-tock, a rhythm. A song, and I can't help dancing. Three: ignore the doubts. Two: feet to the floor. One step: out the door."),
        ("いっ", "（一緒）", "Together", "(To-)gether")],
    "7f010356": [("へい", "ヘイ", "Hey!", "Hey!"),
                 ("ま い に ち | お な じ | や す め ず | ね む い | の に | さ え る | で | と い れ | で | ね て | ぶ ちょ う | も ん く | も | い え な い | くび",
                  "毎日 同じ 休めず 眠いのに 冴える で トイレで寝て 部長 文句も言えない クビ",
                  "Day and day it's all the same, can't catch a break, wanna sleep but I'm wide awake. Caught napping in the stall, boss called, yet I can't even complain, if you do, you're...",
                  "Every day the same, no break. Sleepy, yet wide awake. Then napping in the toilet stall: the boss! Can't even complain, or I'm fired."),
                 ("ま た | ま た | も | そ し て | また | て い ぎ | し て | きょ う き | の | い み | お",
                  "また またも そして また 定義して 狂気の意味を",
                  "Again, and again, and then again. Wait, please define the meaning of insanity",
                  "Again, and again, and then again. Define it: the meaning of insanity."),
                 ("げ ん じ つ | わ | ね | す べ て | が | きょ え い | な ん て | ひ げ き | わ た し | と | しょ う き",
                  "現実はね すべてが虚栄 なんて悲劇 私と正気",
                  "In reality, it's all an empty vanity. Oh, what a tragedy for me and my sanity",
                  "In reality, everything is empty vanity. What a tragedy, for me and my sanity.",
                  "kyoe-i / hige-ki / shou-ki (vanity / tragedy / sanity)")],
    "17e19177": [("br | へい", "（ブレス）ヘイ", "(breath) Hey!", "(breath) Hey!")],
    "8d9f4509": [("ま た | こ こ | ずっ と | さ む い | お り | じゅう じ | ま で", "またここ ずっと 寒い檻 十時まで",
                  "Here we are again, same old same cold place, controlled, work till ten",
                  "Here again: always this cold cage, until ten."),
                 ("ま た | な や む | あっ て る | は ん せい", "また悩む 合ってる？ 反省",
                  "Wondering again if I'm correct, reflect", "Worrying again: am I right? Reflect."),
                 V2, CASH],
    "bf71f061": [("い つ | お わ る", "いつ終わる", "Wait, when will this end", "When will it end?")],
    "9c645ae1": [("ほ ら | う た | つ い | お どっ ちゃ う | さん | ま", "ほら 歌 つい踊っちゃう ３（迷い）",
                  "So with song, can't help but dance to the tune, three more", "See, a song, and I can't help dancing. Three..."),
                 ("に | あし", "２ 足", "Two more", "Two: feet"),
                 ("いっ ぽ", "１歩", "One last", "One step"),
                 TOGETHER8],
    "de46ba17": [(TOGETHER8[0] + " | いえい", TOGETHER8[1] + " イェイ", "Together we dance to the tune, yeah", "Together, okay? Let's dance. Yeah!")],
    "65c2dd6c": [("いえい", "イェイ", "Yeah", "Yeah!"),                                 # 2nd chorus
                 ("しん ぱ い | な い", "心配ない", "I do not worry", "No worries."),
                 ("br | あ し | が | か た る | こ の | な や み | う ばっ た | ろ す | も | はあ も にい",
                  "（ブレス）足が語る この悩み奪った ロスも ハーモニー",
                  "(breath) Steps told a story, stray from my soul that took my worries, from loss to symphony",
                  "(breath) My steps tell the story; they took these worries away. Even loss becomes harmony."),
                 ("じ ゆ う | の | み | い つ も | も え て | もっ と | こ こ ろ | ま う | もっ と",
                  "自由の身 いつも 燃えて もっと 心舞う もっと",
                  "I'm still untethered forever, I'm burning brighter, my soul is lifted higher",
                  "Free, always. Burning more and more; my heart dances, higher and higher.",
                  "itsu-mo / mot-to / mot-to (forever / brighter / higher)"),
                 (LIES_NOW[0], LIES_NOW[1], "Why did I feed to such lies, and now I dance here", LIES_NOW[3]),
                 ("む ね | は れ て | やっ と | だ | こ こ | で | も う | く り あ | な ん ど も | ゆ め | こ こ | に | い る",
                  "胸 晴れて やっとだ ここで もう クリア 何度も 夢 ここにいる",
                  "My mind fully clear, finally here, and it's all so damn clear, again and again, surreal, I'm here with my feet",
                  "My heart clears. Finally: here. So clear now. Again and again, like a dream. I'm here."),
                 FREE13, LETS],
    "b4c6ca78": [BURN12],
    "14573d10": [LIES, CLEAR10],
    "3de4494d": [FREE13, LETS],
}
