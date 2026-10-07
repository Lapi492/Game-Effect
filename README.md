# 🎮 Game Effect

개인 게임 기록을 달력·목록·연도별 리포트로 관리하는 웹 대시보드입니다. Google 스프레드시트와 연동해 기록을 읽고, 새 기록 또는 전체 기록을 시트에 저장할 수 있습니다.

## 주요 기능

- 게임 기록 작성, 검색, 수정, 메모 및 한줄평 관리
- Steam 최근 플레이타임 동기화 (총 플레이 20분 이하 게임 제외)
- Google 스프레드시트에서 기록 불러오기
- 현재 기록 전체를 Excel·Google Sheets용 CSV 파일로 다운로드
- 잘못된 날짜·시간 및 완전히 중복된 기록 정리
- 최초 사용자를 위한 스프레드시트 기본 헤더 생성

## 빠른 시작

1. 웹페이지에서 **시트 연동 및 양방향 저장 설정**을 엽니다.
2. 아래 Apps Script를 스프레드시트에 설정하고 웹 앱 URL을 저장합니다.
3. 새 시트라면 **시트 최소 조건 안내**에서 필수 헤더를 확인해 첫 행에 입력합니다.
4. 시트 URL을 넣고 **시트 불러오기**를 누릅니다.

## 시트 헤더

첫 행은 아래 순서와 이름을 사용합니다.

| 이름 | 시작일 | 종료일 | 플랫폼 | 시간 | 엔딩여부 | 메모 | 한줄평 |
| --- | --- | --- | --- | --- | --- | --- | --- |

최소 조건은 첫 번째 행의 `이름`, `시작일` 헤더입니다. 전체 헤더를 사용하면 메모와 한줄평 등 모든 정보를 함께 관리할 수 있습니다.

## Google Apps Script 설정

스프레드시트에서 **확장 프로그램 → Apps Script**를 열고 아래 코드를 붙여 넣습니다.

```javascript
const HEADERS = ['이름', '시작일', '종료일', '플랫폼', '시간', '엔딩여부', '메모', '한줄평'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    if (data.action === 'createTemplate') {
      if (sheet.getLastRow() > 0 || sheet.getLastColumn() > 0) {
        throw new Error('기본 틀은 비어 있는 시트에서만 만들 수 있습니다.');
      }
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      return jsonOutput({ result: 'success' });
    }

    if (data.action === 'replaceAll') {
      const records = Array.isArray(data.records) ? data.records : [];
      sheet.clearContents();
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

      if (records.length > 0) {
        const rows = records.map(recordToRow);
        sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
      }
      return jsonOutput({ result: 'success', count: records.length });
    }

    sheet.appendRow(recordToRow(data));
    return jsonOutput({ result: 'success' });
  } catch (error) {
    return jsonOutput({ result: 'error', message: String(error) });
  }
}

function doGet(e) {
  const params = e.parameter || {};
  if (params.action !== 'steamOwnedGames') {
    return jsonOrJsonp({ error: '지원하지 않는 요청입니다.' }, params.callback);
  }

  try {
    if (!params.key || !params.steamid) throw new Error('Steam API 키 또는 SteamID64가 없습니다.');

    const steamUrl =
      'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/' +
      '?key=' + encodeURIComponent(params.key) +
      '&steamid=' + encodeURIComponent(params.steamid) +
      '&include_appinfo=1&format=json';
    const response = UrlFetchApp.fetch(steamUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error('Steam API 응답 오류: ' + response.getResponseCode());

    return jsonOrJsonp(JSON.parse(response.getContentText()), params.callback);
  } catch (error) {
    return jsonOrJsonp({ error: String(error) }, params.callback);
  }
}

function recordToRow(data) {
  return [
    data.title || '', data.startDate || '', data.endDate || '', data.platform || '',
    Number(data.time || 0), data.isEnding || 'x', data.memo || '', data.review || ''
  ];
}

function jsonOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonOrJsonp(data, callback) {
  const json = JSON.stringify(data);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 웹 앱 배포

1. Apps Script에서 **배포 → 새 배포**를 선택합니다.
2. 유형은 **웹 앱**으로 선택합니다.
3. 실행 계정은 **나**, 액세스 권한은 **모든 사용자**로 설정합니다.
4. 배포 후 생성되는 `/exec` URL을 복사합니다.
5. Game Effect의 `양방향 저장 연동`에 URL을 붙여 넣고 저장합니다.

## 데이터 도구 안내

- **시트 최소 조건 안내**: 필수 헤더와 Apps Script 설정·배포 코드를 앱 안에서 확인합니다.
- **데이터 정리**: 날짜·시간이 올바르지 않은 기록 및 완전히 같은 중복 기록을 제거하고 날짜순으로 정렬합니다.
- **Excel용 CSV 파일 다운로드**: 브라우저에 저장된 전체 기록을 한글 호환 CSV 파일로 내려받습니다. Excel 또는 Google Sheets에서 열어 사용할 수 있습니다.
