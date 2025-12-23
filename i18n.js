const translations = {
    ko: {
        title: "TweenForge",
        tab_drawing: "🖐️ 드로잉",
        tab_keyframe: "📍 키프레임 (곡선)",
        status_ready: "준비 완료",
        status_drawing: "🔴 녹화 중... (마우스를 떼면 완료)",
        status_done: "✅ 생성 완료!",
        status_play: "▶ 재생 중...",
        lbl_rotate: "회전 (Rotate)",
        lbl_scale: "크기 (Scale)",
        lbl_duration: "이동 시간 (ms)",
        lbl_easing: "가속도 (Easing)",
        lbl_unit: "출력 단위",
        btn_play: "▶ 재생 (Preview)",
        btn_reset: "↺ 초기화",
        msg_draw_guide: "빨간 공(A)을 잡고 움직여 경로를 그리세요.",
        msg_key_guide: "초록색 조절점을 당겨 곡선을 만드세요.",
        node_start: "A",
        node_end: "B"
    },
    en: {
        // 추후 번역 추가 예정. 최종 배포 전 업데이트 예정.
        title: "Animation Tool",
        // ... (나머지 키는 한국어 키와 동일하게 맞추면 됨)
    },
    ja: {
        // 추후 번역 추가 예정
        title: "アニメーション作成",
        // ...
    }
};

// 현재 선택된 언어 (기본값)
let currentLang = 'ko';

// 언어 변경 함수
function updateLanguage(lang) {
    currentLang = lang;
    const t = translations[lang] || translations['ko']; // 데이터 없으면 한국어로 폴백
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });

    // 특수 요소들 업데이트
if(startNode && !customImageURL) startNode.textContent = t.node_start || "A";
    if(endNode && !customImageURL) endNode.textContent = t.node_end || "B";
    if(previewNode && !customImageURL) previewNode.textContent = "👻";
    
    // 상태 메시지 갱신을 위해 window 객체에 이벤트 발송 (선택사항) 또는 전역 변수 활용
}