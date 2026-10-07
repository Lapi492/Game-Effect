// ==========================================
// 🎮 STEAM MODULE: 스팀 인증 및 플레이타임 동기화
// ==========================================

const MIN_STEAM_SYNC_PLAYTIME_MINUTES = 20;

function shouldSyncSteamGame(game) {
    return Number(game?.playtime_forever) > MIN_STEAM_SYNC_PLAYTIME_MINUTES;
}

// 1. 스팀 인증 정보 로컬 브라우저 보관
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

function getSteamCredentials() {
    return {
        apiKey: localStorage.getItem('user_steam_api_key') || '',
        steamId: localStorage.getItem('user_steam_id') || ''
    };
}

function extractSteamAppId(value) {
    const text = String(value || '').trim();
    const storeUrlMatch = text.match(/store\.steampowered\.com\/app\/(\d+)/i);
    if (storeUrlMatch) return storeUrlMatch[1];
    return /^\d+$/.test(text) ? text : '';
}

function linkCurrentGameToSteam() {
    const selected = localEvents.find(event => event.id === currentSelectedEventId);
    if (!selected) return;

    const previousId = selected.extendedProps.steamAppId || '';
    const entered = prompt(
        'Steam 상점 주소 또는 AppID 숫자를 붙여 넣어 주세요.\n예: https://store.steampowered.com/app/1086940/',
        previousId
    );
    if (entered === null) return;

    const steamAppId = extractSteamAppId(entered);
    if (!steamAppId) {
        alert('Steam 상점 주소 또는 숫자로 된 AppID를 확인해 주세요.');
        return;
    }

    const titleKey = selected.title.toLocaleLowerCase();
    const sameTitleRecords = localEvents.filter(event => event.title && event.title.toLocaleLowerCase() === titleKey);
    sameTitleRecords.forEach(event => { event.extendedProps.steamAppId = steamAppId; });
    saveSteamTitleLink(selected.title, steamAppId);
    saveToLocalStorage();
    document.getElementById('modalSteamLinkZone').innerText = `연결됨 (AppID: ${steamAppId})`;
    alert(`'${selected.title}' 기록 ${sameTitleRecords.length}개를 Steam 게임과 연결했습니다. 이제 제목이 달라도 같은 게임으로 동기화합니다.`);
}

