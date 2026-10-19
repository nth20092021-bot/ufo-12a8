const copy={
  vi:['UFO gọi trả bài','Tạo hoặc chọn lớp, thêm danh sách học sinh và chọn số bạn được gọi. Bạn có thể mời học sinh tham gia bằng mã lớp, điểm danh và xem lại kết quả của từng lượt.','Cùng tham gia lớp học','Nhập mã lớp do giáo viên cung cấp, tạo nhân vật của bạn và theo dõi sân chơi cùng cả lớp. Khi đến lượt điểm danh, bạn có thể xác nhận Có mặt ngay trên thiết bị này.','Quảng cáo','Quyền riêng tư quảng cáo'],
  en:['UFO classroom picker','Create or select a class, add the student list and choose how many students to call. Invite students with a class code, take attendance and review each round’s results.','Join your classroom','Enter your teacher’s class code, create your character and follow the playground with your class. When it is your turn for attendance, confirm Present on this device.','Advertisement','Advertising privacy'],
  zh:['UFO课堂点名','创建或选择班级，添加学生名单，并选择每轮抽取人数。使用班级代码邀请学生加入、进行考勤并查看每轮结果。','加入课堂','输入老师提供的班级代码，创建自己的角色，与全班一起观看游戏。轮到你考勤时，可在此设备上确认到场。','广告','广告隐私设置'],
  ja:['UFOで生徒を選ぶ','クラスを作成または選択し、名簿と呼ぶ人数を設定します。クラスコードで生徒を招待し、出席確認や各回の結果確認ができます。','クラスに参加','先生のクラスコードを入力してキャラクターを作り、クラスと一緒にゲームを見ましょう。出席確認の順番が来たら、この端末で出席を選べます。','広告','広告のプライバシー'],
  ko:['UFO 교실 추첨','반을 만들거나 선택하고 학생 명단과 호명할 인원을 정하세요. 반 코드로 학생을 초대하고 출석과 각 회차 결과를 확인할 수 있습니다.','우리 반에 참여하기','선생님이 알려 준 반 코드를 입력하고 캐릭터를 만들어 친구들과 게임을 함께 보세요. 출석 확인 차례가 되면 이 기기에서 출석을 선택할 수 있습니다.','광고','광고 개인정보 설정'],
  es:['Selector de alumnos UFO','Crea o selecciona una clase, añade la lista y elige cuántos alumnos llamar. Invítalos con un código, pasa lista y consulta los resultados de cada ronda.','Únete a tu clase','Introduce el código de tu profesor, crea tu personaje y sigue el juego con la clase. Cuando te toque pasar lista, confirma Presente en este dispositivo.','Publicidad','Privacidad publicitaria'],
  fr:['Tirage des élèves UFO','Créez ou choisissez une classe, ajoutez les élèves et sélectionnez le nombre à appeler. Invitez-les avec un code, faites l’appel et consultez les résultats de chaque tour.','Rejoindre la classe','Saisissez le code fourni par votre professeur, créez votre personnage et suivez le jeu avec la classe. À votre tour lors de l’appel, confirmez votre présence sur cet appareil.','Publicité','Confidentialité publicitaire'],
  de:['UFO-Schülerauswahl','Erstelle oder wähle eine Klasse, füge die Schülerliste hinzu und lege die Anzahl der Aufrufe fest. Lade Schüler mit einem Klassencode ein, prüfe die Anwesenheit und sieh die Rundenergebnisse an.','Am Unterricht teilnehmen','Gib den Klassencode deiner Lehrkraft ein, erstelle deine Figur und verfolge das Spiel mit der Klasse. Bestätige deine Anwesenheit auf diesem Gerät, sobald du an der Reihe bist.','Werbung','Datenschutz für Werbung'],
  pt:['Sorteio de alunos UFO','Crie ou selecione uma turma, adicione a lista e escolha quantos alunos chamar. Convide-os com um código, faça a chamada e veja os resultados de cada rodada.','Entre na sua turma','Digite o código fornecido pelo professor, crie seu personagem e acompanhe o jogo com a turma. Quando chegar sua vez na chamada, confirme Presente neste dispositivo.','Publicidade','Privacidade de anúncios'],
};

export function localizePageAdvertising(doc,language='vi'){
  const section=doc.querySelector('[data-ufo-page-ad]');if(!section)return;
  const values=copy[language]||copy.en,offset=section.getAttribute('data-ufo-page-ad')==='participant'?2:0;
  for(const [selector,text] of [['#ufoPageInfoTitle',values[offset]],['.ufo-page-information p',values[offset+1]],['#ufoPageAdLabel',values[4]],['[data-ad-privacy]',values[5]]]){
    const element=doc.querySelector(selector);if(element)element.textContent=text;
  }
}
