// ==========================================
// 🎮 STEAM MODULE: 스팀 인증 및 플레이타임 동기화
// ==========================================

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

// 3. 원클릭 스팀 최근 플레이 실시간 동기화 (CORS 다중 프록시 자동 우회)
// 3. 원클릭 스팀 최근 플레이 실시간 동기화 (구글 백엔드 프록시 연동)
async function syncRecentSteamPlaytime() {
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

    try {
        // 구글 웹 앱을 프록시로 사용하여 스팀 API 직접 호출 (CORS 차단 완벽 우회)
        const requestUrl = `${webAppUrl}?action=steamOwnedGames&key=${encodeURIComponent(creds.apiKey)}&steamid=${encodeURIComponent(creds.steamId)}`;
        
        const res = await fetch(requestUrl);
        if (!res.ok) throw new Error("구글 웹 앱 통신 실패 (" + res.status + ")");
        
        const parsed = await res.json();
        const games = parsed?.response?.games || [];

        if (games.length === 0) {
            throw new Error("스팀 라이브러리 데이터를 가져오지 못했습니다. 프로필 공개 설정 및 스팀 키를 확인해 주세요.");
        }

        let updatedCount = 0;
        const todayStr = new Date().toISOString().split('T')[0];

        for (const game of games) {
            const name = game.name;
            const currentTotalSteamHours = parseFloat((game.playtime_forever / 60).toFixed(1));

            // 대시보드에 이미 기록된 누적 시간 확인
            const existingRecords = localEvents.filter(e => e.title && e.title.toLowerCase() === name.toLowerCase());
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
                    existingRecords.sort((a, b) => new Date(a.extendedProps.startDate) - new Date(b.extendedProps.startDate));
                    const latestRecord = existingRecords[existingRecords.length - 1];

                    latestRecord.extendedProps.time = parseFloat((latestRecord.extendedProps.time + diffHours).toFixed(1));
                    latestRecord.extendedProps.endDate = todayStr;
                    latestRecord.extendedProps.rawEndDate = todayStr;

                    const nextDay = new Date(todayStr);
                    nextDay.setDate(nextDay.getDate() + 1);
                    latestRecord.end = nextDay.toISOString().split('T')[0];

                    sendDataToGoogleSheet(latestRecord.extendedProps);
                } else {
                    const newGame = createGameObj(name, todayStr, todayStr, 'steam', diffHours, 'x', '스팀 동기화 세션');
                    localEvents.push(newGame);
                    sendDataToGoogleSheet(newGame.extendedProps);
                }
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            refreshUI();
            saveToLocalStorage();
            alert(`🎉 총 ${updatedCount}개 스팀 게임의 플레이 기록이 동기화되었습니다!`);
        } else {
            alert("이미 모든 스팀 게임의 최신 플레이타임이 반영되어 있습니다! (새로 늘어난 시간 없음)");
        }

    } catch (err) {
        console.error("스팀 동기화 오류:", err);
        alert(`스팀 연동 실패: ${err.message}`);
    } finally {
        syncBtns.forEach(b => { b.disabled = false; b.innerText = "🔄 최근 플레이 동기화"; });
    }
}