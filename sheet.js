// ==========================================
// 📊 SHEET MODULE: 스프레드시트 수신 및 전송
// ==========================================

const SPREADSHEET_HEADERS = ['이름', '시작일', '종료일', '플랫폼', '시간', '엔딩여부', '메모', '한줄평', 'Steam AppID'];

function saveWebAppUrlFromInput() {
    let urlVal = document.getElementById('webAppUrlInput').value.trim();
    if (!urlVal) {
        alert("연동할 구글 웹 앱 URL 주소를 올바르게 입력해 주세요!");
        return;
    }
    localStorage.setItem('user_local_web_app_url', urlVal);
    alert("개인용 실시간 양방향 저장 주소가 브라우저에 안전하게 저장되었습니다! 🔒");
    document.getElementById('webAppUrlInput').value = urlVal;
}

function toggleSpreadsheetGuide() {
    let guide = document.getElementById('spreadsheetGuide');
    let button = document.getElementById('spreadsheetGuideButton');
    let isVisible = guide.classList.toggle('is-visible');
    button.setAttribute('aria-expanded', String(isVisible));
    button.innerText = isVisible ? '📕 처음 설정하기 닫기' : '📋 처음 설정하기';
}

function getSavedWebAppUrl() {
    let targetUrl = localStorage.getItem('user_local_web_app_url');
    if (!targetUrl) {
        alert("먼저 '양방향 저장 연동'에 구글 웹 앱 URL 주소를 저장해 주세요.");
        return '';
    }
    return targetUrl;
}

function postWebAppData(targetUrl, payload) {
    return fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    });
}

function createSpreadsheetTemplate() {
    let targetUrl = getSavedWebAppUrl();
    if (!targetUrl) return;
    if (!confirm("비어 있는 시트에 기본 헤더를 만듭니다. 이미 데이터가 있는 시트는 변경하지 않습니다. 계속할까요?")) return;

    postWebAppData(targetUrl, { action: 'createTemplate', headers: SPREADSHEET_HEADERS })
        .then(result => {
            if (result.result !== 'success') throw new Error(result.message || '시트 기본 틀 생성에 실패했습니다.');
            alert("시트 기본 틀이 만들어졌습니다. 이제 시트 URL을 입력하고 불러오기를 실행해 주세요.");
        })
        .catch(error => alert(`시트 기본 틀 생성 실패: ${error.message}`));
}

function recordToSpreadsheetRow(game) {
    return [
        game.title || '',
        game.startDate || '',
        game.endDate || '',
        game.platform || '',
        Number(game.time || 0),
        game.isEnding || 'x',
        game.memo || '',
        game.review || '',
        game.steamAppId || ''
    ];
}

function createCsvText(records) {
    let escapeValue = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    let rows = [SPREADSHEET_HEADERS, ...records.map(recordToSpreadsheetRow)];
    return '\uFEFF' + rows.map(row => row.map(escapeValue).join(',')).join('\r\n');
}

