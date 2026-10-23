# Let's Just Sayaw: Mandarin version for Yi Xi Lite

`lets_just_sayaw_mandarin_yixi_lite.svp` is the original project with every sung lyric
translated into Mandarin, so Yi Xi Lite can sing it in Synthesizer V Studio Basic
(Basic has no cross-lingual synthesis, so a Mandarin voice can't sing English there).

## What changed (and what didn't)
- **Rhythm and melody are exactly the original ones.** No note was moved, lengthened, split,
  merged or re-pitched; each note gets exactly one Mandarin syllable. Pitch/loudness curves,
  clip layout, mixer settings and the instrumental track are untouched.
- Both vocal tracks use **Yi Xi Lite** (Mandarin) and the English language overrides are
  removed.
- The **210 rap notes are now sung notes**, since Lite voices and Basic can't render rap. They
  keep the pitches you gave them.
- English phoneme overrides (`g eh n`, `t eh`, ...) are cleared; breath notes are `br`.
- The harmony track ("Unnamed Track 1") sings the same Mandarin words as the lead wherever
  it doubles it.
- 42 notes that sit outside the visible part of their clips (you never hear them) still
  have their old English lyrics.

## Opening it
Open the `.svp` in Synthesizer V Studio Basic. If a track shows the voice as missing,
select the track and pick **Yi Xi Lite** in the voice panel; the notes and lyrics stay.
In your file the lead track ("main singing") has rendering switched off (`renderEnabled`),
and it is left that way; if the lead is silent, switch its rendering back on.

## Translation notes
- The recurring hook "dance to the tune" is 随歌起舞 ("dance along with the song") every time;
  "Let's just dance" is 跳舞吧.
- The countdown keeps its numbers and its rhymes: 三条投诉先到 / 两份报告要交 / 一件又有何好.
- Where a word-for-word version wouldn't fit the notes, the meaning was kept and the wording
  changed: "pay reduced to... WOW" → 扣到只剩… 哇 ("docked down to only... wow"), "If you do,
  you're f—" → 敢说就被— (cut off the same way), "legacy" → 永恒 ("lasting"), "Dreaming with
  my feet" → 做梦在脚尖 ("dreaming on my tiptoes").
- Characters with more than one reading that SynthV might mispronounce (了, 还, 着, 传, 觉 ...)
  were left out of the lyrics.

To change a line, edit `lyrics_zh.txt` and rebuild from your original project:
`python3 build_mandarin_svp.py YOUR_ORIGINAL.svp lets_just_sayaw_mandarin_yixi_lite.svp`.
The script refuses to build if a line doesn't have exactly one syllable per note.

## Lyrics

### Verse 1

| 中文 | Pinyin | Original |
|---|---|---|
| (吸气) | (breath) | (breath) |
| 每一天 无聊到发慌 被延迟捆绑 枯燥的任务 一波波任务 | měi yī tiān · wú liáo dào fā huāng · bèi yán chí kǔn bǎng · kū zào de rèn wù · yī bō bō rèn wù | Everyday's feeling like a drag, suffering from the lag, monotonous tasks, coming endless tasks |
| 又一次打卡 用同样方法 反思 | yòu yī cì dǎ kǎ · yòng tóng yàng fāng fǎ · fǎn sī | Clocking in again with the same approach, reflect |
| 等等 何时完 | děng děng · hé shí wán | Wait, when will this end? |
| 这里的嗡嗡声 追逐不停 | zhè lǐ de wēng wēng shēng · zhuī zhú bù tíng | The humming of this place, an endless chase |
| 这一切 就图加薪的可能 | zhè yī qiè · jiù tú jiā xīn de kě néng | All of this just for a chance of a raise |
| 真的值得吗 赌命 赌上理智 不 | zhēn de zhí de ma · dǔ mìng · dǔ shàng lǐ zhì · bù | Is it really worth my fate, my sanity? No. |
| 坦白 但我需要钱 | tǎn bái · dàn wǒ xū yào qián | Frankly, but I need some cash |
| 早上六点起床 不想去 但必须 要付账单 靠 | zǎo shàng liù diǎn qǐ chuáng · bù xiǎng qù · dàn bì xū · yào fù zhàng dān · kào | Wake up at six AM, don't want to but I gotta, bills to pay too. DAMN |
| 打卡晚一点 路上堵成一片 可我工资 扣到只剩 哇 | dǎ kǎ wǎn yì diǎn · lù shàng dǔ chéng yī piàn · kě wǒ gōng zī · kòu dào zhǐ shèng · wa | Clocked in a bit late, traffic wasn't that great, but I get my pay reduced to... WOW |
| 一叠文件在手 然后跳起舞 跟这节奏的迷幻 哦 | yī dié wén jiàn zài shǒu · rán hòu tiào qǐ wǔ · gēn zhè jié zòu de mí huàn · ó | Paperwork in my hands, then I start to dance to the rhythm of this trance. Whoa |
| 哟 你感到律动 我忍不住随歌起舞 | yō · nǐ gǎn dào lǜ dòng · wǒ rěn bú zhù suí gē qǐ wǔ | Yo, you feeling this groove? I can't help but dance to the tune. |

### Pre-chorus 1

| 中文 | Pinyin | Original |
|---|---|---|
| 一 二 无新意 三 四 再加班去 | yī · èr · wú xīn yì · sān · sì · zài jiā bān qù | One, two, nothing new, three, four, go work some more, |
| 五 六 同样套路 但有歌 忍不住随歌起舞 | wǔ · liù · tóng yàng tào lù · dàn yǒu gē · rěn bú zhù suí gē qǐ wǔ | five, six, the same old trick, but with song, can't help but dance to the tune. |
| 三条投诉先到 两份报告要交 一件又有何好 | sān tiáo tóu sù xiān dào · liǎng fèn bào gào yào jiāo · yī jiàn yòu yǒu hé hǎo | Three more complaints before, two more reports to store, one last, but what's it for? |
| 那我就随歌起舞 | nà wǒ jiù suí gē qǐ wǔ | So I just dance to the tune. |

### Chorus 1

| 中文 | Pinyin | Original |
|---|---|---|
| (吸气) 不用再忧虑 | (breath) · bù yòng zài yōu lǜ | No need to worry |
| (吸气) 舞步讲故事 | (breath) · wǔ bù jiǎng gù shì | Steps tell a story |
| 远离带走烦忧的灵魂 | yuǎn lí dài zǒu fán yōu de líng hún | Stray from the soul that takes your worries |
| 从失去到永恒 | cóng shī qù dào yǒng héng | From loss to legacy |
| 我无拘无束 | wǒ wú jū wú shù | I feel untethered |
| 表演者 我就像是在燃烧 | biǎo yǎn zhě · wǒ jiù xiàng shì zài rán shāo | Performer, I feel like I'm on fire |
| 但我一点不疲劳 | dàn wǒ yì diǎn bù pí láo | yet I do not feel tired |
| 为何我们信谎言 | wèi hé wǒ men xìn huǎng yán | Why do we feed into such lies? |
| 而今舞翩翩 | ér jīn wǔ piān piān | But now I dance here |
| 前途看不见 又是一天 | qián tú kàn bú jiàn · yòu shì yī tiān | Career? Nothing's clear. Another day here, |
| 可一切一成不变啊 一遍一遍虚幻 | kě yī qiè yī chéng bù biàn a · yī biàn yī biàn xū huàn | yet it's all the same routine, ah, again and again, unreal |
| 做梦在脚尖 | zuò mèng zài jiǎo jiān | Dreaming with my feet |
| 我仍迷茫 直到我烦恼全消散 | wǒ réng mí máng · zhí dào wǒ fán nǎo quán xiāo sàn | I'm still lost, so until my problems go away |
| 跳舞吧 | tiào wǔ ba | Let's just dance |

### La la la

| 中文 | Pinyin | Original |
|---|---|---|
| 啦啦啦… | lā lā lā… | la la la |

### Verse 2

| 中文 | Pinyin | Original |
|---|---|---|
| 嘿 日复一日全一样 | hēi · rì fù yí rì quán yī yàng | HEY! Day in, day out, it's all the same |
| 休息无望 想睡却睁眼到天亮 | xiū xī wú wàng · xiǎng shuì què zhēng yǎn dào tiān liàng | can't catch a break, wanna sleep but I'm wide awake |
| 厕所打盹被老板抓 我连抱怨也不能 | cè suǒ dǎ dǔn bèi lǎo bǎn zhuā · wǒ lián bào yuàn yě bù néng | Caught napping in the stall, boss called, yet I can't even complain |
| 敢说就被 | gǎn shuō jiù bèi | If you do, you're f— |
| 一遍又一遍 再来一遍 | yī biàn yòu yī biàn · zài lái yī biàn | Again and again and then again |
| 等等 请你来定义 疯狂的含义 | děng děng · qǐng nǐ lái dìng yì · fēng kuáng de hán yì | Wait, please define the meaning of insanity |
| 在这现实里 全是空洞虚荣而已 | zài zhè xiàn shí lǐ · quán shì kōng dòng xū róng ér yǐ | In reality, it's all an empty vanity |
| 哦 好一场悲剧 对我 和我的理智 | ó · hǎo yī cháng bēi jù · duì wǒ · hé wǒ de lǐ zhì | Oh, what a tragedy for me and my sanity |
| 又回到这里 又旧又冷受控制 忙到十 | yòu huí dào zhè lǐ · yòu jiù yòu lěng shòu kòng zhì · máng dào shí | Here we are again, same old, same cold place, controlled, work till ten |
| 疑惑又一次 我是否对 反思 | yí huò yòu yī cì · wǒ shì fǒu duì · fǎn sī | wondering again if I'm correct, reflect |
| 等等 何时完 | děng děng · hé shí wán | Wait, when will this end? |

### Pre-chorus 2

| 中文 | Pinyin | Original |
|---|---|---|
| 不知往哪走 又一件杂事在办公楼 | bù zhī wǎng nǎ zǒu · yòu yī jiàn zá shì zài bàn gōng lóu | Don't know where to go, another chore on the office floor |
| 钟滴答合节奏 旋律起 忍不住随歌起舞 | zhōng dī dā hé jié zòu · xuán lǜ qǐ · rěn bú zhù suí gē qǐ wǔ | Clock ticks, the rhythm clicks, so with song, can't help but dance to the tune. |
| 三个疑虑先丢 两只脚往前走 一步迈出门口 | sān gè yí lǜ xiān diū · liǎng zhǐ jiǎo wǎng qián zǒu · yī bù mài chū mén kǒu | Three more doubts to ignore, two more feet to the floor, one last step through the door. |
| 我们一起随歌起舞 | wǒ men yì qǐ suí gē qǐ wǔ | Together we dance to the tune. |

### Chorus 2

| 中文 | Pinyin | Original |
|---|---|---|
| 耶 我不再忧虑 | yé · wǒ bù zài yōu lǜ | Yeah, I do not worry |
| (吸气) 舞步诉往事 | (breath) · wǔ bù sù wǎng shì | Steps told a story |
| 远离带走我烦忧的魂 | yuǎn lí dài zǒu wǒ fán yōu de hún | Stray from my soul that took my worries |
| 从失去到交响 | cóng shī qù dào jiāo xiǎng | From loss to symphony |
| 我仍无拘束 | wǒ réng wú jū shù | I'm still untethered |
| 到永远 我燃得更旺 | dào yǒng yuǎn · wǒ rán dé gèng wàng | Forever, I'm burning brighter |
| 我的灵魂更飞扬 | wǒ de líng hún gèng fēi yáng | My soul is lifted higher |
| 为何我竟信谎言 | wèi hé wǒ jìng xìn huǎng yán | Why did I feed into such lies? |
| 而今舞翩翩 | ér jīn wǔ piān piān | And now I dance here |
| 眼前全看见 终于这天 | yǎn qián quán kàn jiàn · zhōng yú zhè tiān | My mind fully clear, finally here |
| 而一切太明显啊 一遍一遍梦幻 | ér yī qiè tài míng xiǎn a · yī biàn yī biàn mèng huàn | and it's all so damn clear, ah, again and again, surreal |
| 我站在脚尖 | wǒ zhàn zài jiǎo jiān | I'm here with my feet |
| 我真自由 从今 所有烦恼被冲散 | wǒ zhēn zì yóu · cóng jīn · suǒ yǒu fán nǎo bèi chōng sàn | I'm truly free since now all my worries washed away |
| 跳舞吧 | tiào wǔ ba | Let's just dance |
