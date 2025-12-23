// --- 전역 변수 ---
let mode = 'drawing'; 
let usePercent = false;
let drawnFrames = []; 
let isRecording = false;
let recordStartTime = 0;

// [줌 관련 변수]
let stageZoom = 1.0; 
const MIN_ZOOM = 0.5; 
const MAX_ZOOM = 2.0; 
const ZOOM_STEP = 0.02;

// 캔버스 크기 및 중앙 정의
const STAGE_SIZE = 3000;
const CENTER_X = STAGE_SIZE / 2;
const CENTER_Y = STAGE_SIZE / 2;

const timelineSlider = document.getElementById('timeline-slider');
const timeDisplay = document.getElementById('time-display');
const btnPlayPause = document.getElementById('btn-play-pause');
const previewNode = document.getElementById('preview-node');

// [3단계 변경] 노드 좌표 배열 (기본: 시작점, 끝점)
let nodes = [
    { x: CENTER_X - 150, y: CENTER_Y }, // A (0번)
    { x: CENTER_X + 150, y: CENTER_Y }  // B (1번)
];
// (기존 controlPos, startPos, endPos 변수는 이제 nodes 배열로 대체됨)

let currentRotate = 0;
let currentScale = 1.0;
let isPlaying = false;
let animationId = null; // requestAnimationFrame ID
let currentProgress = 0; // 0.0 ~ 1.0

// DOM 요소 참조
const scrollContainer = document.getElementById('scroll-container');
const stageContent = document.getElementById('stage-content');
const startNode = document.getElementById('start-node');
const endNode = document.getElementById('end-node');
// const controlNode = ... (삭제됨)
const svgPath = document.getElementById('path-curve');
const guide1 = document.getElementById('guide1');
const guide2 = document.getElementById('guide2');
const codeArea = document.getElementById('code-area');
const btnUnit = document.getElementById('btn-unit');
const statusText = document.getElementById('status-text');
const zoomIndicator = document.getElementById('zoom-indicator');
const outputLang = document.getElementById('output-lang');
const panelDrawing = document.getElementById('panel-drawing');
const inputSmoothing = document.getElementById('input-smoothing');
const inputPrecision = document.getElementById('input-precision');
// --- 초기화 함수 (init) ---
function init() {
    updateLanguage('ko');
    setMode('drawing');
    
    // 1. 화면 스크롤을 캔버스 중앙으로 이동
    const containerW = scrollContainer.clientWidth;
    const containerH = scrollContainer.clientHeight;
    scrollContainer.scrollTop = CENTER_Y - (containerH / 2);
    scrollContainer.scrollLeft = CENTER_X - (containerW / 2);

    // 2. 줌 레벨 초기화
    stageZoom = 1.0; 
    applyZoom();

    // 3. 노드 초기화 및 렌더링
    renderNodes();
    updateVisuals();
}

const originalSetMode = setMode; 
setMode = function(newMode) {
    originalSetMode(newMode); 
    
    // 타임라인 초기화
    pause();
    timelineSlider.value = 0;
    previewNode.style.display = 'none';
    timeDisplay.textContent = "0ms / 0ms";
}

// --- 휠 이벤트 (줌 & 스크롤 보정 포함) ---
scrollContainer.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); 

        const oldZoom = stageZoom;
        let newZoom = stageZoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(newZoom.toFixed(2))));

        const scaleRatio = newZoom / oldZoom;
        const containerW = scrollContainer.clientWidth;
        const containerH = scrollContainer.clientHeight;

        const nextScrollLeft = (scrollContainer.scrollLeft + containerW / 2) * scaleRatio - containerW / 2;
        const nextScrollTop = (scrollContainer.scrollTop + containerH / 2) * scaleRatio - containerH / 2;

        stageZoom = newZoom;
        applyZoom();

        scrollContainer.scrollLeft = nextScrollLeft;
        scrollContainer.scrollTop = nextScrollTop;
    }
}, { passive: false });

// --- 줌 적용 함수 ---
function applyZoom() {
    stageContent.style.transform = `scale(${stageZoom})`;
    if (zoomIndicator) {
        zoomIndicator.textContent = Math.round(stageZoom * 100) + '%';
    }
}