function normalizeSteamTitle(title) {
    return String(title || '')
        .toLocaleLowerCase()
        .normalize('NFKD')
        .replace(/[™®©]/g, '')
        .replace(/[\[\]{}()'"`~!@#$%^&*_+=|\\:;,.?\-/]/g, ' ')
        .replace(/\b(the|game|edition|deluxe|complete|ultimate)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function titleSimilarity(leftTitle, rightTitle) {
    const left = normalizeSteamTitle(leftTitle);
    const right = normalizeSteamTitle(rightTitle);
    if (!left || !right) return 0;
    if (left === right) return 1;

    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    if (shorter >= 5 && (left.includes(right) || right.includes(left))) return shorter / longer;

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row++) {
        let diagonal = previous[0];
        previous[0] = row;
        for (let column = 1; column <= right.length; column++) {
            const before = previous[column];
            previous[column] = Math.min(
                previous[column] + 1,
                previous[column - 1] + 1,
                diagonal + (left[row - 1] === right[column - 1] ? 0 : 1)
            );
            diagonal = before;
        }
    }
    return 1 - previous[right.length] / longer;
}

function loadSteamOwnedGames() {
    const creds = getSteamCredentials();
    const webAppUrl = localStorage.getItem('user_local_web_app_url');
    if (!creds.apiKey || !creds.steamId) return Promise.reject(new Error('Steam API 키와 SteamID64를 먼저 저장해 주세요.'));
    if (!webAppUrl) return Promise.reject(new Error('기록 저장하기에 구글 웹 앱 주소를 먼저 저장해 주세요.'));

    return new Promise((resolve, reject) => {
        const callbackName = `handleSteamLibrary_${Date.now()}`;
        const cleanup = () => {
            document.getElementById(callbackName)?.remove();
            delete window[callbackName];
        };
        window[callbackName] = parsed => {
            cleanup();
            if (!parsed || parsed.error) reject(new Error(parsed?.error || 'Steam 게임 목록을 불러오지 못했습니다.'));
            else resolve(parsed.response?.games || []);
        };
        const script = document.createElement('script');
        script.id = callbackName;
        script.src = `${webAppUrl}?action=steamOwnedGames&key=${encodeURIComponent(creds.apiKey)}&steamid=${encodeURIComponent(creds.steamId)}&callback=${callbackName}`;
        script.onerror = () => { cleanup(); reject(new Error('구글 웹 앱 통신 중 오류가 발생했습니다.')); };
        document.body.appendChild(script);
    });
}

async function bulkLinkSteamGames() {
    const button = document.getElementById('bulkSteamLinkButton');
    const steamRecords = localEvents.filter(event => String(event.extendedProps.platform || '').toLocaleLowerCase() === 'steam');
    const unlinkedTitles = [...new Set(steamRecords
        .filter(event => !event.extendedProps.steamAppId)
        .map(event => event.title)
        .filter(Boolean))];

    if (unlinkedTitles.length === 0) {
        alert('연결할 Steam 기록이 없습니다. 이미 모두 연결되어 있거나 플랫폼이 Steam이 아닙니다.');
        return;
    }
    if (!confirm(`연결되지 않은 Steam 게임 ${unlinkedTitles.length}개를 내 Steam 라이브러리와 비교합니다.\n이름이 정확히 같거나 매우 비슷한 게임만 자동 연결합니다. 계속할까요?`)) return;

    button.disabled = true;
    button.innerText = '⏳ Steam 게임 비교 중...';
    try {
        const ownedGames = await loadSteamOwnedGames();
        let linkedTitles = 0;
        let linkedRecords = 0;

        unlinkedTitles.forEach(title => {
            let best = null;
            let bestScore = -1;
            let nextBestScore = -1;
            ownedGames.forEach(game => {
                const score = titleSimilarity(title, game.name);
                if (score > bestScore) {
                    nextBestScore = bestScore;
                    bestScore = score;
                    best = { game, score };
                } else if (score > nextBestScore) {
                    nextBestScore = score;
                }
            });
            const clearlyBest = best && (best.score === 1 || (best.score >= 0.92 && best.score - nextBestScore >= 0.12));
            if (!clearlyBest) return;

            const steamAppId = String(best.game.appid || '');
            if (!steamAppId) return;
            localEvents.forEach(event => {
                if (event.title === title && !event.extendedProps.steamAppId) {
                    event.extendedProps.steamAppId = steamAppId;
                    linkedRecords++;
                }
            });
            saveSteamTitleLink(title, steamAppId);
            linkedTitles++;
        });

        saveToLocalStorage();
        refreshUI();
        const remaining = unlinkedTitles.length - linkedTitles;
        alert(`자동 연결 완료\n\n연결한 게임: ${linkedTitles}개 (${linkedRecords}개 기록)\n확인 필요: ${remaining}개\n\n확인 필요 게임은 상세 화면의 'Steam 게임 연결'에서 상점 주소를 붙여 넣어 연결할 수 있습니다.`);
    } catch (error) {
        alert(`자동 연결 실패: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerText = '🔗 Steam 기록 한꺼번에 연결';
    }
}

function findDuplicateSteamRecords() {
    const report = document.getElementById('duplicateSteamReport');
    const recordsByAppId = new Map();

    localEvents.forEach(event => {
        const game = event.extendedProps || {};
        const steamAppId = String(game.steamAppId || '').trim();
        const time = Number(game.time);
        if (!steamAppId || !Number.isFinite(time)) return;

        const records = recordsByAppId.get(steamAppId) || [];
        records.push({ eventId: event.id, game, time });
        recordsByAppId.set(steamAppId, records);
    });

    const duplicates = [];
    recordsByAppId.forEach((records, steamAppId) => {
        records.sort((first, second) => first.time - second.time);
        let group = null;
        records.forEach(record => {
            if (!group || record.time - group.minTime > 0.300001) {
                if (group && group.records.length > 1) duplicates.push(group);
                group = { steamAppId, minTime: record.time, maxTime: record.time, records: [record] };
            } else {
                group.maxTime = record.time;
                group.records.push(record);
            }
        });
        if (group && group.records.length > 1) duplicates.push(group);
    });
    report.innerHTML = '';
    report.classList.add('is-visible');

    const title = document.createElement('div');
    title.className = 'duplicate-steam-report-title';
    title.innerText = duplicates.length
        ? `같은 Steam AppID와 플레이 시간 차이 0.3시간 이내인 묶음: ${duplicates.length}개`
        : '같은 Steam AppID와 플레이 시간 차이 0.3시간 이내인 기록을 찾지 못했습니다.';
    report.appendChild(title);

    duplicates.forEach(group => {
        const item = document.createElement('div');
        item.className = 'duplicate-steam-report-item';
        const summary = document.createElement('div');
        const timeText = group.minTime === group.maxTime
            ? `${group.minTime.toFixed(1)}시간`
            : `${group.minTime.toFixed(1)}~${group.maxTime.toFixed(1)}시간`;
        summary.innerText = `AppID ${group.steamAppId} · ${timeText} · ${group.records.length}개 기록`;
        item.appendChild(summary);
        group.records.forEach(record => {
            const row = document.createElement('div');
            row.className = 'duplicate-steam-report-record';
            const label = document.createElement('span');
            label.innerText = `${record.game.title} · ${record.game.startDate || '날짜 없음'}`;
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'duplicate-steam-delete-btn';
            removeButton.innerText = '이 기록 지우기';
            removeButton.addEventListener('click', () => deleteSteamDuplicateRecord(record.eventId));
            row.append(label, removeButton);
            item.appendChild(row);
        });
        report.appendChild(item);
    });
}

function deleteSteamDuplicateRecord(eventId) {
    const target = localEvents.find(event => event.id === eventId);
    if (!target) return;
    const game = target.extendedProps;
    if (!confirm(`'${game.title}' 기록 (${game.startDate}, ${game.time}시간)을 지울까요?\n이 작업은 이 기기 기록에서만 삭제됩니다.`)) return;

    localEvents = localEvents.filter(event => event.id !== eventId);
    saveToLocalStorage();
    refreshUI();
    findDuplicateSteamRecords();
}

// 2. 계산기 입력 시 스팀 총 플레이타임 자동 조회
async function autoFillPrevTime(gameNameInput) {
    let trimmed = gameNameInput.trim().toLowerCase();
    if (!trimmed) { 
        document.getElementById('calcPrevTime').value = ''; 
        return; 
    }
    
    // 기존 누적 시간 계산
    let sameGames = localEvents.filter(e => e.title && e.title.toLowerCase() === trimmed);
    let currentTotal = sameGames.reduce((acc, curr) => acc + curr.extendedProps.time, 0);
    document.getElementById('calcPrevTime').value = currentTotal > 0 ? currentTotal.toFixed(1) : '0';

    // 스팀 계정에서 최신 시간 실시간 자동 바인딩
    const steamCreds = getSteamCredentials();
    if (steamCreds.apiKey && steamCreds.steamId) {
        try {
            const targetSteamUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${steamCreds.apiKey}&steamid=${steamCreds.steamId}&include_appinfo=1&format=json`;
            const proxyUrls = [
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetSteamUrl)}`,
                `https://corsproxy.io/?${encodeURIComponent(targetSteamUrl)}`
            ];

            let parsed = null;
            for (const proxy of proxyUrls) {
                try {
                    const res = await fetch(proxy);
                    if (res.ok) {
                        parsed = await res.json();
                        if (parsed && (parsed.response || parsed.contents)) break;
                    }
                } catch(e) {}
            }

            if (parsed && parsed.contents) parsed = JSON.parse(parsed.contents);

            if (parsed && parsed.response && parsed.response.games) {
                const foundGame = parsed.response.games.find(g => g.name.toLowerCase() === trimmed);
                if (foundGame) {
                    const steamHours = (foundGame.playtime_forever / 60).toFixed(1);
                    document.getElementById('calcCurrTime').value = steamHours;
                    calculateTimeDifference();
                }
            }
        } catch (e) {
            console.warn("스팀 플레이타임 자동 조회 생략:", e);
        }
    }
}

function calculateTimeDifference() {
    let prev = parseFloat(document.getElementById('calcPrevTime').value || 0);
    let curr = parseFloat(document.getElementById('calcCurrTime').value || 0);
    if (curr <= prev) {
        document.getElementById('calcResultBox').innerHTML = `<span style="color:#ef4444; font-weight:bold;">⚠️ 알림: 현재 총 시간(${curr}h)이 이전 누적 시간(${prev}h)보다 커야 새 플레이 시간이 계산됩니다.</span>`;
        return;
    }
    let diff = (curr - prev).toFixed(1);
    document.getElementById('gameTime').value = diff; 
    document.getElementById('calcResultBox').innerHTML = `📈 계산 완료: 이전 기록 대비 <span style="color:#10b981; font-weight:bold; font-size:1.1em;">+${diff}</span> 시간 증가 자동 반영 완료!`;
}


// 3. 원클릭 스팀 최근 플레이 실시간 동기화 (구글 백엔드 JSONP 연동 - CORS 회피)
function syncRecentSteamPlaytime() {
    const creds = getSteamCredentials();
    if (!creds.apiKey || !creds.steamId) {
        alert("먼저 스팀 API 키와 SteamID64를 입력하고 저장해 주세요!");
        return;
    }

    const webAppUrl = localStorage.getItem('user_local_web_app_url');
    if (!webAppUrl) {
        alert("2번 '양방향 저장 연동'에 구글 웹 앱 URL 주소를 먼저 저장해 주세요!\n구글 서버를 통해 스팀 데이터를 안전하게 불러옵니다.");
        return;
    }

    const syncBtns = document.querySelectorAll('button[onclick*="syncRecentSteamPlaytime"]');
    syncBtns.forEach(b => { b.disabled = true; b.innerText = "⏳ 스팀 통신 중..."; });

    // 고유 콜백 함수 이름 생성
    const callbackName = "handleSteamResponse_" + Date.now();
    
    // 응답 수신 핸들러 등록
    window[callbackName] = function(parsed) {
        // 임시 스크립트 태그 및 콜백 함수 정리
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
        delete window[callbackName];
        syncBtns.forEach(b => { b.disabled = false; b.innerText = "🔄 최근 플레이 동기화"; });

        if (!parsed || parsed.error) {
            alert("스팀 연동 실패: " + (parsed?.error || "데이터를 불러오지 못했습니다."));
            return;
        }

        const games = parsed.response?.games || [];
        if (games.length === 0) {
            alert("스팀 라이브러리 데이터를 가져오지 못했습니다. 프로필 공개 설정 및 스팀 키를 확인해 주세요.");
            return;
        }

        let updatedCount = 0;
        let skippedShortPlaytimeCount = 0;
        const todayStr = new Date().toISOString().split('T')[0];

        for (const game of games) {
            if (!shouldSyncSteamGame(game)) {
                skippedShortPlaytimeCount++;
                continue;
            }

            const name = game.name;
            const steamAppId = String(game.appid || '');
            const currentTotalSteamHours = parseFloat((game.playtime_forever / 60).toFixed(1));

            // Steam 동기화는 제목이 아니라 Steam AppID가 같은 기록만 합산합니다.
            const appIdRecords = steamAppId
                ? localEvents.filter(e => String(e.extendedProps.steamAppId || '') === steamAppId)
                : [];
            const existingRecords = appIdRecords;
            const recordedTotalHours = existingRecords.reduce((sum, e) => sum + e.extendedProps.time, 0);
            const diffHours = parseFloat((currentTotalSteamHours - recordedTotalHours).toFixed(1));

            if (diffHours > 0) {
                let shouldMerge = false;
                if (existingRecords.length > 0) {
                    shouldMerge = confirm(
                        `🎮 [${name}]의 새로운 플레이타임(+${diffHours}시간)이 감지되었습니다!\n\n` +
                        `[확인]: 기존 플레이 바에 이어서 기간을 연장하고 합산합니다. (연속 바)\n` +
                        `[취소]: 오늘 날짜(${todayStr}) 기준으로 새로운 개별 바로 등록합니다.`
                    );
                }

                if (shouldMerge && existingRecords.length > 0) {
                    // 1. 기존 가장 최신 기록 기간 연장 및 누적 합산
                    existingRecords.sort((a, b) => new Date(a.extendedProps.startDate) - new Date(b.extendedProps.startDate));
                    const latestRecord = existingRecords[existingRecords.length - 1];

                    latestRecord.extendedProps.time = parseFloat((latestRecord.extendedProps.time + diffHours).toFixed(1));
                    latestRecord.extendedProps.endDate = todayStr;
                    latestRecord.extendedProps.rawEndDate = todayStr;
                    latestRecord.extendedProps.steamAppId = steamAppId;

                    const nextDay = new Date(todayStr);
                    nextDay.setDate(nextDay.getDate() + 1);
                    latestRecord.end = nextDay.toISOString().split('T')[0];

                    sendDataToGoogleSheet(latestRecord.extendedProps);
                } else {
                    // 2. 새 개별 블록으로 생성
                    const newGame = createGameObj(name, todayStr, todayStr, 'steam', diffHours, 'x', '스팀 동기화 세션', '', false, steamAppId);
                    localEvents.push(newGame);
                    sendDataToGoogleSheet(newGame.extendedProps);
                }
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            refreshUI();
            saveToLocalStorage();
            const skippedMessage = skippedShortPlaytimeCount > 0 ? `\n(총 플레이 20분 이하 게임 ${skippedShortPlaytimeCount}개 제외)` : '';
            alert(`🎉 총 ${updatedCount}개 스팀 게임의 플레이 기록이 동기화되었습니다!${skippedMessage}`);
        } else {
            const skippedMessage = skippedShortPlaytimeCount > 0 ? `\n(총 플레이 20분 이하 게임 ${skippedShortPlaytimeCount}개 제외)` : '';
            alert(`이미 모든 스팀 게임의 최신 플레이타임이 반영되어 있습니다! (새로 늘어난 시간 없음)${skippedMessage}`);
        }
    };

    // fetch 대신 <script> 태그를 동적으로 생성하여 주입 (CORS 차단 우회)
    const requestUrl = `${webAppUrl}?action=steamOwnedGames&key=${encodeURIComponent(creds.apiKey)}&steamid=${encodeURIComponent(creds.steamId)}&callback=${callbackName}`;
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = requestUrl;
    script.onerror = function() {
        syncBtns.forEach(b => { b.disabled = false; b.innerText = "🔄 최근 플레이 동기화"; });
        alert("구글 웹 앱 통신 중 오류가 발생했습니다. 웹 앱 배포 URL 및 권한 설정을 확인해 주세요.");
    };
    document.body.appendChild(script);
}
