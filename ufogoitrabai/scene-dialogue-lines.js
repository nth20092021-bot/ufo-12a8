import {locale,normalizeLanguage} from './i18n.js';

// Short, authored lines for visible scene events. IDs remain stable for voices.
const rows=`
arrival-01|Ủa, gì trên trời vậy?|What's that in the sky?|天上那是什么？|空に何かいるよ！|하늘에 저게 뭐지?|¿Qué hay en el cielo?|C'est quoi dans le ciel ?|Was ist da am Himmel?|O que é aquilo no céu?
arrival-02|Các bạn nhìn lên kìa!|Look up, everyone!|大家快抬头看！|みんな、上を見て！|얘들아, 위를 봐!|¡Mirad arriba!|Regardez là-haut !|Schaut mal nach oben!|Olhem lá em cima!
arrival-03|Đĩa bay tới thật rồi!|The flying saucer is here!|飞碟真的来了！|本当に円盤が来た！|진짜 비행접시가 왔어!|¡Llegó el platillo volador!|La soucoupe est arrivée !|Die fliegende Untertasse ist da!|O disco voador chegou!
arrival-04|Tàu này đậu ở đâu nhỉ?|Where will it park?|它要停在哪里呢？|どこに止まるのかな？|어디에 주차하려나?|¿Dónde va a aparcar?|Où va-t-elle se garer ?|Wo wird das wohl parken?|Onde ele vai estacionar?
arrival-05|Gió từ trên thổi xuống kìa!|Feel that wind from above!|上面吹来一阵风！|上から風が来るよ！|위에서 바람이 불어!|¡Viene viento de arriba!|Le vent vient d'en haut !|Da kommt Wind von oben!|Está ventando lá de cima!
arrival-06|Hôm nay có khách vũ trụ!|We have visitors from space!|今天有太空客人！|宇宙からお客さんだ！|오늘은 우주 손님이네!|¡Tenemos visitas del espacio!|On a des visiteurs de l'espace !|Heute kommt Besuch aus dem All!|Temos visitas do espaço!
cling-01|Bám chặt! Không buông!|Hold tight! Don't let go!|抓紧！别松手！|しっかりつかまって！|꽉 잡아! 놓지 마!|¡Agarra fuerte!|Accroche-toi bien !|Festhalten! Nicht loslassen!|Segura firme! Não solta!
cling-02|Chân mình bay lên rồi!|My feet are lifting up!|我的脚离地了！|足が浮いてる！|발이 떠오르고 있어!|¡Se me levantan los pies!|Mes pieds décollent !|Meine Füße heben ab!|Meus pés estão subindo!
cling-03|Ai giữ giùm cái cặp với!|Someone hold my schoolbag!|谁帮我拿一下书包！|かばんを持ってて！|누가 내 가방 좀 잡아 줘!|¡Sujetad mi mochila!|Quelqu'un tient mon sac ?|Hält jemand meine Schultasche?|Alguém segura minha mochila!
cling-04|Tay mình vẫn còn chắc lắm!|I've still got a good grip!|我还抓得很牢！|まだしっかり握れるよ！|아직 단단히 잡고 있어!|¡Todavía agarro bien!|Je tiens encore bien !|Ich halte mich noch gut fest!|Ainda estou segurando firme!
cling-05|Gió này mạnh ghê!|That wind is strong!|这风真大！|すごい風だね！|바람이 정말 세다!|¡Qué viento tan fuerte!|Quel vent puissant !|Der Wind ist aber stark!|Que vento forte!
cling-06|Khoan, để mình đứng xuống!|Wait, let me land first!|等等，让我先站稳！|待って、先に下ろして！|잠깐, 먼저 내려 줘!|¡Espera, déjame bajar!|Attends, laisse-moi redescendre !|Warte, lass mich erst runter!|Espera, deixa eu descer!
selected-01|Ủa, tới lượt mình rồi hả?|Oh, is it my turn?|咦，轮到我了吗？|えっ、私の番？|어, 내 차례야?|¿Ya es mi turno?|C'est déjà mon tour ?|Oh, bin ich schon dran?|Já é a minha vez?
selected-02|Để mình nhớ lại bài đã!|Let me remember the lesson!|让我回想一下课文！|授業の内容を思い出すね！|배운 내용을 떠올려 볼게!|¡Déjame recordar la lección!|Je me rappelle la leçon !|Ich denke kurz an die Lektion!|Deixa eu lembrar da matéria!
selected-03|Các bạn cổ vũ mình nhé!|Cheer me on, everyone!|大家给我加油吧！|みんな応援してね！|얘들아, 응원해 줘!|¡Animadme, compañeros!|Encouragez-moi !|Drückt mir die Daumen!|Torçam por mim, pessoal!
selected-04|Bình tĩnh, mình làm được!|Stay calm, I can do this!|别紧张，我能行！|落ち着いて、できるよ！|침착하게, 난 할 수 있어!|¡Calma, puedo hacerlo!|Du calme, je peux le faire !|Ganz ruhig, ich schaffe das!|Calma, eu consigo!
selected-05|Cho mình hít thở một chút!|Let me take a breath!|让我先深呼吸一下！|ちょっと深呼吸させて！|숨 한번 고르고 갈게!|¡Déjame respirar un momento!|Laissez-moi souffler un peu !|Lasst mich kurz durchatmen!|Deixa eu respirar um pouco!
selected-06|Mình đã ôn phần này rồi!|I've studied this part!|这部分我复习过了！|ここは復習したよ！|이 부분은 복습했어!|¡Esta parte la he estudiado!|J'ai révisé cette partie !|Diesen Teil habe ich gelernt!|Eu estudei essa parte!
selected-07|Lên bảng bằng đĩa bay luôn!|A flying saucer to the board!|坐飞碟去答题啦！|円盤で黒板まで行くの？|비행접시 타고 칠판 앞으로!|¡Al encerado en platillo!|Au tableau en soucoupe !|Mit der Untertasse zur Tafel!|Vou de disco voador ao quadro!
selected-08|Được rồi, mình sẵn sàng!|All right, I'm ready!|好啦，我准备好了！|よし、準備できた！|좋아, 준비됐어!|¡Vale, allá voy!|D'accord, on y va !|Gut, ich bin bereit!|Tudo certo, vamos lá!
selected-09|Mong là câu dễ một chút!|I hope it's an easy question!|希望题目简单一点！|簡単な問題だといいな！|쉬운 문제면 좋겠다!|¡Ojalá sea una pregunta fácil!|J'espère une question facile !|Hoffentlich ist die Frage leicht!|Tomara que a pergunta seja fácil!
selected-10|Nhớ bài rồi, đi thôi nào!|I remember now, let's go!|想起来了，出发吧！|思い出した、行こう！|생각났어, 가 보자!|¡Ya me acuerdo, vamos!|Ça me revient, allons-y !|Jetzt weiß ich's, los geht's!|Agora lembrei, vamos lá!
relief-01|Phù, chân chạm đất rồi!|Phew, back on the ground!|呼，终于落地了！|ふう、地面に戻れた！|휴, 다시 땅에 섰다!|¡Uf, otra vez en el suelo!|Ouf, les pieds sur terre !|Puh, wieder Boden unter den Füßen!|Ufa, de volta ao chão!
relief-02|Lượt sau mình sẽ sẵn sàng!|I'll be ready next time!|下次我会准备好！|次は準備しておこう！|다음에는 준비하고 있을게!|¡La próxima vez, a por ello!|La prochaine fois, ça ira !|Nächstes Mal bin ich bereit!|Na próxima eu me preparo!
relief-03|Hôm nay hồi hộp thật đấy!|That was exciting!|今天真让人紧张！|今日はどきどきしたね！|오늘 정말 두근두근했어!|¡Qué emoción!|Que d'émotions !|Das war aufregend!|Que emoção hoje!
relief-04|Mình đi ôn thêm bài đây!|Time for a little more revision!|我去再复习一下！|もう少し復習しよう！|조금 더 복습해야겠다!|¡Voy a repasar un poco más!|Je vais réviser encore un peu !|Ich wiederhole lieber noch etwas!|Vou revisar mais um pouco!
relief-05|Các bạn trên tàu cố lên!|Good luck up there!|船上的同学加油！|乗っているみんな、頑張って！|우주선에 탄 친구들, 힘내!|¡Ánimo a los de la nave!|Courage à ceux dans le vaisseau !|Viel Glück da oben!|Boa sorte aí na nave!
relief-06|Chuyến bay này vui ghê!|What a fun flight!|这趟飞行真有趣！|楽しいフライトだったね！|이번 비행 재미있다!|¡Qué vuelo tan divertido!|Quel vol amusant !|Was für ein lustiger Flug!|Que voo divertido!
xoi-01|Xôi nóng mới đồ đây các cháu!|Fresh hot sticky rice, everyone!|热腾腾的糯米饭来啦！|炊きたてのおこわだよ！|따끈한 찹쌀밥 있어요!|¡Arroz glutinoso recién hecho!|Du riz gluant tout chaud !|Frischer warmer Klebreis!|Arroz glutinoso quentinho!
xoi-02|Ăn sáng rồi hãy vào lớp nhé!|Have breakfast before class!|吃好早饭再上课吧！|朝ごはんを食べてから授業へ！|아침 먹고 수업 가요!|¡Desayunad antes de clase!|Un bon petit-déjeuner avant le cours !|Frühstückt vor dem Unterricht!|Tomem café antes da aula!
xoi-03|Xôi gói lá chuối thơm lắm!|Sticky rice in fragrant banana leaves!|香蕉叶包糯米饭真香！|バナナの葉のおこわ、いい香り！|바나나 잎 찹쌀밥이 향긋해요!|¡Arroz envuelto en hoja de plátano!|Du riz en feuille de bananier !|Klebreis im duftenden Bananenblatt!|Arroz em folha de bananeira!
xoi-04|Chúc các cháu học thật vui!|Have a lovely day at school!|祝大家上课愉快！|学校で楽しく過ごしてね！|오늘도 즐겁게 공부해요!|¡Que disfrutéis en clase!|Bonne journée à l'école !|Viel Spaß in der Schule!|Bom dia de aula para vocês!
banhmi-01|Bánh mì nóng giòn đây!|Fresh crispy bánh mì!|热乎酥脆的越南法棍！|焼きたてのバインミーだよ！|따끈하고 바삭한 반미예요!|¡Bánh mì caliente y crujiente!|Des bánh mì bien croustillants !|Frische knusprige Bánh mì!|Bánh mì quentinho e crocante!
banhmi-02|Một ổ đầy đặn cho buổi sáng!|A hearty sandwich for the morning!|早上来个料足的三明治！|朝に具だくさんのサンドイッチ！|아침엔 든든한 샌드위치죠!|¡Un buen bocadillo para empezar!|Un bon sandwich pour le matin !|Ein gutes Sandwich für den Morgen!|Um sanduíche caprichado de manhã!
banhmi-03|Bánh mới ra lò, mời các cháu!|Fresh from the oven, come along!|刚出炉的，大家来看看！|焼きたてだよ、どうぞ！|갓 구웠어요, 어서 오세요!|¡Recién salido del horno!|Tout juste sorti du four !|Frisch aus dem Ofen, kommt her!|Acabou de sair do forno!
banhmi-04|Cứ thong thả, còn nhiều bánh lắm!|Take your time, there's plenty!|慢慢来，面包还有很多！|ゆっくりどうぞ、たくさんあるよ！|천천히 와요, 빵 많아요!|¡Sin prisa, hay para todos!|Prenez votre temps, il y en a assez !|Nur keine Eile, es ist genug da!|Sem pressa, tem para todo mundo!
pupil-01|Cháu chào cô chú ạ!|Good morning!|叔叔阿姨好！|おはようございます！|안녕하세요!|¡Buenos días!|Bonjour !|Guten Morgen!|Bom dia!
pupil-02|Thơm quá, cháu ghé xem chút nhé!|It smells lovely! May I look?|好香啊，我来看看！|いい匂い！見てもいいですか？|좋은 냄새예요! 구경해도 돼요?|¡Qué bien huele! ¿Puedo mirar?|Ça sent bon, je peux regarder ?|Das duftet! Darf ich mal schauen?|Que cheirinho bom! Posso olhar?
pupil-03|Cháu cảm ơn, chúc buôn may bán đắt!|Thank you, have a good day!|谢谢，祝您生意兴隆！|ありがとう、よい一日を！|감사해요, 장사 잘되세요!|¡Gracias, que vaya muy bien!|Merci, bonne journée à vous !|Danke, einen schönen Tag!|Valeu, bom trabalho!
pupil-04|Lát tan học cháu lại ghé nhé!|I'll stop by after school!|放学后我再来！|放課後にまた来ます！|수업 끝나고 또 올게요!|¡Volveré después de clase!|Je repasserai après l'école !|Nach der Schule komme ich vorbei!|Volto depois da aula!
hawker-01|Ai bánh mì nóng giòn đây!|Hot crispy bánh mì, anyone?|谁要热脆的越南法棍？|温かいバインミーはいかが！|따끈한 반미 드세요!|¡Bánh mì caliente, quién quiere!|Qui veut un bánh mì chaud ?|Warme Bánh mì, wer möchte?|Olha o bánh mì quentinho!
hawker-02|Xôi nóng đây, xôi nóng đây!|Hot sticky rice, fresh and warm!|热糯米饭来啦！|熱々のおこわだよ！|따끈따끈한 찹쌀밥이에요!|¡Arroz glutinoso calentito!|Du riz gluant tout chaud !|Heißer Klebreis, ganz frisch!|Olha o arroz glutinoso quentinho!
hawker-03|Bắp luộc nóng hổi đây!|Steaming hot corn, anyone?|热腾腾的玉米来啦！|熱々のとうもろこしだよ！|따끈한 찐 옥수수예요!|¡Maíz hervido bien caliente!|Du maïs tout chaud !|Heißer Mais, frisch gekocht!|Milho cozido quentinho!
hawker-04|Gánh hàng nhỏ ghé phố rồi đây!|The little food cart is here!|小吃车到街上啦！|小さな屋台が来たよ！|작은 먹거리 수레가 왔어요!|¡Ya llegó el carrito de comida!|Le petit chariot est arrivé !|Der kleine Essenswagen ist da!|O carrinho de comida chegou!
`;

