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

// [기존 변수들 아래에 추가]
const btnStop = document.getElementById('btn-stop');
const drawingPath = document.getElementById('drawing-path');

// [3단계 변경] 노드 좌표 배열 (기본: 시작점, 끝점)
let nodes = [
    { x: CENTER_X - 150, y: CENTER_Y }, // A (0번)
    { x: CENTER_X + 150, y: CENTER_Y }  // B (1번)
];

let currentRotate = 0;
let currentScale = 1.0;
let isPlaying = false;
let animationId = null; 
let currentProgress = 0; 

// DOM 요소 참조
const scrollContainer = document.getElementById('scroll-container');
const stageContent = document.getElementById('stage-content');
const startNode = document.getElementById('start-node');
const endNode = document.getElementById('end-node');
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
const inputImage = document.getElementById('input-image');
const btnRemoveImage = document.getElementById('btn-remove-image');

// [수정] 이미지 관련 변수 추가
let customImageURL = null; 
let customImageRatio = 1; // 이미지 가로/세로 비율 (기본 1:1)

/* 실행 취소 관련 변수 */
const MAX_HISTORY = 50; 
let historyStack = [];
let historyIndex = -1;

// --- 초기화 함수 (init) ---
function init() {
    updateLanguage('ko');
    setMode('drawing');
    
    const containerW = scrollContainer.clientWidth;
    const containerH = scrollContainer.clientHeight;
    scrollContainer.scrollTop = CENTER_Y - (containerH / 2);
    scrollContainer.scrollLeft = CENTER_X - (containerW / 2);

    stageZoom = 1.0; 
    applyZoom();

    renderNodes();
    updateVisuals();

    historyStack = [];
    historyIndex = -1;
    saveState(); 
}

const originalSetMode = setMode; 
setMode = function(newMode) {
    originalSetMode(newMode); 
    pause();
    timelineSlider.value = 0;
    previewNode.style.display = 'none';
    timeDisplay.textContent = "0ms / 0ms";
}

// --- 휠 이벤트 ---
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

function applyZoom() {
    stageContent.style.transform = `scale(${stageZoom})`;
    if (zoomIndicator) {
        zoomIndicator.textContent = Math.round(stageZoom * 100) + '%';
    }
}