function downloadRecordsAsCsv() {
    if (localEvents.length === 0) {
        alert("다운로드할 기록이 없습니다.");
        return;
    }

    let records = localEvents.map(event => ({ ...event.extendedProps }));
    let csvText = createCsvText(records);
    let blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
    let downloadUrl = URL.createObjectURL(blob);
    let link = document.createElement('a');
    let today = new Date().toISOString().split('T')[0];

    link.href = downloadUrl;
    link.download = `game-effect-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
}

function cleanLocalGameData() {
    if (localEvents.length === 0) {
        alert("정리할 기록이 없습니다.");
        return;
    }
    if (!confirm("잘못된 날짜·시간 기록과 완전히 같은 중복 기록을 제거하고 날짜순으로 정리합니다. 계속할까요?")) return;

    let cleanedEvents = [];
    let seenRecords = new Set();
    let removedCount = 0;

    localEvents.forEach(event => {
        let game = event.extendedProps || {};
        let title = (game.title || event.title || '').trim();
        let startDate = getValidatedDate(game.startDate || '');
        let rawEndDate = game.rawEndDate || game.endDate || startDate;
        let endDate = getValidatedDate(rawEndDate || '');
        let time = Number(game.time);

        if (!title || !startDate || !endDate || endDate < startDate || !Number.isFinite(time) || time < 0) {
            removedCount++;
            return;
        }

        let platform = (game.platform || '기타').trim() || '기타';
        let endingStatus = game.isEnding || 'x';
        let memo = game.memo || '';
        let review = game.review || '';
        let key = [title.toLowerCase(), startDate, endDate, platform.toLowerCase(), time, endingStatus, memo, review].join('\u001F');

        if (seenRecords.has(key)) {
            removedCount++;
            return;
        }

        seenRecords.add(key);
        let isEnding = endingStatus !== 'x';
        cleanedEvents.push(createGameObj(title, startDate, endDate, platform, time, endingStatus, memo, review, isEnding, game.steamAppId));
    });

    cleanedEvents.sort((a, b) => {
        let dateOrder = a.extendedProps.startDate.localeCompare(b.extendedProps.startDate);
        return dateOrder || a.title.localeCompare(b.title, 'ko');
    });

    localEvents = cleanedEvents;
    uniqueTitles = [];
    refreshUI();
    saveToLocalStorage();
    alert(`데이터 정리가 완료되었습니다. ${removedCount}개 기록을 제거했고, ${cleanedEvents.length}개 기록을 유지했습니다.`);
}

function extractSpreadsheetId(urlText) {
    if (!urlText) return null;
    urlText = urlText.trim();
    if (urlText.includes("/d/e/")) {
        let parts = urlText.split("/d/e/");
        if (parts[1]) return parts[1].split("/")[0].split("?")[0].trim();
    }
    if (urlText.includes("/d/")) {
        let parts = urlText.split("/d/");
        if (parts[1]) return parts[1].split("/")[0].split("?")[0].trim();
    }
    return urlText;
}

function cleanGoogleDate(val) {
    if (!val) return '';
    let str = val.toString();
    if (str.includes('Date(')) {
        let matches = str.match(/Date\((\d+),(\d+),(\d+)\)/);
        if (matches) {
            let y = matches[1];
            let m = (parseInt(matches[2]) + 1).toString().padStart(2, '0');
            let d = matches[3].padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }
    return str.trim();
}

function parseCSVTextToRows(text) {
    let lines = [];
    let row = [""], inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        let el = text[i];
        let nextEl = text[i+1];
        if (el === '"') {
            if (inQuotes && nextEl === '"') { row[row.length - 1] += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (el === ',' && !inQuotes) {
            row.push("");
        } else if ((el === '\r' || el === '\n') && !inQuotes) {
            if (el === '\r' && nextEl === '\n') { i++; }
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += el;
        }
    }
    if (row.length > 1 || row[0] !== "") lines.push(row);
    return lines;
}

function parseAndRenderCSV(csvText) {
    let allRows = parseCSVTextToRows(csvText);
    if (allRows.length < 1) return;
    let parsedEvents = [];

    let cols = allRows[0].map(c => c.trim().replace(/^"|"$/g, ''));
    let nameIdx = cols.indexOf('이름');
    let startIdx = cols.indexOf('시작일');
    let endIdx = cols.indexOf('종료일');
    let platformIdx = cols.indexOf('플랫폼');
    let timeIdx = cols.indexOf('시간');
    let endingIdx = cols.indexOf('엔딩여부') !== -1 ? cols.indexOf('엔딩여부') : cols.indexOf('트로피');
    let memoIdx = cols.indexOf('메모');
    let reviewIdx = cols.indexOf('한줄평');
    let steamAppIdIdx = cols.indexOf('Steam AppID');

    if (nameIdx === -1 || startIdx === -1) return;

    for (let i = 1; i < allRows.length; i++) {
        let row = allRows[i].map(r => r.trim().replace(/^"|"$/g, ''));
        if (row.length <= nameIdx || !row[nameIdx]) continue;

        let name = row[nameIdx];
        let startDate = row[startIdx];
        let endDate = row[endIdx] || '';
        let platform = row[platformIdx] || '-';
        let time = parseFloat(row[timeIdx] || 0);
        let endingStatus = row[endingIdx] || 'x';
        let memo = row[memoIdx] || '';
        let review = reviewIdx !== -1 ? (row[reviewIdx] || '') : '';
        let steamAppId = steamAppIdIdx !== -1 ? (row[steamAppIdIdx] || '') : '';

        if (!name || !startDate) continue;
        if (memo === '기록된 메모가 없습니다.' || memo === '-') memo = '';

        let isEndMark = (endingStatus === 'o' || endingStatus.includes('엔딩') || endingStatus.includes('%'));
        parsedEvents.push(createGameObj(name, startDate, endDate, platform, time, endingStatus, memo, review, isEndMark, steamAppId));
    }
    localEvents = parsedEvents;
    uniqueTitles = [];
    refreshUI();
    saveToLocalStorage();
}

window.handleGoogleSheetResponse = function(rawJson) {
    let oldScript = document.getElementById('googlesheet-jsonp-script');
    if (oldScript) oldScript.remove();

    if (!rawJson || !rawJson.table) return;

    localEvents = [];
    uniqueTitles = [];

    let rows = rawJson.table.rows;
    let cols = rawJson.table.cols.map(c => c.label ? c.label.trim() : '');

    let isHeaderInRows = false;
    if ((cols.indexOf('이름') === -1 || cols.indexOf('시작일') === -1) && rows.length > 0) {
        let firstRow = rows[0].c;
        let tempCols = firstRow.map(cell => cell && (cell.v !== undefined ? cell.v : (cell.f !== undefined ? cell.f : '')).toString().trim());
        if (tempCols.indexOf('이름') !== -1) { cols = tempCols; isHeaderInRows = true; }
    }

    let nameIdx = cols.indexOf('이름');
    let startIdx = cols.indexOf('시작일');
    let endIdx = cols.indexOf('종료일');
    let platformIdx = cols.indexOf('플랫폼');
    let timeIdx = cols.indexOf('시간');
    let endingIdx = cols.indexOf('엔딩여부') !== -1 ? cols.indexOf('엔딩여부') : cols.indexOf('트로피');
    let memoIdx = cols.indexOf('메모');
    let reviewIdx = cols.indexOf('한줄평');
    let steamAppIdIdx = cols.indexOf('Steam AppID');

    if (nameIdx === -1 || startIdx === -1) return;

    let startIndex = isHeaderInRows ? 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
        let row = rows[i].c;
        if (!row || !row[nameIdx]) continue;

        let name = row[nameIdx]?.v ? row[nameIdx].v.toString().trim() : '';
        let startDate = row[startIdx] ? cleanGoogleDate(row[startIdx].f || row[startIdx].v) : '';
        let endDate = row[endIdx] ? cleanGoogleDate(row[endIdx].f || row[endIdx].v) : '';
        let platform = row[platformIdx]?.v ? row[platformIdx].v.toString().trim() : '-';
        let time = row[timeIdx]?.v ? parseFloat(row[timeIdx].v) : 0;
        let endingStatus = row[endingIdx]?.v ? row[endingIdx].v.toString().trim() : 'x';
        let memo = row[memoIdx]?.v ? row[memoIdx].v.toString().trim() : '';
        let review = reviewIdx !== -1 && row[reviewIdx]?.v ? row[reviewIdx].v.toString().trim() : '';
        let steamAppId = steamAppIdIdx !== -1 && row[steamAppIdIdx]?.v ? row[steamAppIdIdx].v.toString().trim() : '';

        if (!name || !startDate) continue;
        if (memo === '기록된 메모가 없습니다.' || memo === '-') memo = '';

        let isEndMark = (endingStatus === 'o' || endingStatus.toString().includes('엔딩') || endingStatus.toString().includes('%'));
        localEvents.push(createGameObj(name, startDate, endDate, platform, time, endingStatus, memo, review, isEndMark, steamAppId));
    }

    refreshUI();
    saveToLocalStorage();
};

function forceFetchSpreadsheetData() {
    let rawUrlInput = document.getElementById('spreadsheetUrlInput').value.trim();
    let sheetId = extractSpreadsheetId(rawUrlInput);

    if (!sheetId) {
        alert("구글 스프레드시트 주소를 복사해 주세요!");
        return;
    }

    localStorage.setItem('saved_game_sheet_url', rawUrlInput);

    if (rawUrlInput.includes("2PACX-")) {
        let csvCleanUrl = rawUrlInput.split("/pubhtml")[0].split("?")[0] + "/pub?output=csv";
        fetch(csvCleanUrl)
            .then(response => { if (!response.ok) throw new Error(); return response.text(); })
            .then(csvText => { parseAndRenderCSV(csvText); })
            .catch(() => alert("시트를 불러오지 못했습니다. 기존 기록은 유지됩니다."));
    } else {
        let oldScript = document.getElementById('googlesheet-jsonp-script');
        if (oldScript) oldScript.remove();

        let generatedTargetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:handleGoogleSheetResponse&headers=1`;
        let script = document.createElement('script');
        script.id = 'googlesheet-jsonp-script';
        script.src = generatedTargetUrl;
        document.body.appendChild(script);
    }
}

function sendDataToGoogleSheet(gameData) {
    let targetUrl = localStorage.getItem('user_local_web_app_url');
    if (!targetUrl) return;
    
    fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(gameData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.result !== "success") {
            console.error("구글 시트 전송 실패:", result.message);
        }
    })
    .catch(err => console.error("네트워크 동기화 오류:", err));
}