export const SCENE_DIALOGUE_LINES=Object.freeze(rows.trim().split('\n').map(row=>{
  const [id,vi,en,zh,ja,ko,es,fr,de,pt]=row.split('|');
  return Object.freeze({id,kind:id.replace(/-\d+$/,''),source:vi,translations:Object.freeze({vi,en,zh,ja,ko,es,fr,de,pt})});
}));
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
export function createSceneDialoguePicker(language=locale){
  const lang=normalizeLanguage(language)||'vi',cache=new Map(),used=new Set();
  return {pick(kind,key,{turn}={}){
    if(cache.has(key))return cache.get(key);
    const all=SCENE_DIALOGUE_LINES.filter(line=>line.kind===kind&&(!['xoi','banhmi'].includes(kind)||!turn||(turn==='greet'||turn==='call'?line.id.endsWith('01')||line.id.endsWith('03'):turn==='farewell'?line.id.endsWith('02')||line.id.endsWith('04'):true)));if(!all.length)return null;
    const fresh=all.filter(line=>!used.has(line.id));
    if(!fresh.length)for(const line of all)used.delete(line.id);
    const pool=fresh.length?fresh:all,line=pool[hash(key)%pool.length],choice={phraseId:line.id,text:line.translations[lang]};
    used.add(line.id);cache.set(key,choice);if(cache.size>256)cache.delete(cache.keys().next().value);return choice;
  }};
}