function setMode(newMode) {
    mode = newMode;
    const t = translations[currentLang] || translations['ko'];

    // 탭 활성화 UI
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${newMode}`).classList.add('active');

    const panel = document.getElementById('panel-keyframe');
    const svgLayer = document.getElementById('svg-layer');

    // [핵심 1] SVG 레이어는 항상 켜둡니다 (드로잉 궤적도 보여야 하니까요)
    svgLayer.style.display = 'block';

    if (mode === 'drawing') {
        statusText.textContent = t.msg_draw_guide;
        
        // 패널 전환
        panel.classList.add('hidden');          
        panelDrawing.classList.remove('hidden');

        // 키프레임 요소 숨기기
        endNode.style.display = 'none';
        document.querySelectorAll('.dynamic-node').forEach(el => el.style.display = 'none');
        
        // 키프레임용 파란 곡선 숨기기
        svgPath.style.display = 'none';
        
        // 드로잉 궤적(노란 점선) 보이기 & 초기화
        if(drawingPath) {
            drawingPath.style.display = 'block';
            drawingPath.setAttribute('d', ''); 
        }

    } else {
        statusText.textContent = t.msg_key_guide;

        // 패널 전환
        panel.classList.remove('hidden');       
        panelDrawing.classList.add('hidden');   

        // 키프레임 요소 보이기
        endNode.style.display = 'flex';
        renderNodes(); // 중간 점들 다시 표시
        
        // 키프레임용 파란 곡선 보이기
        svgPath.style.display = 'block';
        
        // [핵심 2] 키프레임 모드에서는 드로잉 궤적을 확실히 숨기고 지움
        if(drawingPath) {
            drawingPath.style.display = 'none';
            drawingPath.setAttribute('d', ''); 
        }
        
        drawnFrames = []; 
    }

    // 타임라인 & 프리뷰 초기화 (공통)
    pause();
    timelineSlider.value = 0;
    previewNode.style.display = 'none';
    timeDisplay.textContent = "0ms / 0ms";
    
    generateCode();
}
// --- 노드 관리 및 렌더링 ---
function renderNodes() {
    document.querySelectorAll('.dynamic-node').forEach(el => el.remove());

    if(nodes.length > 0) applyTransform(startNode, nodes[0]);
    if(nodes.length > 1) applyTransform(endNode, nodes[nodes.length - 1]);

    for (let i = 1; i < nodes.length - 1; i++) {
        const el = document.createElement('div');
        el.className = 'node dynamic-node';
        el.textContent = i; 
        el.style.backgroundColor = '#2ed573'; 
        el.style.borderColor = '#fff';
        el.dataset.index = i; 
        
        // [수정] 중간 노드에도 이미지 스타일 적용
        if (customImageURL) {
            applyImageStyle(el);
        }

        stageContent.appendChild(el);
        applyTransform(el, nodes[i]);
    }
}

// [신규] 이미지 스타일 적용 헬퍼 함수
function applyImageStyle(el) {
    el.style.backgroundImage = `url(${customImageURL})`;
    
    // ▼▼▼ [핵심 수정] CSS ID 충돌 방지를 위해 인라인으로 강제 설정 ▼▼▼
    el.style.backgroundSize = "contain"; 
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    // ▲▲▲ ---------------------------------------------------- ▲▲▲

    el.textContent = ""; 
    el.style.border = "none";
    el.style.backgroundColor = "transparent";
    el.style.borderRadius = "4px"; 
    
    // 이미지 비율에 맞춰 크기 조절
    const baseSize = 80; 
    if (customImageRatio >= 1) {
        el.style.width = `${baseSize}px`;
        el.style.height = `${baseSize / customImageRatio}px`;
    } else {
        el.style.width = `${baseSize * customImageRatio}px`;
        el.style.height = `${baseSize}px`;
    }
}


// [신규] 노드 스타일 초기화 (이미지 삭제 시)
function resetNodeStyle(el) {
    el.style.backgroundImage = "none";
    el.style.border = "";
    el.style.backgroundColor = "";
    el.style.borderRadius = ""; // CSS 클래스(50%)로 복귀
    el.style.width = "";        // CSS 클래스(40px)로 복귀
    el.style.height = "";
    
    const t = translations[currentLang] || translations['ko'];
    if (el === startNode) el.textContent = t.node_start || "A";
    if (el === endNode) el.textContent = t.node_end || "B";
    if (el === previewNode) el.textContent = "👻";
}

window.addNode = function() {
    if (nodes.length < 2) return;
    const prev = nodes[nodes.length - 2];
    const last = nodes[nodes.length - 1];
    const newNode = { x: (prev.x + last.x) / 2, y: (prev.y + last.y) / 2 };
    nodes.splice(nodes.length - 1, 0, newNode);
    renderNodes();
    updateVisuals();
    generateCode();
    saveState(); 
};

window.removeNode = function() {
    if (nodes.length <= 2) {
        alert("최소 2개(시작과 끝)의 점은 필요합니다.");
        return;
    }
    nodes.splice(nodes.length - 2, 1);
    renderNodes();
    updateVisuals();
    generateCode();
    saveState(); 
};

function updateVisuals() {
    if (nodes.length < 2) return;
    applyTransform(startNode, nodes[0]);
    applyTransform(endNode, nodes[nodes.length - 1]);
    
    const dynamicNodes = document.querySelectorAll('.dynamic-node');
    dynamicNodes.forEach(el => {
        const idx = parseInt(el.dataset.index);
        if (nodes[idx]) applyTransform(el, nodes[idx]);
    });

    let d = `M ${nodes[0].x + 20} ${nodes[0].y + 20}`;
    const steps = 100; 
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const pos = getSplinePoint(t, nodes); 
        d += ` L ${pos.x + 20} ${pos.y + 20}`;
    }
    svgPath.setAttribute('d', d);
}

function applyTransform(el, pos) {
    let transformStr = `translate(${pos.x}px, ${pos.y}px)`;
    
    if (!el.classList.contains('dynamic-node')) {
        transformStr += ` rotate(${currentRotate}deg) scale(${currentScale})`;
        
        // [수정] A, B, 유령 노드 이미지 적용 로직 통합
        if (customImageURL) {
            applyImageStyle(el);
        } else {
            resetNodeStyle(el);
        }
    }
    el.style.transform = transformStr;
}

// --- 드래그 이벤트 ---
let dragTarget = null;
let dragOffset = { x: 0, y: 0 };

stageContent.addEventListener('mousedown', (e) => {
    e.preventDefault(); 
    // 이미지 적용 시 클릭 영역이 커질 수 있으므로 closest 사용 권장하지만, 현재 구조 유지
    if (e.target.classList.contains('node')) {
        dragTarget = e.target;
        let dragIndex = -1; 

        if (dragTarget === startNode) dragIndex = 0;
        else if (dragTarget === endNode) dragIndex = nodes.length - 1;
        else if (dragTarget.classList.contains('dynamic-node')) dragIndex = parseInt(dragTarget.dataset.index);

        if (dragIndex !== -1) {
            const currentPosVal = nodes[dragIndex];
            dragTarget.dataset.dragIndex = dragIndex; 
            const rect = stageContent.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / stageZoom;
            const mouseY = (e.clientY - rect.top) / stageZoom;
            dragOffset.x = mouseX - currentPosVal.x;
            dragOffset.y = mouseY - currentPosVal.y;

            if (mode === 'drawing' && dragTarget === startNode) {
                isRecording = true;
                drawnFrames = [];
		drawingPath.setAttribute('d', ''); // [추가] 기존 궤적 지우기
                recordStartTime = Date.now();
                const t = translations[currentLang] || translations['ko'];
                statusText.textContent = t.status_drawing;
                statusText.style.color = "#ff4757";
                recordFrame();
            }
        } else {
            dragTarget = null;
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (!dragTarget) return;
    const rect = stageContent.getBoundingClientRect();
    const newX = ((e.clientX - rect.left) / stageZoom) - dragOffset.x;
    const newY = ((e.clientY - rect.top) / stageZoom) - dragOffset.y;

    if (mode === 'keyframe') {
        const idx = parseInt(dragTarget.dataset.dragIndex);
        if (!isNaN(idx) && nodes[idx]) {
            nodes[idx].x = newX;
            nodes[idx].y = newY;
        }
    } else {
        if (dragTarget === startNode) {
            nodes[0].x = newX;
            nodes[0].y = newY;
        }
    }
if (mode === 'drawing' && isRecording) {
        recordFrame();
        updateDrawingPath(); // [추가] 실시간 궤적 그리기
    }
    
    updateVisuals();
});

window.addEventListener('mouseup', () => {
    let changed = false; 
    if (mode === 'drawing' && isRecording) {
        isRecording = false;
        const t = translations[currentLang] || translations['ko'];
        statusText.textContent = t.status_done;
        statusText.style.color = "#00d2ff";
        const smoothVal = parseInt(inputSmoothing.value) || 5; 
        drawnFrames = smoothPath(drawnFrames, smoothVal); 
        generateCode();
        updatePreview(0); 
        changed = true; 
    } else if (mode === 'keyframe' && dragTarget) {
        generateCode();
        updatePreview(0); 
        changed = true; 
    }
    dragTarget = null;
    if (changed) saveState();
});

// --- 스플라인 알고리즘 ---
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
    const u0 = (p2.y - p0.y) * 0.5;
    const u1 = (p3.y - p1.y) * 0.5;
    const x = (2 * p1.x - 2 * p2.x + v0 + v1) * t3 + (-3 * p1.x + 3 * p2.x - 2 * v0 - v1) * t2 + v0 * t + p1.x;
    const y = (2 * p1.y - 2 * p2.y + u0 + u1) * t3 + (-3 * p1.y + 3 * p2.y - 2 * u0 - u1) * t2 + u0 * t + p1.y;
    return { x, y };
}

function recordFrame() {
    const t = Date.now() - recordStartTime;
    drawnFrames.push({ t, x: nodes[0].x, y: nodes[0].y, r: currentRotate, s: currentScale });
}

// --- 코드 생성기 ---
function formatNum(val) {
    const p = parseInt(inputPrecision.value) || 0;
    return parseFloat(Number(val).toFixed(p));
}

const formatters = {
    js: (frames, duration, ease) => {
        let code = `const element = document.querySelector('.target');\n`;
        code += `// JavaScript Web Animations API\n`;
        code += `const keyframes = [\n`;
        frames.forEach(f => {
            const { valX, valY, offsetStr } = convertValues(f, duration);
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
            code += `  ${percent} { transform: translate(${valX}, ${valY}) rotate(${formatNum(f.r)}deg) scale(${formatNum(f.s)}); }\n`;
        });
        code += `}`;
        return code;
    },
    phaser: (frames, duration, ease) => {
        const easeMap = { 'linear': 'Linear', 'ease': 'Sine.easeInOut', 'ease-in': 'Sine.easeIn', 'ease-out': 'Sine.easeOut', 'ease-in-out': 'Sine.easeInOut' };
        const phaserEase = easeMap[ease] || 'Linear';
        const frameDuration = Math.floor(duration / frames.length);
        let code = `// Phaser Tweens Config\n// this.scene.tweens.chain({ targets: ..., tweens: [ ... ] });\n\n`;
        frames.forEach((f) => {
            let x = f.x - CENTER_X + 20;
            let y = f.y - CENTER_Y + 20;
            code += `  {\n    x: ${formatNum(x)}, y: ${formatNum(y)}, angle: ${formatNum(f.r)}, scale: ${formatNum(f.s)},\n    duration: ${frameDuration},\n    ease: '${phaserEase}'\n  },\n`;
        });
        return code;
    },
    unity: (frames, duration, ease) => {
        let code = `// Unity C# Coroutine\nIEnumerator MoveObject() {\n    float duration = ${duration / 1000}f;\n    Vector3[] path = new Vector3[] {\n`;
        frames.forEach(f => {
             let relativeX = f.x - CENTER_X + 20;
             let relativeY = -(f.y - CENTER_Y + 20);
             code += `        new Vector3(${formatNum(relativeX)}f, ${formatNum(relativeY)}f, 0f),\n`;
        });
        code += `    };\n}`;
        return code;
    },
    python: (frames, duration, ease) => {
        let code = `# Python List\npath_data = [\n`;
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

function convertValues(f, totalDuration) {
    let relativeX = f.x - CENTER_X + 20; 
    let relativeY = f.y - CENTER_Y + 20;
    let valX, valY;
    if (usePercent) {
        valX = formatNum((relativeX / STAGE_SIZE) * 100) + '%';
        valY = formatNum((relativeY / STAGE_SIZE) * 100) + '%';
    } else {
        valX = formatNum(relativeX) + 'px';
        valY = formatNum(relativeY) + 'px';
    }
    let offsetVal = (mode === 'drawing') ? (f.t / totalDuration) : f.t; 
    if(isNaN(offsetVal)) offsetVal = 0;
    return { valX, valY, offsetVal, offsetStr: Number(offsetVal).toFixed(3) };
}

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
            const pos = getSplinePoint(t, nodes);
            framesToExport.push({ t: t, x: pos.x, y: pos.y, r: currentRotate, s: currentScale });
        }
    }
    if (totalDuration === 0) totalDuration = 1; 
    const lang = outputLang.value;
    const formatter = formatters[lang] || formatters['js'];
    codeArea.textContent = formatter(framesToExport, totalDuration, easeVal);
}

