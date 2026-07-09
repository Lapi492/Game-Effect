🎮 Game Effect - 나만의 게임 로그 아카이브 & 대시보드
구글 스프레드시트와 실시간으로 연동되어 내가 플레이한 게임들의 역사와 인사이트를 한눈에 보여주는 반응형 웹 대시보드 시스템입니다. 내 컴퓨터를 꺼도 24시간 언제 어디서나 접속하여 게임 로그를 기록하고 트래킹할 수 있습니다.

🕹️ 간단 사용법
사이트 상단 연동 바에 본인의 [구글 시트 주소]와 [양방향 저장용 웹 앱 주소]를 최초 1회 입력한 후 저장합니다.

달력 보기 / 전체 목록 / 연도별 리포트 탭을 자유롭게 넘나들며 아카이브를 확인합니다.

새로운 게임을 클리어했거나 플레이 타임이 늘어났다면 [새 게임 기록 추가] 폼을 통해 기록합니다.

플레이타임 시간 계산기를 이용하면 스팀 등에서 증가한 누적 시간을 계산하여 자동으로 입력 칸을 채워줍니다.

상단 통합 검색창을 이용하면 게임 제목 실시간 필터링은 물론, 특정 날짜 및 기간 범위(2026-07-01 ~ 2026-07-05)를 역추적하여 플레이 기록을 찾아낼 수 있습니다.

📂 구글 스프레드시트 연동 방법 (Read)
대시보드가 데이터를 읽어올 수 있도록 내 구글 시트의 규격과 권한을 설정하는 방법입니다.

1. 시트 헤더(첫 번째 행) 설정하기
스프레드시트의 첫 번째 행(A1, B1, C1...)에 아래의 제목들을 정확하게 적어주세요. (열의 순서는 상관없지만 글자는 똑같아야 합니다.)

이름 | 시작일 | 종료일 | 플랫폼 | 시간 | 엔딩여부 | 메모 | 한줄평

2. 시트 공유 권한 열기 (보안 게이트웨이 승인)
구글 스프레드시트 우측 상단의 파란색 [공유] 버튼을 클릭합니다.

일반 액세스 권한을 제한됨에서 [링크가 있는 모든 사용자]로 변경합니다.

권한 역할이 [뷰어]로 되어 있는지 확인하고 완료를 누릅니다.

브라우저 주소창의 시트 URL 주소 전체를 복사하여 웹사이트 1번 칸에 넣고 ⚡ 시트 불러오기를 클릭합니다.

💾 양방향 실시간 저장 주소 만드는 방법 (Write)
웹사이트에서 입력한 데이터가 내 구글 시트에 진짜로 실시간 자동 저장되도록 데이터 통로(API)를 구축하는 방법입니다.

1. Apps Script에 코드 심기
연동할 구글 스프레드시트 상단 메뉴에서 [확장 프로그램] ➡️ [Apps Script]를 클릭합니다.

기존에 있던 빈 함수 코드를 싹 지우고, 아래의 전송 처리 엔진 코드를 복사해서 붙여넣습니다.

JavaScript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var data = JSON.parse(e.postData.contents);
    var newRow = new Array(headers.length);
    
    for (var i = 0; i < headers.length; i++) {
      var header = headers[i].toString().trim();
      if (header === "이름") newRow[i] = data.title;
      else if (header === "시작일") newRow[i] = data.startDate;
      else if (header === "종료일") newRow[i] = data.endDate;
      else if (header === "플랫폼") newRow[i] = data.platform;
      else if (header === "시간") newRow[i] = Number(data.time);
      else if (header === "엔딩여부" || header === "트로피") newRow[i] = data.isEnding;
      else if (header === "메모") newRow[i] = data.memo;
      else if (header === "한줄평") newRow[i] = data.review;
    }
    
    sheet.appendRow(newRow);
    return ContentService.createTextOutput(JSON.stringify({"result":"success"}))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({"result":"error", "message": error.toString()}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
편집기 상단의 [저장(디스크 아이콘)] 버튼을 누릅니다.

2. 웹 앱(Web App) 배포 및 외부 문 열기
화면 우측 상단의 파란색 [배포] 버튼을 누르고 [새 배포]를 선택합니다.

왼쪽 위 톱니바퀴를 눌러 유형을 [웹 앱(Web App)]으로 지정합니다.

아래 2가지 설정을 반드시 체크합니다:

웹 앱을 다음 사용자 권한으로 실행: 내 구글 계정

액세스 권한이 있는 사용자: ⚠️ 모든 사용자(Anyone)로 반드시 변경

하단의 [배포] 버튼을 클릭합니다.

구글 보안 인증 팝업이 뜨면 [액세스 승인] ➡️ 계정 선택 ➡️ [Advanced (고급)] 클릭 ➡️ 하단의 [Go to 제목없는 프로젝트 (unsafe)] 클릭 ➡️ [Allow (허용)]을 차근차근 눌러줍니다.

배포가 완료되면 화면에 생성되는 웹 앱 URL 주소를 복사하여 웹사이트 2번 칸에 넣고 🔒 주소 저장하기를 누르면 세팅 끝입니다!

🔒 보안 안내: 이 시스템은 순수 프론트엔드 통신 기반으로 빌드되었습니다. 사용자가 입력한 구글 시트 주소와 웹 앱 고유 URL은 외부 서버에 수집되지 않으며, 사용자 본인의 로컬 브라우저 보안 저장소(LocalStorage)에만 격리되어 안전하게 보관됩니다.
