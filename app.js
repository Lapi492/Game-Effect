// ==========================================
// 👑 1. 전역 상태 캐시 데이터 저장소
// ==========================================
let localEvents = []; 
let uniqueTitles = []; 
let currentSelectedEventId = null;
let currentSelectedGameTitle = ""; 
let calendar = null;

// 로컬 저장소에 현재 변경 상태를 영구 캐싱하는 엔진
function saveToLocalStorage() {
    localStorage.setItem('cached_game_events', JSON.stringify(localEvents));
}

// 💾 입력폼으로부터 양방향 전송용 웹 앱 URL을 개별 로컬 브라우저에 격리 저장하는 기능
function saveWebAppUrlFromInput() {
    let urlVal = document.getElementById('webAppUrlInput').value.trim();
    if(!urlVal) {
        alert("연동할 구글 웹 앱 URL 주소를 올바르게 입력해 주세요!");
        return;
    }
    localStorage.setItem('user_local_web_app_url', urlVal);
    alert("개인용 실시간 양방향 저장 주소가 브라우저에 안전하게 저장되었습니다! 🔒");
    
    document.getElementById('webAppUrlInput').value = urlVal;
}

// ==========================================
// 🎨 2. 플랫폼 색상 자동 동기화 및 가공 헬퍼 함수
// ==========================================
function getSmartGameColor(title) {
    let hash = 0;
    for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash % 360)}, 65%, 45%)`;
}

function determineEventColor(gameObj) {
    let p = gameObj.platform ? gameObj.platform.trim().toLowerCase() : '';
    if (p === 'steam') return '#1044a0';         
    if (p === 'xbox gamepass') return '#107c10'; 
    if (p === 'switch') return '#ffb0b0';        
    if (p === 'switch2') return '#e60012';       
    if (p === 'ps4') return '#b0b0ff';           
    if (p === 'ps5') return '#4a148c';           
    if (p === 'stove') return '#ffa259';         
    if (p === 'epic') return '#00a3ff';          
    if (p === 'mobile') return '#2d2d2d';        
    if (p === 'dlc') return '#888888';           
    if (p === '기타') return '#b0bec5';          
    return getSmartGameColor(gameObj.title);     
}

function extractSpreadsheetId(urlText) {
    if(!urlText) return null;
    urlText = urlText.trim();
    if(urlText.includes("/d/e/")) {
        let parts = urlText.split("/d/e/");
        if(parts[1]) return parts[1].split("/")[0].split("?")[0].trim();
    }
    if(urlText.includes("/d/")) {
        let parts = urlText.split("/d/");
        if(parts[1]) return parts[1].split("/")[0].split("?")[0].trim();
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

// 날짜 연산 헬퍼 함수
function addDays(dateStr, days) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function SmartDateFormatter(inputStr) {
    if(!inputStr || !inputStr.trim()) return '';
    let clean = inputStr.replace(/[^0-9]/g, '-').replace(/-+/g, '-');
    if(clean.endsWith('-')) clean = clean.slice(0, -1);
    let parts = clean.split('-');
    let currentYear = new Date().getFullYear();
    if(parts.length === 2) {
        return `${currentYear}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    } else if(parts.length === 3) {
        let yy = parts[0].length === 2 ? '20' + parts[0] : parts[0];
        return `${yy}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return inputStr;
}

// ==========================================
// ⏱️ 3. 플레이타임 실시간 연동 계산기 시스템
// ==========================================
function autoFillPrevTime(gameNameInput) {
    let trimmed = gameNameInput.trim().toLowerCase();
    if(!trimmed) { document.getElementById('calcPrevTime').value = ''; return; }
    let sameGames = localEvents.filter(e => e.title && e.title.toLowerCase() === trimmed);
    let currentTotal = sameGames.reduce((acc, curr) => acc + curr.extendedProps.time, 0);
    document.getElementById('calcPrevTime').value = currentTotal > 0 ? currentTotal.toFixed(1) : '0';
}

function calculateTimeDifference() {
    let prev = parseFloat(document.getElementById('calcPrevTime').value || 0);
    let curr = parseFloat(document.getElementById('calcCurrTime').value || 0);
    if(curr <= prev) {
        document.getElementById('calcResultBox').innerHTML = `<span style="color:#ef4444; font-weight:bold;">⚠️ 오류: 현재 총 플레이 시간이 이전 누적 시간보다 커야 합니다.</span>`;
        return;
    }
    let diff = (curr - prev).toFixed(1);
    document.getElementById('gameTime').value = diff; 
    document.getElementById('calcResultBox').innerHTML = `📈 계산 완료: 이전 기록 대비 <span style="color:#10b981; font-weight:bold; font-size:1.1em;">+${diff}</span> 시간이 증가하여 플레이 시간 칸에 자동 반영되었습니다.`;
}

// ==========================================
// 📅 4. UI 탭 전환 및 검색 자동완성 모듈
// ==========================================
function switchTab(viewId) {
    document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if(btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(viewId)) {
            btn.classList.add('active');
        }
    });
    
    if(viewId === 'calendar-view' && calendar) { 
        calendar.updateSize();
    }
    if((viewId === 'report-view' || viewId === 'list-view') && localEvents.length > 0) { refreshUI(); }
}

function searchGameTitles(keyword) {
    let listEl = document.getElementById('autocompleteList');
    listEl.innerHTML = '';
    if(!keyword.trim()) { listEl.style.display = 'none'; return; }
    let matches = uniqueTitles.filter(title => title.toLowerCase().includes(keyword.trim().toLowerCase()));
    if(matches.length > 0) {
        matches.forEach(match => {
            let item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.innerText = match;
            item.onclick = function() {
                document.getElementById('gameName').value = match;
                listEl.style.display = 'none';
                autoFillPrevTime(match);
            };
            listEl.appendChild(item);
        });
        listEl.style.display = 'block';
    } else { listEl.style.display = 'none'; }
}

// ==========================================
// 🔍 5. 스마트 실시간 통합 다중 필터 검색 엔진
// ==========================================
function executeLiveGameSearch() {
    let titleKeyword = document.getElementById('searchTitleInput').value.trim().toLowerCase();
    let dateKeyword = document.getElementById('searchDateInput').value.trim();

    if (titleKeyword || dateKeyword) {
        document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('list-view').classList.add('active');
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if(btn.getAttribute('onclick') && btn.getAttribute('onclick').includes('list-view')) {
                btn.classList.add('active');
            }
        });
    }

    buildAggregatedCards('list-container', null, titleKeyword, dateKeyword);
}

function isGameInSearchDate(gStart, gEnd, query) {
    gStart = gStart.trim();
    gEnd = gEnd.trim() !== '' ? gEnd.trim() : '9999-12-31'; 
    query = query.trim();

    if (query.includes('~')) {
        let parts = query.split('~');
        let qStart = SmartDateFormatter(parts[0].trim());
        let qEnd = SmartDateFormatter(parts[1].trim());
        if (!qStart || !qEnd) return false;
        return (gStart <= qEnd && gEnd >= qStart);
    } else {
        let qStart = query;
        let qEnd = query;
        if (query.length === 4) {
            qStart = `${query}-01-01`; qEnd = `${query}-12-31`;
        } else if (query.length === 7) {
            qStart = `${query}-01`; qEnd = `${query}-31`;
        }
        return (gStart <= qEnd && gEnd >= qStart);
    }
}

function clearSearchFilters() {
    document.getElementById('searchTitleInput').value = '';
    document.getElementById('searchDateInput').value = '';
    refreshUI();
}

// ==========================================
// 🔗 6. 구글 스프레드시트 수신 및 동형 데이터 세션 병합 처리소
// ==========================================
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

    let cols = allRows[0].map(c => c.trim().replace(/^"|"$/g, ''));
    let nameIdx = cols.indexOf('이름');
    let startIdx = cols.indexOf('시작일');
    let endIdx = cols.indexOf('종료일');
    let platformIdx = cols.indexOf('플랫폼');
    let timeIdx = cols.indexOf('시간');
    let endingIdx = cols.indexOf('엔딩여부') !== -1 ? cols.indexOf('엔딩여부') : cols.indexOf('트로피');
    let memoIdx = cols.indexOf('메모');
    let reviewIdx = cols.indexOf('한줄평');

    if (nameIdx === -1 || startIdx === -1) return;

    for (let i = 1; i < allRows.length; i++) {
        let row = allRows[i].map(r => r.trim().replace(/^"|"$/g, ''));
        if (row.length <= nameIdx || !row[nameIdx]) continue;

        let name = row[nameIdx];
        let startDate = row[startIdx];
        let endDate = row[endIdx] || '';
        let platform = row[platformIdx] || '-';
        let time = parseFloat(row[timeIdx] || 0);
        let endingStatus = row[endingStatusIdx] || 'x';
        let memo = row[memoIdx] || '';
        let review = reviewIdx !== -1 ? (row[reviewIdx] || '') : '';

        if (!name || !startDate) continue;
        if (memo === '기록된 메모가 없습니다.' || memo === '-') memo = '';

        let isEndMark = (endingStatus === 'o' || endingStatus.includes('엔딩') || endingStatus.includes('%'));
        
        // 🚀 [로딩 엔진 혁신] 시간만 적어서 추가됐던 연속 세션 행들을 로딩할 때 하나로 매끄럽게 묶어줌
        let dayBeforeStart = addDays(startDate, -1);
        let continuousEvent = localEvents.find(e => 
            e.title.toLowerCase() === name.toLowerCase() && e.extendedProps.rawEndDate === dayBeforeStart
        );

        if (continuousEvent) {
            continuousEvent.extendedProps.time += time;
            let targetEnd = endDate || startDate;
            continuousEvent.extendedProps.rawEndDate = targetEnd;
            continuousEvent.extendedProps.endDate = targetEnd === continuousEvent.extendedProps.startDate ? '' : targetEnd;
            let calcEnd = new Date(targetEnd);
            calcEnd.setDate(calcEnd.getDate() + 1);
            continuousEvent.end = calcEnd.toISOString().split('T')[0];
            if (memo) continuousEvent.extendedProps.memo += "\n" + memo;
        } else {
            localEvents.push(createGameObj(name, startDate, endDate, platform, time, endingStatus, memo, review, isEndMark));
        }
    }
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

        if (!name || !startDate) continue;
        if (memo === '기록된 메모가 없습니다.' || memo === '-') memo = '';

        let isEndMark = (endingStatus === 'o' || endingStatus.toString().includes('엔딩') || endingStatus.toString().includes('%'));
        
        // 🚀 [클라우드 로딩 보정] 웹 게시 형태로 받아올 때도 연속성 기록 분리 버그 철저방어
        let dayBeforeStart = addDays(startDate, -1);
        let continuousEvent = localEvents.find(e => 
            e.title.toLowerCase() === name.toLowerCase() && e.extendedProps.rawEndDate === dayBeforeStart
        );

        if (continuousEvent) {
            continuousEvent.extendedProps.time += time;
            let targetEnd = endDate || startDate;
            continuousEvent.extendedProps.rawEndDate = targetEnd;
            continuousEvent.extendedProps.endDate = targetEnd === continuousEvent.extendedProps.startDate ? '' : targetEnd;
            let calcEnd = new Date(targetEnd);
            calcEnd.setDate(calcEnd.getDate() + 1);
            continuousEvent.end = calcEnd.toISOString().split('T')[0];
            if (memo) continuousEvent.extendedProps.memo += "\n" + memo;
        } else {
            localEvents.push(createGameObj(name, startDate, endDate, platform, time, endingStatus, memo, review, isEndMark));
        }
    }

    refreshUI();
    saveToLocalStorage();
};

function forceFetchSpreadsheetData() {
    let rawUrlInput = document.getElementById('spreadsheetUrlInput').value.trim();
    let sheetId = extractSpreadsheetId(rawUrlInput);

    if(!sheetId) {
        alert("구글 스프레드시트 주소를 복사해 주세요!");
        return;
    }

    localStorage.setItem('saved_game_sheet_url', rawUrlInput);
    localEvents = []; 
    uniqueTitles = [];

    if (rawUrlInput.includes("2PACX-")) {
        let csvCleanUrl = rawUrlInput.split("/pubhtml")[0].split("?")[0] + "/pub?output=csv";
        fetch(csvCleanUrl)
            .then(response => { if (!response.ok) throw new Error(); return response.text(); })
            .then(csvText => { parseAndRenderCSV(csvText); })
            .catch(() => {});
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

// 💡 [알림창 전면 제거] 무소음 백그라운드 클라우드 전송 가동
function sendDataToGoogleSheet(gameData) {
    let targetUrl = localStorage.getItem('user_local_web_app_url');
    if(!targetUrl) return;
    
    fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(gameData)
    })
    .then(response => response.json())
    .then(result => {
        if(result.result === "success") {
            console.log("✅ 클라우드 동기화 성공");
        }
    })
    .catch(err => console.error("⚠️ 네트워크 동기화 오류:", err));
}

// ==========================================
// ➕ 7. 새 게임 추가 및 모달 팝업 통제소
// ==========================================
function handleGameSubmit(event) {
    event.preventDefault();
    let name = document.getElementById('gameName').value.trim();
    let inputTime = parseFloat(document.getElementById('gameTime').value);
    let startDate = SmartDateFormatter(document.getElementById('gameStart').value);
    let endDate = SmartDateFormatter(document.getElementById('gameEnd').value);
    let platform = document.getElementById('gamePlatform').value;
    let checkEnding = document.getElementById('gameIsEnding').checked;

    let todayStr = new Date().toISOString().split('T')[0];
    let endingStatusValue = checkEnding ? 'o' : 'x';

    if(checkEnding) {
        let previousEndingsCount = localEvents.filter(e => e.title.toLowerCase() === name.toLowerCase() && (e.extendedProps.isEnding === 'o' || e.extendedProps.isEnding.includes('엔딩'))).length;
        if(previousEndingsCount > 0) endingStatusValue = `엔딩 ${previousEndingsCount + 1}`;
    }

    let calculatedEnd = todayStr;
    let isTimeOnly = !startDate;

    if (isTimeOnly) {
        let existEvents = localEvents.filter(e => e.title.toLowerCase() === name.toLowerCase());
        if (existEvents.length > 0) {
            let lastEvent = existEvents.reduce((prev, current) => {
                let prevEnd = prev.extendedProps.rawEndDate || prev.extendedProps.startDate;
                let currEnd = current.extendedProps.rawEndDate || current.extendedProps.startDate;
                return (new Date(prevEnd) > new Date(currEnd)) ? prev : current;
            });
            let baseLastDate = lastEvent.extendedProps.rawEndDate || lastEvent.extendedProps.startDate;
            startDate = addDays(baseLastDate, 1);
            if(new Date(startDate) > new Date(todayStr)) { startDate = todayStr; }
        } else {
            startDate = todayStr;
        }
        calculatedEnd = endDate ? SmartDateFormatter(endDate) : todayStr;
    } else {
        calculatedEnd = endDate ? SmartDateFormatter(endDate) : startDate;
    }

    // 🚀 [핵심 픽스]: 시간만 적었을 때 이전 바의 꼬리에 붙여서 늘려주는 엔진 가동
    let dayBeforeStart = addDays(startDate, -1);
    let continuousEvent = localEvents.find(e => 
        e.title.toLowerCase() === name.toLowerCase() && e.extendedProps.rawEndDate === dayBeforeStart
    );

    if (continuousEvent) {
        continuousEvent.extendedProps.time += inputTime;
        continuousEvent.extendedProps.rawEndDate = calculatedEnd;
        continuousEvent.extendedProps.endDate = calculatedEnd === continuousEvent.extendedProps.startDate ? '' : calculatedEnd;
        
        let calcEnd = new Date(calculatedEnd);
        calcEnd.setDate(calcEnd.getDate() + 1);
        continuousEvent.end = calcEnd.toISOString().split('T')[0];
    } else {
        let newGame = createGameObj(name, startDate, calculatedEnd, platform, inputTime, endingStatusValue, '', '', checkEnding);
        localEvents.push(newGame);
    }

    refreshUI();
    saveToLocalStorage();
    
    // 시트엔 히스토리 보존을 위해 단일 로그 객체 전송
    sendDataToGoogleSheet({
        title: name, startDate: startDate, endDate: calculatedEnd === startDate ? '' : calculatedEnd,
        platform: platform, time: inputTime, isEnding: endingStatusValue, memo: '', review: ''
    });
    
    document.getElementById('gameForm').reset();
    document.getElementById('autocompleteList').style.display = 'none';
}

function createGameObj(name, start, end, platform, time, endingStatus, memo, review, isCheckEnding = false) {
    let uniqueId = 'evt_' + Math.random().toString(36).substr(2, 9);
    let displayEnd = end === start ? '' : end; 
    
    let gameObj = {
        id: uniqueId, title: name, startDate: start, endDate: displayEnd, rawEndDate: end,     
        platform: platform, time: parseFloat(time || 0), isEnding: endingStatus, memo: memo || '', review: review || ''
    };

    let eventObj = { id: uniqueId, title: name, start: start, extendedProps: gameObj };
    eventObj.backgroundColor = determineEventColor(gameObj);

    let calcEnd = new Date(end);
    if (!isNaN(calcEnd.getTime())) {
        calcEnd.setDate(calcEnd.getDate() + 1);
        eventObj.end = calcEnd.toISOString().split('T')[0];
    } else {
        eventObj.end = start;
    }
    return eventObj;
}

function buildAggregatedCards(targetContainerId, targetYear = null, titleFilter = "", dateFilter = "") {
    let container = document.getElementById(targetContainerId);
    container.innerHTML = '';
    let sourceList = localEvents;
    
    if(targetYear) { sourceList = localEvents.filter(evt => evt.extendedProps.startDate.split('-')[0] === targetYear); }
    
    if (titleFilter || dateFilter) {
        sourceList = sourceList.filter(evt => {
            let game = evt.extendedProps;
            let matchTitle = titleFilter ? game.title.toLowerCase().includes(titleFilter) : true;
            let matchDate = dateFilter ? isGameInSearchDate(game.startDate, game.rawEndDate || game.startDate, dateFilter) : true;
            return matchTitle && matchDate;
        });
    }

    if(sourceList.length === 0) { container.innerHTML = '<div style="color:#9ca3af; padding:10px;">기록된 플레이 목록이 없습니다.</div>'; return; }

    let titleTimeMap = {};
    let titleEndingMap = {};
    let titlePlatformMap = {}; 

    sourceList.forEach(evt => {
        let game = evt.extendedProps;
        titleTimeMap[game.title] = (titleTimeMap[game.title] || 0) + game.time;
        if (game.isEnding && (game.isEnding === 'o' || game.isEnding.includes('엔딩'))) { titleEndingMap[game.title] = true; }
        titlePlatformMap[game.title] = game.platform;
    });

    let timeLabelText = targetYear ? "해당 연도 플레이 시간" : "총 플레이타임";

    for(let title in titleTimeMap) {
        let aggregatedTime = titleTimeMap[title];
        let platform = titlePlatformMap[title];
        let cardColor = determineEventColor({ title: title, platform: platform });
        let hasEnded = titleEndingMap[title];

        let card = document.createElement('div');
        card.className = 'game-card';
        card.style.borderLeft = `6px solid ${cardColor}`;
        
        let badgeHTML = hasEnded ? '<div class="card-ending-badge">🏆 엔딩 완료</div>' : '';
        card.innerHTML = `
            ${badgeHTML}
            <div class="card-title">${title}</div>
            <div class="card-info" style="font-size: 1.1em; margin-top: 10px;">⏱ ${timeLabelText}: <span style="color:#818cf8; font-size:1.2em;">${aggregatedTime.toFixed(1)}</span> 시간</div>
        `;
        card.addEventListener('click', () => { openDetailModalByTitle(title); });
        container.appendChild(card);
    }
}

function calculateYearlyReport(targetYear) {
    let filteredEvents = localEvents.filter(evt => evt.extendedProps.startDate.split('-')[0] === targetYear);
    if(filteredEvents.length === 0) {
        document.getElementById('statTotalTime').innerText = '0 시간';
        document.getElementById('statEndingCount').innerText = '0 개';
        document.getElementById('statMostPlayedGame').innerText = '-';
        document.getElementById('statMostPlayedTime').innerText = '0h 플레이';
        document.getElementById('statLongestMemo').innerText = '-';
        document.getElementById('year-list-container').innerHTML = '';
        return;
    }

    let totalTime = 0; let titleTimeMap = {}; let uniqueEndedGamesInYear = new Set(); let latestReviewText = "-"; let maxStartDate = "";

    filteredEvents.forEach(evt => {
        let game = evt.extendedProps; let t = game.time; totalTime += t;
        titleTimeMap[game.title] = (titleTimeMap[game.title] || 0) + t;
        if(game.isEnding && game.isEnding !== 'x') { uniqueEndedGamesInYear.add(game.title.toLowerCase()); }
        if(game.review && game.review.trim() !== '') {
            if(game.startDate > maxStartDate) { maxStartDate = game.startDate; latestReviewText = `[${game.title}] ${game.review}`; }
        }
    });

    let mostPlayedGame = '-'; let mostPlayedTime = 0;
    for(let title in titleTimeMap) { if(titleTimeMap[title] > mostPlayedTime) { mostPlayedTime = titleTimeMap[title]; mostPlayedGame = title; } }

    document.getElementById('statTotalTime').innerText = totalTime.toFixed(1) + ' 시간';
    document.getElementById('statEndingCount').innerText = uniqueEndedGamesInYear.size + ' 개';
    document.getElementById('statMostPlayedGame').innerText = mostPlayedGame;
    document.getElementById('statMostPlayedTime').innerText = mostPlayedTime.toFixed(1) + 'h 올해 순수 플레이';
    document.getElementById('statLongestMemo').innerText = latestReviewText;

    buildAggregatedCards('year-list-container', targetYear);
}

function refreshUI() {
    let yearSelect = document.getElementById('reportYearSelect');
    let currentSelectedYear = yearSelect.value;
    let yearsFound = [];

    localEvents.forEach(e => {
        let t = e.title.trim();
        if(t && !uniqueTitles.includes(t)) uniqueTitles.push(t);
        let startY = e.extendedProps.startDate.split('-')[0];
        if(startY && !yearsFound.includes(startY)) yearsFound.push(startY);
    });

    yearsFound.sort((a,b) => b - a);
    yearSelect.innerHTML = '';
    yearsFound.forEach(y => {
        let opt = document.createElement('option'); opt.value = y; opt.innerText = y + ' 년';
        yearSelect.appendChild(opt);
    });

    if(currentSelectedYear && yearsFound.includes(currentSelectedYear)) yearSelect.value = currentSelectedYear;
    else if(yearsFound.length > 0) yearSelect.value = yearsFound[0];

    if(calendar) { calendar.refetchEvents(); }
    buildAggregatedCards('list-container'); 
    if(yearSelect.value) calculateYearlyReport(yearSelect.value);
}

function openDetailModalById(id) {
    let targetEvent = localEvents.find(e => e.id === id);
    if (!targetEvent) return;
    
    let gameObj = targetEvent.extendedProps;
    currentSelectedEventId = id;
    currentSelectedGameTitle = gameObj.title;
    
    let sameGames = localEvents.filter(e => e.title.toLowerCase() === gameObj.title.toLowerCase());
    let totalAggTime = sameGames.reduce((acc, curr) => acc + curr.extendedProps.time, 0);
    
    document.getElementById('modalInfoGrid').style.display = 'grid';
    document.getElementById('modalGameTitle').innerHTML = gameObj.title;
    document.getElementById('modalGameTimeZone').innerHTML = `<span id="modalGameTime">${gameObj.time.toFixed(1)}</span> 시간 (전체 누적합: ${totalAggTime.toFixed(1)}h)`;
    document.getElementById('modalGameStartZone').innerHTML = `<span id="modalGameStart">${gameObj.startDate}</span>`;
    document.getElementById('modalGameEndZone').innerHTML = `<span id="modalGameEnd">${gameObj.endDate ? gameObj.endDate : '진행 중'}</span>`;
    document.getElementById('modalGameTrophyZone').innerHTML = `<span id="modalGameTrophy">${gameObj.isEnding && gameObj.isEnding !== 'x' ? '🏆 엔딩 완료' : '진행 중'}</span>`;
    document.getElementById('modalGamePlatformZone').innerHTML = `<span id="modalGamePlatform">${gameObj.platform}</span>`;
    
    let commonReview = "";
    let foundReviewNode = sameGames.find(e => e.extendedProps.review && e.extendedProps.review.trim() !== "");
    if(foundReviewNode) commonReview = foundReviewNode.extendedProps.review;
    
    let reviewBox = document.getElementById('modalGameReviewBox');
    reviewBox.innerText = commonReview ? commonReview : "";
    reviewBox.contentEditable = "true";
    reviewBox.onblur = function() {
        let updatedReviewText = this.innerText.trim();
        localEvents.forEach(evt => {
            if(evt.title.toLowerCase() === currentSelectedGameTitle.toLowerCase()) { evt.extendedProps.review = updatedReviewText; }
        });
        saveToLocalStorage();
    };

    rebuildTimelineUI(sameGames);
    
    document.getElementById('quickMemoZone').style.display = 'block';
    document.getElementById('btnEdit').style.display = 'inline-block';
    document.getElementById('btnDelete').style.display = 'inline-block';
    document.getElementById('btnSave').style.display = 'none';
    document.getElementById('gameModal').style.display = "flex";
}

function openDetailModalByTitle(title) {
    let sameGames = localEvents.filter(e => e.title.toLowerCase() === title.toLowerCase());
    if(sameGames.length === 0) return;
    sameGames.sort((a,b) => new Date(a.extendedProps.startDate) - new Date(b.extendedProps.startDate));
    let latestEvent = sameGames[sameGames.length - 1];
    openDetailModalById(latestEvent.id);
}

function rebuildTimelineUI(gamesArray) {
    let timelineContainer = document.getElementById('modalGameMemoTimeline');
    timelineContainer.innerHTML = '';
    let allStructuredMemos = [];

    gamesArray.forEach(g => {
        let p = g.extendedProps;
        if(p.memo && p.memo.trim() !== '') {
            if(p.memo.startsWith('[{') && p.memo.endsWith('}]')) {
                try { let parsedArr = JSON.parse(p.memo); allStructuredMemos.push(...parsedArr); } catch(e) { allStructuredMemos.push({ date: p.startDate, text: p.memo }); }
            } else {
                let lines = p.memo.split('\n');
                lines.forEach(line => {
                    if(!line.trim()) return;
                    let match = line.match(/^\[(.*?)\]\s*(.*)$/);
                    if(match) { allStructuredMemos.push({ date: match[1], text: match[2] }); } else { allStructuredMemos.push({ date: p.startDate, text: line }); }
                });
            }
        }
    });

    allStructuredMemos.sort((a,b) => new Date(a.date.split('~')[0].trim()) - new Date(b.date.split('~')[0].trim()));

    let validMemoCount = 0;
    allStructuredMemos.forEach(m => {
        validMemoCount++;
        let item = document.createElement('div'); item.className = 'timeline-item';
        item.innerHTML = `<div class="timeline-date">📅 기록 기간: ${m.date}</div><div class="timeline-text">${m.text}</div>`;
        timelineContainer.appendChild(item);
    });

    if(validMemoCount === 0) { timelineContainer.innerHTML = '<div style="color:#9ca3af; padding:5px; font-size:0.9em;">아직 연동되어 쌓인 세션 메모 기록이 없습니다.</div>'; }
}

function submitInstantMemo() {
    let memoText = document.getElementById('modalInstantMemoInput').value.trim();
    let dateInput = document.getElementById('modalMemoDateInput').value.trim();
    if(!memoText) { alert("내용을 타이핑해 주세요!"); return; }

    let targetStartDate = ''; let activeRecord = localEvents.find(e => e.id === currentSelectedEventId);

    if(!dateInput) {
        if(activeRecord) { let p = activeRecord.extendedProps; targetStartDate = p.startDate + (p.endDate ? ` ~ ${p.endDate}` : ''); }
        else { targetStartDate = new Date().toISOString().split('T')[0]; }
    } else { targetStartDate = dateInput; }

    if(activeRecord) {
        let currentMemoArr = []; let oldMemo = activeRecord.extendedProps.memo ? activeRecord.extendedProps.memo.trim() : '';
        if(oldMemo.startsWith('[{') && oldMemo.endsWith('}]')) { try { currentMemoArr = JSON.parse(oldMemo); } catch(e){} }
        else if(oldMemo !== '') {
            let lines = oldMemo.split('\n');
            lines.forEach(line => {
                if(!line.trim()) return;
                let match = line.match(/^\[(.*?)\]\s*(.*)$/);
                if(match) currentMemoArr.push({ date: match[1], text: match[2] });
                else currentMemoArr.push({ date: activeRecord.extendedProps.startDate, text: line });
            });
        }
        currentMemoArr.push({ date: targetStartDate, text: memoText });
        activeRecord.extendedProps.memo = JSON.stringify(currentMemoArr);
        alert("한줄평 메모가 결합되었습니다!");
    }
    refreshUI();
    saveToLocalStorage();
    rebuildTimelineUI(localEvents.filter(e => e.title.toLowerCase() === currentSelectedGameTitle.toLowerCase()));
}

function enableEditMode() {
    let target = localEvents.find(e => e.id === currentSelectedEventId); let gameObj = target.extendedProps;
    document.getElementById('quickMemoZone').style.display = 'none';
    document.getElementById('modalGameTitle').innerHTML = `<input type="text" id="editTitle" class="edit-input" value="${gameObj.title}">`;
    document.getElementById('modalGameTimeZone').innerHTML = `<input type="number" step="0.1" id="editTime" class="edit-input" value="${gameObj.time}"> 시간`;
    document.getElementById('modalGameStartZone').innerHTML = `<input type="text" id="editStart" class="edit-input" value="${gameObj.startDate}">`;
    document.getElementById('modalGameEndZone').innerHTML = `<input type="text" id="editEnd" class="edit-input" value="${gameObj.endDate}">`;
    
    document.getElementById('modalGameTrophyZone').innerHTML = `
        <select id="editEnding" class="edit-input">
            <option value="x" ${gameObj.isEnding === 'x'?'selected':''}>진행 중 (x)</option>
            <option value="o" ${gameObj.isEnding === 'o'?'selected':''}>엔딩 완료 (o)</option>
        </select>`;
        
    document.getElementById('modalGamePlatformZone').innerHTML = `
        <select id="editPlatform" class="edit-input">
            <option value="steam" ${gameObj.platform === 'steam'?'selected':''}>steam</option>
            <option value="xbox gamepass" ${gameObj.platform === 'xbox gamepass'?'selected':''}>xbox gamepass</option>
            <option value="Switch" ${gameObj.platform === 'Switch'?'selected':''}>Switch</option>
            <option value="Switch2" ${gameObj.platform === 'Switch2'?'selected':''}>Switch2</option>
            <option value="ps4" ${gameObj.platform === 'ps4'?'selected':''}>ps4</option>
            <option value="ps5" ${gameObj.platform === 'ps5'?'selected':''}>ps5</option>
            <option value="stove" ${gameObj.platform === 'stove'?'selected':''}>stove</option>
            <option value="epic" ${gameObj.platform === 'epic'?'selected':''}>epic</option>
            <option value="mobile" ${gameObj.platform === 'mobile'?'selected':''}>mobile</option>
            <option value="DLC" ${gameObj.platform === 'DLC'?'selected':''}>DLC</option>
            <option value="기타" ${gameObj.platform === '기타'?'selected':''}>기타</option>
        </select>`;

    let rawTextForEdit = gameObj.memo || '';
    if(rawTextForEdit.startsWith('[{') && rawTextForEdit.endsWith('}]')) { try { let arr = JSON.parse(rawTextForEdit); rawTextForEdit = arr.map(m => `[${m.date}] ${m.text}`).join('\n'); } catch(e){} }
    document.getElementById('modalGameMemoTimeline').innerHTML = `<textarea id="editMemo" class="edit-input" style="height:60px; resize:none;">${rawTextForEdit}</textarea>`;
    document.getElementById('btnEdit').style.display = 'none'; document.getElementById('btnSave').style.display = 'inline-block';
}

function saveEditedData() {
    let target = localEvents.find(e => e.id === currentSelectedEventId); if(!target) return;
    let newTitle = document.getElementById('editTitle').value.trim(); let newTime = parseFloat(document.getElementById('editTime').value || 0);
    let newStart = SmartDateFormatter(document.getElementById('editStart').value); let newEnd = SmartDateFormatter(document.getElementById('editEnd').value);

    target.title = newTitle; target.start = newStart;
    let calcEnd = new Date(newEnd ? newEnd : newStart); calcEnd.setDate(calcEnd.getDate() + 1);
    target.end = calcEnd.toISOString().split('T')[0];

    target.extendedProps.title = newTitle; target.extendedProps.time = newTime; target.extendedProps.startDate = newStart;
    target.extendedProps.endDate = newEnd ? newEnd : ''; target.extendedProps.rawEndDate = newEnd ? newEnd : newStart;
    target.extendedProps.isEnding = document.getElementById('editEnding').value; target.extendedProps.platform = document.getElementById('editPlatform').value;
    
    let lines = document.getElementById('editMemo').value.trim().split('\n'); let recompiledArr = [];
    lines.forEach(line => {
        if(!line.trim()) return; let match = line.match(/^\[(.*?)\]\s*(.*)$/);
        if(match) recompiledArr.push({ date: match[1], text: match[2] }); else recompiledArr.push({ date: newStart, text: line });
    });
    target.extendedProps.memo = JSON.stringify(recompiledArr);
    
    saveToLocalStorage();
    alert("저장되었습니다."); 
    closeGameModal();
}

function deleteCurrentGame() { 
    if(confirm("삭제하시겠습니까?")) { 
        localEvents = localEvents.filter(e => e.id !== currentSelectedEventId); 
        saveToLocalStorage();
        closeGameModal(); 
    } 
}
function closeGameModal() { document.getElementById('gameModal').style.display = "none"; if(currentSelectedGameTitle) { refreshUI(); } }

// ==========================================
// 📅 10. 독립 가동 생명주기 및 이벤트 매핑 리스너
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    var calendarEl = document.getElementById('calendar');
    var modal = document.getElementById('gameModal');
    
    let savedUrl = localStorage.getItem('saved_game_sheet_url');
    if(savedUrl) { document.getElementById('spreadsheetUrlInput').value = savedUrl; }

    let savedWebAppUrl = localStorage.getItem('user_local_web_app_url');
    if(savedWebAppUrl) { document.getElementById('webAppUrlInput').value = savedWebAppUrl; }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'ko',
        events: function(fetchInfo, successCallback, failureCallback) { successCallback(localEvents); },
        eventContent: function(arg) {
            let isEnd = arg.event.extendedProps.isEnding && arg.event.extendedProps.isEnding !== 'x';
            let customEl = document.createElement('div'); customEl.className = 'game-bar'; customEl.style.backgroundColor = arg.event.backgroundColor;
            let textSpan = document.createElement('span'); textSpan.className = 'game-bar-text'; textSpan.innerText = `${arg.event.title} (${arg.event.extendedProps.time}h)`;
            customEl.appendChild(textSpan);
            if (isEnd) { let trophySpan = document.createElement('span'); trophySpan.className = 'game-bar-trophy'; trophySpan.innerText = '🏆'; customEl.appendChild(trophySpan); }
            return { domNodes: [customEl] };
        },
        eventClick: function(info) { openDetailModalById(info.event.id); }
    });
    calendar.render();

    let cachedEvents = localStorage.getItem('cached_game_events');
    if (cachedEvents) {
        try {
            localEvents = JSON.parse(cachedEvents);
            refreshUI();
        } catch(e) {
            if(savedUrl) { forceFetchSpreadsheetData(); }
        }
    } else if(savedUrl) {
        forceFetchSpreadsheetData();
    }

    document.getElementById('searchTitleInput').addEventListener('input', executeLiveGameSearch);
    document.getElementById('searchDateInput').addEventListener('input', executeLiveGameSearch);
    document.getElementById('gameForm').addEventListener('submit', handleGameSubmit);

    window.addEventListener('click', (e) => { 
        if (e.target == modal) { closeGameModal(); }
        if (e.target.id !== 'gameName') { document.getElementById('autocompleteList').style.display = 'none'; }
    });
});
// ==========================================
// 🎮 스팀 연동 계정 로컬 안전 보관 기능
// ==========================================
function saveSteamCredentials() {
    const keyVal = document.getElementById('steamApiKeyInput').value.trim();
    const idVal = document.getElementById('steamIdInput').value.trim();

    if (!keyVal || !idVal) {
        alert("API 키와 SteamID64를 모두 입력해 주세요.");
        return;
    }

    localStorage.setItem('user_steam_api_key', keyVal);
    localStorage.setItem('user_steam_id', idVal);
    alert("스팀 연동 정보가 브라우저에 안전하게 저장되었습니다! 🔒");
}

// 기존 DOMContentLoaded 이벤트 내부 또는 하단에 배치
window.addEventListener('DOMContentLoaded', function() {
    const savedSteamKey = localStorage.getItem('user_steam_api_key');
    const savedSteamId = localStorage.getItem('user_steam_id');

    if (savedSteamKey && document.getElementById('steamApiKeyInput')) {
        document.getElementById('steamApiKeyInput').value = savedSteamKey;
    }
    if (savedSteamId && document.getElementById('steamIdInput')) {
        document.getElementById('steamIdInput').value = savedSteamId;
    }
});