function getInterpolatedState(progress) {
    if (mode === 'drawing') {
        if (drawnFrames.length === 0) return null;
        const totalDuration = drawnFrames[drawnFrames.length - 1].t;
        const targetTime = totalDuration * progress;
        const frame = drawnFrames.find(f => f.t >= targetTime) || drawnFrames[drawnFrames.length - 1];
        return { x: frame.x, y: frame.y, r: frame.r, s: frame.s };
    } else {
        const pos = getSplinePoint(progress, nodes);
        return { x: pos.x, y: pos.y, r: currentRotate, s: currentScale };
    }
}

function updatePreview(progress) {
    const state = getInterpolatedState(progress);
    if (!state) return;
    
    // [수정] 프리뷰 노드에도 이미지 스타일 적용 필요
    if (customImageURL) {
        applyImageStyle(previewNode);
    } else {
        resetNodeStyle(previewNode);
    }

    previewNode.style.display = 'flex';
    previewNode.style.transform = `translate(${state.x}px, ${state.y}px) rotate(${state.r}deg) scale(${state.s})`;
    timelineSlider.value = progress * 100;
    let totalDuration = 0;
    if (mode === 'drawing' && drawnFrames.length > 0) totalDuration = drawnFrames[drawnFrames.length - 1].t;
    else if (mode === 'keyframe') totalDuration = Number(document.getElementById('input-duration').value);
    const currentTime = Math.round(totalDuration * progress);
    timeDisplay.textContent = `${currentTime}ms / ${totalDuration}ms`;
}