// --- 모드 설정 ---
function setMode(newMode) {
    mode = newMode;
    const t = translations[currentLang] || translations['ko'];

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${newMode}`).classList.add('active');

    const panel = document.getElementById('panel-keyframe');
    const svgLayer = document.getElementById('svg-layer');

    if (mode === 'drawing') {
        statusText.textContent = t.msg_draw_guide;
        
        panel.classList.add('hidden');          
        panelDrawing.classList.remove('hidden');

        endNode.style.display = 'none';
        svgLayer.style.display = 'none';
        
        // [3단계] 드로잉 모드에선 생성된 중간 노드들도 숨김
        document.querySelectorAll('.dynamic-node').forEach(el => el.style.display = 'none');

    } else {
        statusText.textContent = t.msg_key_guide;

        panel.classList.remove('hidden');       
        panelDrawing.classList.add('hidden');   

        endNode.style.display = 'flex';
        svgLayer.style.display = 'block';
        
        // [3단계] 키프레임 모드에선 노드 보이기
        renderNodes();
        drawnFrames = []; 
    }
    generateCode();
}

// --- [3단계 신규] 노드 관리 및 렌더링 함수들 ---

// 1. 데이터(nodes)를 바탕으로 화면에 HTML 요소(동그라미)를 만듦
function renderNodes() {
    // 기존의 동적으로 만든 노드들 싹 지우기 (A, B는 살려둠)
    document.querySelectorAll('.dynamic-node').forEach(el => el.remove());

    // A(Start)와 B(End) 위치 업데이트
    if(nodes.length > 0) applyTransform(startNode, nodes[0]);
    if(nodes.length > 1) applyTransform(endNode, nodes[nodes.length - 1]);

    // 중간 점들 생성
    for (let i = 1; i < nodes.length - 1; i++) {
        const el = document.createElement('div');
        el.className = 'node dynamic-node';
        el.textContent = i; // 번호 표시
        el.style.backgroundColor = '#2ed573'; // 초록색
        el.style.borderColor = '#fff';
        // 이 점이 nodes 배열의 몇 번째인지 데이터 저장
        el.dataset.index = i; 
        
        stageContent.appendChild(el);
        applyTransform(el, nodes[i]);
    }
}

// 2. 점 추가 (+)
window.addNode = function() {
    if (nodes.length < 2) return;
    // 마지막 점(B) 바로 앞에, B와 그 이전 점의 중간 위치에 새 점 추가
    const prev = nodes[nodes.length - 2];
    const last = nodes[nodes.length - 1];
    
    const newNode = {
        x: (prev.x + last.x) / 2,
        y: (prev.y + last.y) / 2
    };
    
    // 배열의 끝에서 두 번째에 삽입 (B 앞)
    nodes.splice(nodes.length - 1, 0, newNode);
    renderNodes();
    updateVisuals();
    generateCode();
};

// 3. 점 삭제 (-)
window.removeNode = function() {
    if (nodes.length <= 2) {
        alert("최소 2개(시작과 끝)의 점은 필요합니다.");
        return;
    }
    // B 바로 앞의 점을 삭제
    nodes.splice(nodes.length - 2, 1);
    renderNodes();
    updateVisuals();
    generateCode();
};

// --- 시각적 업데이트 (스플라인 곡선 적용) ---
function updateVisuals() {
    if (nodes.length < 2) return;

    // 1. 노드 위치 업데이트
    applyTransform(startNode, nodes[0]);
    applyTransform(endNode, nodes[nodes.length - 1]);
    
    const dynamicNodes = document.querySelectorAll('.dynamic-node');
    dynamicNodes.forEach(el => {
        const idx = parseInt(el.dataset.index);
        if (nodes[idx]) applyTransform(el, nodes[idx]);
    });

    // 2. SVG 경로 그리기 (Catmull-Rom Spline)
    let d = `M ${nodes[0].x + 20} ${nodes[0].y + 20}`;
    
    // 경로 해상도
    const steps = 100; // 더 부드럽게 100등분
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const pos = getSplinePoint(t, nodes); 
        d += ` L ${pos.x + 20} ${pos.y + 20}`;
    }
    
    svgPath.setAttribute('d', d);
    
    // 가이드 라인은 복잡하므로 숨김 처리
    guide1.setAttribute('display', 'none');
    guide2.setAttribute('display', 'none');
}

function applyTransform(el, pos) {
    if (el.classList.contains('dynamic-node')) {
        el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    } else {
        el.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${currentRotate}deg) scale(${currentScale})`;
    }
}

function setLine(line, p1, p2) {
    line.setAttribute('x1', p1.x);
    line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x);
    line.setAttribute('y2', p2.y);
}

// --- 드래그 이벤트 ---
let dragTarget = null;
let dragOffset = { x: 0, y: 0 };

