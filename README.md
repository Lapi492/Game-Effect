# 🎮 Game Effect

내가 한 게임과 플레이 시간을 기록하는 간단한 게임 기록장입니다.

## 할 수 있는 일

- 게임 기록하기
- 기록 찾기
- 달력, 모든 기록, 연도별 요약 보기
- 최근 7일에 시작한 게임 중 플레이 시간이 많은 게임 10개 보기
- Steam 플레이 시간 가져오기
- 구글 시트에서 기록 가져오기
- 기록을 엑셀 파일(CSV)로 저장하기
- 잘못되거나 똑같이 겹친 기록 정리하기

## 처음 사용하기

### 1. 바로 기록하기

웹페이지의 **게임 기록하기**에서 게임 이름, 플레이 시간, 시작한 날을 입력하고 **기록하기**를 누릅니다.

시작한 날을 비워 두면 오늘 날짜로 기록합니다.

### 2. 구글 시트에서 기록 가져오기

1. **구글 시트 연결하기**를 엽니다.
2. `기록 가져오기` 칸에 구글 스프레드시트 주소를 넣습니다.
3. **기록 가져오기**를 누릅니다.

시트의 첫 번째 줄에는 아래 항목이 필요합니다.

| 이름 | 시작일 |
| --- | --- |

더 많은 내용을 함께 저장하려면 아래처럼 첫 줄을 만드세요.

| 이름 | 시작일 | 종료일 | 플랫폼 | 시간 | 엔딩여부 | 메모 | 한줄평 | Steam AppID |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 새 기록을 구글 시트에 저장하기

게임을 기록할 때마다 구글 시트에도 자동으로 추가하고 싶다면 아래 설정을 한 번만 하면 됩니다.

### 연결 코드 넣기

1. 구글 스프레드시트에서 **확장 프로그램 → Apps Script**를 엽니다.
2. 화면에 있는 코드를 모두 지우고 아래 코드를 붙여 넣습니다.
3. 저장 버튼을 누릅니다.

```javascript
const HEADERS = ['이름', '시작일', '종료일', '플랫폼', '시간', '엔딩여부', '메모', '한줄평', 'Steam AppID'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    sheet.appendRow([
      data.title || '',
      data.startDate || '',
      data.endDate || '',
      data.platform || '',
      Number(data.time || 0),
      data.isEnding || 'x',
      data.memo || '',
      data.review || '',
      data.steamAppId || ''
    ]);

    return json({ result: 'success' });
  } catch (error) {
    return json({ result: 'error', message: String(error) });
  }
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.action !== 'steamOwnedGames') return jsonp({ error: '잘못된 요청입니다.' }, p.callback);

  try {
    const url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/' +
      '?key=' + encodeURIComponent(p.key) +
      '&steamid=' + encodeURIComponent(p.steamid) +
      '&include_appinfo=1&format=json';
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error('Steam에서 정보를 가져오지 못했습니다.');
    return jsonp(JSON.parse(response.getContentText()), p.callback);
  } catch (error) {
    return jsonp({ error: String(error) }, p.callback);
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonp(data, callback) {
  const text = JSON.stringify(data);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + text + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json(data);
}
```

### 저장 주소 만들기

1. Apps Script 오른쪽 위에서 **배포 → 새 배포**를 누릅니다.
2. 유형은 **웹 앱**을 선택합니다.
3. 실행 계정은 **나**, 사용할 수 있는 사람은 **모든 사용자**로 선택합니다.
4. 배포 후 나오는 `/exec` 주소를 복사합니다.
5. Game Effect의 **기록 저장하기** 칸에 붙여 넣고 **저장 주소 입력**을 누릅니다.

## 기록 도구

- **처음 설정하기**: 시트 첫 줄에 무엇을 적는지와 연결 코드를 확인합니다.
- **기록 정리**: 날짜나 시간이 잘못된 기록, 완전히 같은 기록을 지웁니다.
- **엑셀 파일로 저장**: 현재 기록을 CSV 파일로 내려받습니다. Excel 또는 Google Sheets에서 열 수 있습니다.

## Steam 연결하기

Steam Web API Key와 SteamID64를 입력하고 저장합니다. 게임 이름을 입력하면 플레이 시간 계산에 활용할 수 있고, **최근 플레이 동기화**로 새 플레이 시간을 기록할 수 있습니다. 총 플레이 시간이 0.3시간(18분) 미만인 게임은 제외합니다.