function togglePlay() {
    if (isPlaying) pause();
    else play();
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
        if (isPlaying) animationId = requestAnimationFrame(loop);
    }
    animationId = requestAnimationFrame(loop);
}

function pause() {
    isPlaying = false;
    btnPlayPause.textContent = "▶";
    if (animationId) cancelAnimationFrame(animationId);
}

function updateDrawingPath() {
    if (drawnFrames.length < 2) return;
    
    // drawnFrames 데이터를 SVG path 문자열로 변환
    let d = `M ${drawnFrames[0].x + 20} ${drawnFrames[0].y + 20}`;
    
    for (let i = 1; i < drawnFrames.length; i++) {
        d += ` L ${drawnFrames[i].x + 20} ${drawnFrames[i].y + 20}`;
    }
    
    drawingPath.setAttribute('d', d);
}
function stop() {
    pause(); // 일시정지
    timelineSlider.value = 0; // 처음으로 되감기
    updatePreview(0); // 화면 갱신
}
// --- 이벤트 리스너 ---
btnStop.addEventListener('click', stop);

inputImage.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            customImageURL = event.target.result;
            
            // [수정] 이미지 비율 계산
            const img = new Image();
            img.onload = () => {
                customImageRatio = img.width / img.height;
                btnRemoveImage.style.display = 'block';
                renderNodes(); // 노드 재생성 (스타일 적용을 위해)
                updateVisuals(); 
            };
            img.src = customImageURL;
        };
        reader.readAsDataURL(file);
    }
});