stageContent.addEventListener('mousedown', (e) => {
    // 브라우저 기본 드래그 동작 무시
    e.preventDefault(); 

    if (e.target.classList.contains('node')) {
        dragTarget = e.target;
        
        let currentPosVal = null;
        let dragIndex = -1; // 몇 번째 점인지 저장

        // 드래그 대상 식별
        if (dragTarget === startNode) {
            dragIndex = 0;
        } else if (dragTarget === endNode) {
            dragIndex = nodes.length - 1;
        } else if (dragTarget.classList.contains('dynamic-node')) {
            dragIndex = parseInt(dragTarget.dataset.index);
        }

        if (dragIndex !== -1) {
            currentPosVal = nodes[dragIndex];
            dragTarget.dataset.dragIndex = dragIndex; // dragTarget에 인덱스 기록
        } else {
            dragTarget = null;
            return;
        }

        const rect = stageContent.getBoundingClientRect();
        
        const mouseX = (e.clientX - rect.left) / stageZoom;
        const mouseY = (e.clientY - rect.top) / stageZoom;

        dragOffset.x = mouseX - currentPosVal.x;
        dragOffset.y = mouseY - currentPosVal.y;

        if (mode === 'drawing' && dragTarget === startNode) {
            isRecording = true;
            drawnFrames = [];
            recordStartTime = Date.now();
            const t = translations[currentLang] || translations['ko'];
            statusText.textContent = t.status_drawing;
            statusText.style.color = "#ff4757";
            recordFrame();
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (!dragTarget) return;

    const rect = stageContent.getBoundingClientRect();
    const newX = ((e.clientX - rect.left) / stageZoom) - dragOffset.x;
    const newY = ((e.clientY - rect.top) / stageZoom) - dragOffset.y;

    if (mode === 'keyframe') {
        // [3단계] 배열 업데이트
        const idx = parseInt(dragTarget.dataset.dragIndex);
        if (!isNaN(idx) && nodes[idx]) {
            nodes[idx].x = newX;
            nodes[idx].y = newY;
        }
    } else {
        // 드로잉 모드 (Start 노드만 이동)
        if (dragTarget === startNode) {
            nodes[0].x = newX;
            nodes[0].y = newY;
        }
    }

    if (mode === 'drawing' && isRecording) recordFrame();
    
    updateVisuals();
});

window.addEventListener('mouseup', () => {
    if (mode === 'drawing' && isRecording) {
        isRecording = false;
        const t = translations[currentLang] || translations['ko'];
        statusText.textContent = t.status_done;
        statusText.style.color = "#00d2ff";

        /* 슬라이더 값 적용 (손떨림 보정) */
        const smoothVal = parseInt(inputSmoothing.value) || 5; 
        drawnFrames = smoothPath(drawnFrames, smoothVal); 

        generateCode();
        updatePreview(0); 
    } else if (mode === 'keyframe' && dragTarget) {
        generateCode();
        updatePreview(0); 
    }
    dragTarget = null;
});

// --- [3단계 신규] Catmull-Rom Spline 알고리즘 ---
function getSplinePoint(t, points) {
    if (points.length < 2) return points[0];
    
    const sections = points.length - 1;
    let i = Math.floor(t * sections);
    let lt = (t * sections) - i;
    
    if (i >= sections) { i = sections - 1; lt = 1; }
    if (i < 0) { i = 0; lt = 0; }

    const P0 = points[i - 1] || points[i]; 
    const P1 = points[i];
    const P2 = points[i + 1];
    const P3 = points[i + 2] || P2; 

    return catmullRom(lt, P0, P1, P2, P3);
}
function catmullRom(t, p0, p1, p2, p3) {
    const t2 = t * t;
    const t3 = t2 * t;

    const v0 = (p2.x - p0.x) * 0.5;
    const v1 = (p3.x - p1.x) * 0.5;
    /* ▼▼▼ [누락된 u0, u1 정의를 여기에 추가해야 합니다] ▼▼▼ */
    const u0 = (p2.y - p0.y) * 0.5;
    const u1 = (p3.y - p1.y) * 0.5;
    /* ▲▲▲ ----------------------------------------- ▲▲▲ */

    const x = (2 * p1.x - 2 * p2.x + v0 + v1) * t3 + (-3 * p1.x + 3 * p2.x - 2 * v0 - v1) * t2 + v0 * t + p1.x;
    const y = (2 * p1.y - 2 * p2.y + u0 + u1) * t3 + (-3 * p1.y + 3 * p2.y - 2 * u0 - u1) * t2 + u0 * t + p1.y;

    return { x, y };
}
function recordFrame() {
    const t = Date.now() - recordStartTime;
    // 드로잉 중엔 nodes[0] (A)의 위치를 기록
    drawnFrames.push({ t, x: nodes[0].x, y: nodes[0].y, r: currentRotate, s: currentScale });
}

// ==========================================================
// [확장형 코드 생성기]
// ==========================================================

// [신규 헬퍼] 설정된 정밀도에 맞춰 숫자를 다듬어주는 함수
function formatNum(val) {
    const p = parseInt(inputPrecision.value) || 0;
    // toFixed로 자른 뒤 parseFloat를 하면 불필요한 '0'이 제거됨 (예: "10.50" -> 10.5)
    return parseFloat(Number(val).toFixed(p));
}

const formatters = {
    js: (frames, duration, ease) => {
        let code = `const element = document.querySelector('.target');\n`;
        code += `// JavaScript Web Animations API\n`;
        code += `const keyframes = [\n`;
        frames.forEach(f => {
            const { valX, valY, offsetStr } = convertValues(f, duration);
            // formatNum 적용
            code += `  { transform: 'translate(${valX}, ${valY}) rotate(${formatNum(f.r)}deg) scale(${formatNum(f.s)})', offset: ${offsetStr} },\n`;
        });
        code += `];\n\nelement.animate(keyframes, { duration: ${duration}, easing: '${ease}', fill: 'forwards' });`;
        return code;
    },

    css: (frames, duration, ease) => {
        let code = `/* CSS Keyframes */\n.target {\n  animation: myAnim ${duration}ms ${ease} forwards;\n}\n\n@keyframes myAnim {\n`;
        frames.forEach(f => {
            const { valX, valY, offsetVal } = convertValues(f, duration);
            const percent = (offsetVal * 100).toFixed(1) + '%';
            // formatNum 적용
            code += `  ${percent} { transform: translate(${valX}, ${valY}) rotate(${formatNum(f.r)}deg) scale(${formatNum(f.s)}); }\n`;
        });
        code += `}`;
        return code;
    },

    phaser: (frames, duration, ease) => {
        const easeMap = {
            'linear': 'Linear',
            'ease': 'Sine.easeInOut',
            'ease-in': 'Sine.easeIn',
            'ease-out': 'Sine.easeOut',
            'ease-in-out': 'Sine.easeInOut'
        };
        const phaserEase = easeMap[ease] || 'Linear';
        const frameDuration = Math.floor(duration / frames.length);
        
        let code = `// Phaser Tweens Config\n`;
        code += `// 사용법: this.scene.tweens.chain({ targets: ..., tweens: [ 아래 내용 ] });\n\n`;
        
        frames.forEach((f) => {
            let x = f.x - CENTER_X + 20;
            let y = f.y - CENTER_Y + 20;
            
            // Phaser는 보통 픽셀 단위이므로 정밀도 적용
            code += `  {\n`;
            code += `    x: ${formatNum(x)}, y: ${formatNum(y)}, angle: ${formatNum(f.r)}, scale: ${formatNum(f.s)},\n`;
            code += `    duration: ${frameDuration},\n`;
            code += `    ease: '${phaserEase}'\n`;
            code += `  },\n`;
        });
        return code;
    },

    unity: (frames, duration, ease) => {
        let code = `// Unity C# Coroutine\nIEnumerator MoveObject() {\n    float duration = ${duration / 1000}f;\n\n`;
        code += `    // Keyframes data (X, Y)\n`;
        code += `    Vector3[] path = new Vector3[] {\n`;
        frames.forEach(f => {
             let relativeX = f.x - CENTER_X + 20;
             let relativeY = -(f.y - CENTER_Y + 20);
             // Unity float 뒤에 f 붙이기
             code += `        new Vector3(${formatNum(relativeX)}f, ${formatNum(relativeY)}f, 0f),\n`;
        });
        code += `    };\n\n    // 로직 구현 필요\n}`;
        return code;
    },

    python: (frames, duration, ease) => {
        let code = `# Python List (X, Y, Angle)\npath_data = [\n`;
        frames.forEach(f => {
            let relativeX = f.x - CENTER_X + 20;
            let relativeY = f.y - CENTER_Y + 20; 
            code += `    {"x": ${formatNum(relativeX)}, "y": ${formatNum(relativeY)}, "angle": ${formatNum(f.r)}},\n`;
        });
        code += `]`;
        return code;
    },

    json: (frames) => JSON.stringify(frames, null, 2)
};

// --- 공통 값 변환 헬퍼 (소수점 정밀도 적용) ---
function convertValues(f, totalDuration) {
    let relativeX = f.x - CENTER_X + 20; 
    let relativeY = f.y - CENTER_Y + 20;

    let valX, valY;

    if (usePercent) {
        // 퍼센트일 때 소수점 적용
        valX = formatNum((relativeX / STAGE_SIZE) * 100) + '%';
        valY = formatNum((relativeY / STAGE_SIZE) * 100) + '%';
    } else {
        // 픽셀일 때 소수점 적용
        valX = formatNum(relativeX) + 'px';
        valY = formatNum(relativeY) + 'px';
    }
    
    let offsetVal = (mode === 'drawing') ? (f.t / totalDuration) : f.t; 
    if(isNaN(offsetVal)) offsetVal = 0;
    
    return { valX, valY, offsetVal, offsetStr: Number(offsetVal).toFixed(3) };
}



// --- 메인 코드 생성 함수 ---
function generateCode() {
    let framesToExport = [];
    let totalDuration = 0;
    let easeVal = 'linear';

    if (mode === 'drawing') {
        if (drawnFrames.length === 0) return;
        framesToExport = drawnFrames;
        totalDuration = drawnFrames[drawnFrames.length-1].t;
    } else {
        const samples = 30; 
        totalDuration = Number(document.getElementById('input-duration').value);
        easeVal = document.getElementById('input-easing').value;
        
        for (let i = 0; i <= samples; i++) {
            const t = i / samples; 
            // [3단계 수정] 베지에 대신 스플라인 사용
            const pos = getSplinePoint(t, nodes);
            framesToExport.push({
                t: t, x: pos.x, y: pos.y, r: currentRotate, s: currentScale
            });
        }
    }
    if (totalDuration === 0) totalDuration = 1; 

    const lang = outputLang.value;
    const formatter = formatters[lang] || formatters['js'];
    
    codeArea.textContent = formatter(framesToExport, totalDuration, easeVal);
}

// --- 상태 보간 (재생용) ---
function getInterpolatedState(progress) {
    if (mode === 'drawing') {
        if (drawnFrames.length === 0) return null;
        const totalDuration = drawnFrames[drawnFrames.length - 1].t;
        const targetTime = totalDuration * progress;
        
        const frame = drawnFrames.find(f => f.t >= targetTime) || drawnFrames[drawnFrames.length - 1];
        return { x: frame.x, y: frame.y, r: frame.r, s: frame.s };
    } 
    else {
        // [3단계 수정] 베지에 대신 스플라인 사용
        const pos = getSplinePoint(progress, nodes);
        return { x: pos.x, y: pos.y, r: currentRotate, s: currentScale };
    }
}

// --- 프리뷰 업데이트 ---
function updatePreview(progress) {
    const state = getInterpolatedState(progress);
    if (!state) return;

    previewNode.style.display = 'flex';
    previewNode.style.transform = `translate(${state.x}px, ${state.y}px) rotate(${state.r}deg) scale(${state.s})`;

    timelineSlider.value = progress * 100;
    
    let totalDuration = 0;
    if (mode === 'drawing' && drawnFrames.length > 0) totalDuration = drawnFrames[drawnFrames.length - 1].t;
    else if (mode === 'keyframe') totalDuration = Number(document.getElementById('input-duration').value);

    const currentTime = Math.round(totalDuration * progress);
    timeDisplay.textContent = `${currentTime}ms / ${totalDuration}ms`;
}

// --- 재생/일시정지 ---
function togglePlay() {
    if (isPlaying) {
        pause();
    } else {
        play();
    }
}

function play() {
    isPlaying = true;
    btnPlayPause.textContent = "⏸";
    
    let startTime = null;
    let startProgress = parseFloat(timelineSlider.value) / 100;
    
    if (startProgress >= 1.0) startProgress = 0;

    let duration = 0;
    if (mode === 'drawing') duration = (drawnFrames.length > 0) ? drawnFrames[drawnFrames.length - 1].t : 0;
    else duration = Number(document.getElementById('input-duration').value);

    if (duration === 0) duration = 1000;

    function loop(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        
        let progress = startProgress + (elapsed / duration);

        if (progress >= 1) {
            progress = 1;
            updatePreview(progress);
            pause(); 
            return;
        }

        updatePreview(progress);
        
        if (isPlaying) {
            animationId = requestAnimationFrame(loop);
        }
    }
    animationId = requestAnimationFrame(loop);
}

function pause() {
    isPlaying = false;
    btnPlayPause.textContent = "▶";
    if (animationId) cancelAnimationFrame(animationId);
}

// --- 이벤트 리스너들 ---

timelineSlider.addEventListener('input', (e) => {
    pause(); 
    const val = e.target.value / 100;
    updatePreview(val);
});

btnPlayPause.addEventListener('click', togglePlay);

document.getElementById('btn-play').addEventListener('click', () => {
    if (parseFloat(timelineSlider.value) >= 100) {
        timelineSlider.value = 0;
        updatePreview(0);
    }
    play();
});

if(outputLang) outputLang.addEventListener('change', generateCode);

document.getElementById('lang-select').addEventListener('change', (e) => {
    updateLanguage(e.target.value);
    setMode(mode);
});

document.getElementById('input-rotate').addEventListener('input', (e) => {
    currentRotate = e.target.value; updateVisuals(); 
    if(mode==='drawing'&&isRecording) recordFrame(); else generateCode();
});
document.getElementById('input-scale').addEventListener('input', (e) => {
    currentScale = e.target.value; updateVisuals(); 
    if(mode==='drawing'&&isRecording) recordFrame(); else generateCode();
});
document.getElementById('input-duration').addEventListener('change', generateCode);
document.getElementById('input-easing').addEventListener('change', generateCode);
/* ▼▼▼ [추가] 정밀도 변경 시 코드 재생성 ▼▼▼ */
inputPrecision.addEventListener('change', generateCode);
/* ▲▲▲ ---------------------------------- ▲▲▲ */
btnUnit.addEventListener('click', (e) => {
    usePercent = !usePercent;
    e.target.textContent = usePercent ? "Percent (%)" : "Pixels (PX)";
    generateCode();
});

document.getElementById('btn-reset').addEventListener('click', () => {
    init(); 
    drawnFrames = []; 
    codeArea.textContent = "// Reset";
});

// --- 하단 패널 컨트롤 ---
const btnCopy = document.getElementById('btn-copy-code');
const btnToggle = document.getElementById('btn-toggle-panel');
const bottomPanel = document.getElementById('bottom-panel');

btnCopy.addEventListener('click', () => {
    const codeText = codeArea.textContent;
    navigator.clipboard.writeText(codeText).then(() => {
        const originalText = btnCopy.textContent;
        btnCopy.textContent = "✅ Copied!";
        setTimeout(() => {
            btnCopy.textContent = originalText;
        }, 1500);
    }).catch(err => {
        alert("복사 실패: " + err);
    });
});

btnToggle.addEventListener('click', () => {
    bottomPanel.classList.toggle('collapsed');
    if (bottomPanel.classList.contains('collapsed')) {
        btnToggle.textContent = "▲";
    } else {
        btnToggle.textContent = "▼";
    }
});

/* 손떨림 보정 함수 (이동평균법) - 이전 단계에서 유지 */
function smoothPath(frames, windowSize = 5) {
    if (frames.length < windowSize) return frames;

    let smoothed = [];
    const len = frames.length;

    for (let i = 0; i < len; i++) {
        let sumX = 0, sumY = 0, sumR = 0, sumS = 0;
        let count = 0;

        for (let j = i - Math.floor(windowSize / 2); j <= i + Math.floor(windowSize / 2); j++) {
            if (j >= 0 && j < len) {
                sumX += frames[j].x;
                sumY += frames[j].y;
                sumR += Number(frames[j].r);
                sumS += Number(frames[j].s);
                count++;
            }
        }

        const avgX = sumX / count;
        const avgY = sumY / count;
        const avgR = sumR / count;
        const avgS = sumS / count;

        const distToEdge = Math.min(i, len - 1 - i);
        let smoothWeight = distToEdge / windowSize;
        if (smoothWeight > 1) smoothWeight = 1; 

        smoothed.push({
            t: frames[i].t,
            x: frames[i].x * (1 - smoothWeight) + avgX * smoothWeight,
            y: frames[i].y * (1 - smoothWeight) + avgY * smoothWeight,
            r: frames[i].r * (1 - smoothWeight) + avgR * smoothWeight,
            s: frames[i].s * (1 - smoothWeight) + avgS * smoothWeight
        });
    }
    return smoothed;
}

// 실행
init();