btnRemoveImage.addEventListener('click', () => {
    customImageURL = null;
    inputImage.value = "";
    btnRemoveImage.style.display = 'none';
    renderNodes();
    updateVisuals();
});

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
inputPrecision.addEventListener('change', generateCode);
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
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
window.addEventListener('keydown', (e) => {
    // 입력창(input, textarea) 사용 중일 때는 무시
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // 스페이스바: 재생/일시정지
    if (e.code === 'Space') {
        e.preventDefault(); // 스크롤 방지
        togglePlay();
    }
    
    // Ctrl + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            redo(); 
        } else {
            undo(); 
        }
    }

    // Ctrl + Y: Redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
    }
});

const btnCopy = document.getElementById('btn-copy-code');
const btnToggle = document.getElementById('btn-toggle-panel');
const bottomPanel = document.getElementById('bottom-panel');
btnCopy.addEventListener('click', () => {
    const codeText = codeArea.textContent;
    navigator.clipboard.writeText(codeText).then(() => {
        const originalText = btnCopy.textContent;
        btnCopy.textContent = "✅ Copied!";
        setTimeout(() => { btnCopy.textContent = originalText; }, 1500);
    }).catch(err => { alert("복사 실패: " + err); });
});
btnToggle.addEventListener('click', () => {
    bottomPanel.classList.toggle('collapsed');
    btnToggle.textContent = bottomPanel.classList.contains('collapsed') ? "▲" : "▼";
});

function smoothPath(frames, windowSize = 5) {
    if (frames.length < windowSize) return frames;
    let smoothed = [];
    const len = frames.length;
    for (let i = 0; i < len; i++) {
        let sumX = 0, sumY = 0, sumR = 0, sumS = 0;
        let count = 0;
        for (let j = i - Math.floor(windowSize / 2); j <= i + Math.floor(windowSize / 2); j++) {
            if (j >= 0 && j < len) {
                sumX += frames[j].x; sumY += frames[j].y;
                sumR += Number(frames[j].r); sumS += Number(frames[j].s);
                count++;
            }
        }
        const avgX = sumX / count; const avgY = sumY / count;
        const avgR = sumR / count; const avgS = sumS / count;
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

function saveState() {
    const state = {
        mode: mode,
        nodes: JSON.parse(JSON.stringify(nodes)),
        drawnFrames: JSON.parse(JSON.stringify(drawnFrames)),
        rotate: currentRotate,
        scale: currentScale
    };
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }
    historyStack.push(state);
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    } else {
        historyIndex++;
    }
    updateUndoRedoButtons();
}
function undo() { if (historyIndex > 0) { historyIndex--; restoreState(historyStack[historyIndex]); } }
function redo() { if (historyIndex < historyStack.length - 1) { historyIndex++; restoreState(historyStack[historyIndex]); } }
function restoreState(state) {
    if (!state) return;
    nodes = JSON.parse(JSON.stringify(state.nodes));
    drawnFrames = JSON.parse(JSON.stringify(state.drawnFrames));
    currentRotate = state.rotate;
    currentScale = state.scale;
    if (mode !== state.mode) {
        setMode(state.mode); 
        nodes = JSON.parse(JSON.stringify(state.nodes));
        drawnFrames = JSON.parse(JSON.stringify(state.drawnFrames));
    }
    document.getElementById('input-rotate').value = currentRotate;
    document.getElementById('input-scale').value = currentScale;
    renderNodes();
    updateVisuals();
    generateCode();
    updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if(!btnUndo || !btnRedo) return;
    btnUndo.style.opacity = (historyIndex > 0) ? 1 : 0.5;
    btnUndo.style.pointerEvents = (historyIndex > 0) ? 'auto' : 'none';
    btnRedo.style.opacity = (historyIndex < historyStack.length - 1) ? 1 : 0.5;
    btnRedo.style.pointerEvents = (historyIndex < historyStack.length - 1) ? 'auto' : 'none';
}

// 실행
init();