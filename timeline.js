// ==================== TIMELINE & ARRANGEMENT VIEW ====================
// Add this script to index.html: <script src="timeline.js"></script>
// Call initTimeline() after page load in the window.addEventListener('load') function

let timelineState = {
    tracks: [],
    clips: [],
    markers: [],
    loopRegion: null,
    playbackState: {
        isPlaying: false,
        isRecording: false,
        startTime: 0,
        currentTime: 0,
        pausedAt: 0
    },
    view: {
        zoom: 1.0,
        scrollX: 0,
        scrollY: 0,
        pixelsPerSecond: 100,
        snapEnabled: true,
        snapDivision: 0.25
    },
    selection: {
        selectedClips: [],
        selectedMarker: null
    },
    dragState: {
        isDragging: false,
        dragType: null,
        dragTarget: null,
        startX: 0,
        startY: 0,
        originalX: 0,
        originalWidth: 0
    }
};

let timelineContainer, timelineCanvas, timelineRulerCanvas, timelineScrollContainer;
let timelinePlayhead, timelineClipsContainer, timelineMarkersContainer, timelineTracksHeader;
let timelinePlayButton, timelineStopButton, timelineRecordButton, timelinePosition;
let zoomInButton, zoomOutButton, zoomLevel, snapToggle, snapDivision;
let addTrackButton, addMarkerButton, toggleTimelineButton;
let timelineAnimationFrameId = null;

function initTimeline() {
    timelineContainer = document.getElementById('timelineContainer');
    timelineCanvas = document.getElementById('timelineCanvas');
    timelineRulerCanvas = document.getElementById('timelineRulerCanvas');
    timelineScrollContainer = document.getElementById('timelineScrollContainer');
    timelinePlayhead = document.getElementById('timelinePlayhead');
    timelineClipsContainer = document.getElementById('timelineClipsContainer');
    timelineMarkersContainer = document.getElementById('timelineMarkersContainer');
    timelineTracksHeader = document.getElementById('timelineTracksHeader');
    timelinePlayButton = document.getElementById('timelinePlayButton');
    timelineStopButton = document.getElementById('timelineStopButton');
    timelineRecordButton = document.getElementById('timelineRecordButton');
    timelinePosition = document.getElementById('timelinePosition');
    zoomInButton = document.getElementById('zoomInButton');
    zoomOutButton = document.getElementById('zoomOutButton');
    zoomLevel = document.getElementById('zoomLevel');
    snapToggle = document.getElementById('snapToggle');
    snapDivision = document.getElementById('snapDivision');
    addTrackButton = document.getElementById('addTrackButton');
    addMarkerButton = document.getElementById('addMarkerButton');
    toggleTimelineButton = document.getElementById('toggleTimelineButton');

    addTimelineTrack('MIDI Track 1', 'midi');
    addTimelineTrack('Audio Track 1', 'audio');
    addTimelineTrack('MIDI Track 2', 'midi');

    addTimelineClip({trackIndex: 0, startTime: 0, duration: 4, type: 'midi', name: 'MIDI Clip 1', color: 0, data: {notes: []}});
    addTimelineClip({trackIndex: 1, startTime: 2, duration: 6, type: 'audio', name: 'Audio Clip 1', color: 1, data: {waveform: []}});
    addTimelineClip({trackIndex: 0, startTime: 8, duration: 3.5, type: 'midi', name: 'MIDI Clip 2', color: 0, data: {notes: []}});

    addTimelineMarker(0, 'Intro');
    addTimelineMarker(8, 'Verse');
    addTimelineMarker(16, 'Chorus');

    setupTimelineEvents();
    resizeTimelineCanvas();
    renderTimeline();
}

function addTimelineTrack(name, type) {
    const track = {
        id: timelineState.tracks.length,
        name: name,
        type: type || 'midi',
        height: 80,
        muted: false,
        solo: false
    };
    timelineState.tracks.push(track);
    renderTrackHeaders();
    resizeTimelineCanvas();
}

function addTimelineClip(clipData) {
    const clip = {
        id: timelineState.clips.length,
        trackIndex: clipData.trackIndex,
        startTime: clipData.startTime,
        duration: clipData.duration,
        type: clipData.type,
        name: clipData.name || 'Clip ' + (timelineState.clips.length + 1),
        color: clipData.color || 0,
        data: clipData.data || {},
        element: null
    };
    timelineState.clips.push(clip);
    renderClips();
}

function addTimelineMarker(time, name) {
    const marker = {
        id: timelineState.markers.length,
        time: time,
        name: name || 'Marker ' + (timelineState.markers.length + 1),
        element: null
    };
    timelineState.markers.push(marker);
    renderMarkers();
}

function removeTimelineClip(clipId) {
    const clipIndex = timelineState.clips.findIndex(c => c.id === clipId);
    if (clipIndex !== -1) {
        const clip = timelineState.clips[clipIndex];
        if (clip.element && clip.element.parentElement) {
            clip.element.remove();
        }
        timelineState.clips.splice(clipIndex, 1);
    }
}

function setupTimelineEvents() {
    toggleTimelineButton.addEventListener('click', () => {
        timelineContainer.classList.toggle('open');
        toggleTimelineButton.textContent = timelineContainer.classList.contains('open') ? 'Hide Timeline' : 'Show Timeline';
        if (timelineContainer.classList.contains('open')) {
            resizeTimelineCanvas();
            renderTimeline();
        }
    });

    timelinePlayButton.addEventListener('click', toggleTimelinePlayback);
    timelineStopButton.addEventListener('click', stopTimelinePlayback);
    timelineRecordButton.addEventListener('click', toggleTimelineRecording);

    zoomInButton.addEventListener('click', () => adjustTimelineZoom(1.2));
    zoomOutButton.addEventListener('click', () => adjustTimelineZoom(1 / 1.2));

    snapToggle.addEventListener('change', (e) => {
        timelineState.view.snapEnabled = e.target.checked;
        updateSnapGrid();
    });

    snapDivision.addEventListener('change', (e) => {
        timelineState.view.snapDivision = parseFloat(e.target.value);
        updateSnapGrid();
    });

    addTrackButton.addEventListener('click', () => {
        const trackNum = timelineState.tracks.length + 1;
        addTimelineTrack('Track ' + trackNum, 'midi');
        renderTimeline();
    });

    addMarkerButton.addEventListener('click', () => {
        const markerTime = timelineState.playbackState.currentTime;
        const markerName = prompt('Marker name:', 'Marker ' + (timelineState.markers.length + 1));
        if (markerName !== null) {
            addTimelineMarker(markerTime, markerName);
        }
    });

    timelineScrollContainer.addEventListener('mousedown', handleTimelineMouseDown);
    document.addEventListener('mousemove', handleTimelineMouseMove);
    document.addEventListener('mouseup', handleTimelineMouseUp);

    timelineScrollContainer.addEventListener('scroll', () => {
        timelineState.view.scrollX = timelineScrollContainer.scrollLeft;
        timelineState.view.scrollY = timelineScrollContainer.scrollTop;
        renderRuler();
    });

    window.addEventListener('resize', () => {
        if (timelineContainer.classList.contains('open')) {
            resizeTimelineCanvas();
            renderTimeline();
        }
    });

    document.addEventListener('keydown', handleTimelineKeyboard);
}

function handleTimelineKeyboard(e) {
    if (!timelineContainer.classList.contains('open')) return;
    if (e.target.closest('input, select, textarea')) return;

    switch (e.key) {
        case ' ':
            if (e.target === document.body) {
                e.preventDefault();
                toggleTimelinePlayback();
            }
            break;
        case 'Delete':
        case 'Backspace':
            if (e.target === document.body) {
                e.preventDefault();
                deleteSelectedClips();
            }
            break;
        case 'c':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                copySelectedClips();
            }
            break;
        case 'v':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                pasteClips();
            }
            break;
    }
}

let clipboardClips = [];

function copySelectedClips() {
    clipboardClips = timelineState.selection.selectedClips.map(clipId => {
        const clip = timelineState.clips.find(c => c.id === clipId);
        return clip ? Object.assign({}, clip) : null;
    }).filter(c => c !== null);
    console.log('Copied clips:', clipboardClips.length);
}

function pasteClips() {
    if (clipboardClips.length === 0) return;

    const offset = timelineState.playbackState.currentTime - clipboardClips[0].startTime;
    clipboardClips.forEach(clipData => {
        addTimelineClip(Object.assign({}, clipData, {
            startTime: clipData.startTime + offset,
            name: clipData.name + ' (copy)'
        }));
    });
    renderTimeline();
}

function deleteSelectedClips() {
    timelineState.selection.selectedClips.forEach(clipId => {
        removeTimelineClip(clipId);
    });
    timelineState.selection.selectedClips = [];
    renderTimeline();
}

function handleTimelineMouseDown(e) {
    const rect = timelineScrollContainer.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineState.view.scrollX;
    const y = e.clientY - rect.top + timelineState.view.scrollY;

    const clickedClip = findClipAtPosition(x, y);
    if (clickedClip) {
        const clipElement = clickedClip.element;
        const clipRect = clipElement.getBoundingClientRect();
        const clipX = e.clientX - clipRect.left;

        if (clipX < 8) {
            startDragOperation('clip-resize-left', clickedClip, x, y);
        } else if (clipX > clipRect.width - 8) {
            startDragOperation('clip-resize-right', clickedClip, x, y);
        } else {
            if (!e.shiftKey && !timelineState.selection.selectedClips.includes(clickedClip.id)) {
                timelineState.selection.selectedClips = [clickedClip.id];
            } else if (e.shiftKey) {
                if (timelineState.selection.selectedClips.includes(clickedClip.id)) {
                    timelineState.selection.selectedClips = timelineState.selection.selectedClips.filter(id => id !== clickedClip.id);
                } else {
                    timelineState.selection.selectedClips.push(clickedClip.id);
                }
            }
            startDragOperation('clip-move', clickedClip, x, y);
            renderClips();
        }
        return;
    }

    if (y < 40) {
        const time = pixelsToTime(x);
        seekToTime(time);
        startDragOperation('playhead', null, x, y);
        return;
    }

    timelineState.selection.selectedClips = [];
    renderClips();
}

function handleTimelineMouseMove(e) {
    if (!timelineState.dragState.isDragging) return;

    const rect = timelineScrollContainer.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineState.view.scrollX;
    const y = e.clientY - rect.top + timelineState.view.scrollY;
    const deltaX = x - timelineState.dragState.startX;
    const deltaTime = pixelsToTime(deltaX) - pixelsToTime(0);

    switch (timelineState.dragState.dragType) {
        case 'clip-move':
            moveSelectedClips(deltaTime, y - timelineState.dragState.startY);
            break;
        case 'clip-resize-left':
            resizeClip(timelineState.dragState.dragTarget, deltaTime, true);
            break;
        case 'clip-resize-right':
            resizeClip(timelineState.dragState.dragTarget, deltaTime, false);
            break;
        case 'playhead':
            const time = pixelsToTime(x);
            seekToTime(time);
            break;
    }
}

function handleTimelineMouseUp(e) {
    if (timelineState.dragState.isDragging) {
        timelineState.dragState.isDragging = false;
        timelineState.dragState.dragType = null;
        timelineState.dragState.dragTarget = null;
    }
}

function startDragOperation(type, target, x, y) {
    timelineState.dragState.isDragging = true;
    timelineState.dragState.dragType = type;
    timelineState.dragState.dragTarget = target;
    timelineState.dragState.startX = x;
    timelineState.dragState.startY = y;

    if (target) {
        timelineState.dragState.originalX = target.startTime;
        timelineState.dragState.originalWidth = target.duration;
    }
}

function moveSelectedClips(deltaTime, deltaY) {
    timelineState.selection.selectedClips.forEach(clipId => {
        const clip = timelineState.clips.find(c => c.id === clipId);
        if (!clip) return;

        let newStartTime = timelineState.dragState.originalX + deltaTime;

        if (timelineState.view.snapEnabled) {
            newStartTime = snapToGrid(newStartTime);
        }

        newStartTime = Math.max(0, newStartTime);
        clip.startTime = newStartTime;

        const trackIndex = Math.floor(deltaY / 80);
        const newTrackIndex = Math.max(0, Math.min(timelineState.tracks.length - 1, clip.trackIndex + trackIndex));
        if (Math.abs(deltaY) > 40) {
            clip.trackIndex = newTrackIndex;
        }
    });

    renderClips();
}

function resizeClip(clip, deltaTime, isLeftHandle) {
    if (!clip) return;

    if (isLeftHandle) {
        let newStartTime = timelineState.dragState.originalX + deltaTime;
        if (timelineState.view.snapEnabled) {
            newStartTime = snapToGrid(newStartTime);
        }
        const maxStart = timelineState.dragState.originalX + timelineState.dragState.originalWidth - 0.1;
        newStartTime = Math.max(0, Math.min(maxStart, newStartTime));

        const newDuration = (timelineState.dragState.originalX + timelineState.dragState.originalWidth) - newStartTime;
        clip.startTime = newStartTime;
        clip.duration = newDuration;
    } else {
        let newDuration = timelineState.dragState.originalWidth + deltaTime;
        if (timelineState.view.snapEnabled) {
            const newEndTime = snapToGrid(clip.startTime + newDuration);
            newDuration = newEndTime - clip.startTime;
        }
        clip.duration = Math.max(0.1, newDuration);
    }

    renderClips();
}

function findClipAtPosition(x, y) {
    for (let i = timelineState.clips.length - 1; i >= 0; i--) {
        const clip = timelineState.clips[i];
        const track = timelineState.tracks[clip.trackIndex];
        if (!track) continue;

        const clipLeft = timeToPixels(clip.startTime);
        const clipRight = timeToPixels(clip.startTime + clip.duration);
        const clipTop = clip.trackIndex * 80;
        const clipBottom = clipTop + 80;

        if (x >= clipLeft && x <= clipRight && y >= clipTop && y <= clipBottom) {
            return clip;
        }
    }
    return null;
}

function snapToGrid(time) {
    const beatDuration = (60 / currentBPM) * timelineState.view.snapDivision;
    return Math.round(time / beatDuration) * beatDuration;
}

function updateSnapGrid() {
    if (timelineState.view.snapEnabled) {
        const beatDuration = (60 / currentBPM) * timelineState.view.snapDivision;
        const gridSize = timeToPixels(beatDuration) - timeToPixels(0);
        timelineScrollContainer.style.setProperty('--snap-grid-size', gridSize + 'px');
        timelineScrollContainer.classList.add('snap-enabled');
    } else {
        timelineScrollContainer.classList.remove('snap-enabled');
    }
}

function adjustTimelineZoom(factor) {
    timelineState.view.zoom *= factor;
    timelineState.view.zoom = Math.max(0.1, Math.min(10, timelineState.view.zoom));

    const zoomPercent = Math.round(timelineState.view.zoom * 100);
    zoomLevel.textContent = zoomPercent + '%';

    resizeTimelineCanvas();
    renderTimeline();
    updateSnapGrid();
}

function timeToPixels(time) {
    return time * timelineState.view.pixelsPerSecond * timelineState.view.zoom;
}

function pixelsToTime(pixels) {
    return pixels / (timelineState.view.pixelsPerSecond * timelineState.view.zoom);
}

function toggleTimelinePlayback() {
    if (timelineState.playbackState.isPlaying) {
        pauseTimelinePlayback();
    } else {
        startTimelinePlayback();
    }
}

function startTimelinePlayback() {
    if (!audioContext) initAudio();
    if (!audioContext) return;

    timelineState.playbackState.isPlaying = true;
    timelineState.playbackState.startTime = performance.now() - (timelineState.playbackState.pausedAt * 1000);

    timelinePlayButton.textContent = '⏸';
    timelinePlayButton.classList.add('playing');

    if (!timelineAnimationFrameId) {
        updateTimelinePlayback();
    }
}

function pauseTimelinePlayback() {
    timelineState.playbackState.isPlaying = false;
    timelineState.playbackState.pausedAt = timelineState.playbackState.currentTime;

    timelinePlayButton.textContent = '▶';
    timelinePlayButton.classList.remove('playing');
}

function stopTimelinePlayback() {
    timelineState.playbackState.isPlaying = false;
    timelineState.playbackState.currentTime = 0;
    timelineState.playbackState.pausedAt = 0;
    timelineState.playbackState.startTime = 0;

    timelinePlayButton.textContent = '▶';
    timelinePlayButton.classList.remove('playing');

    updatePlayheadPosition();
    updateTimeDisplay();
}

function toggleTimelineRecording() {
    timelineState.playbackState.isRecording = !timelineState.playbackState.isRecording;

    if (timelineState.playbackState.isRecording) {
        timelineRecordButton.classList.add('recording');
        if (!timelineState.playbackState.isPlaying) {
            startTimelinePlayback();
        }
    } else {
        timelineRecordButton.classList.remove('recording');
    }
}

function seekToTime(time) {
    time = Math.max(0, time);
    timelineState.playbackState.currentTime = time;
    timelineState.playbackState.pausedAt = time;

    if (timelineState.playbackState.isPlaying) {
        timelineState.playbackState.startTime = performance.now() - (time * 1000);
    }

    updatePlayheadPosition();
    updateTimeDisplay();
}

function updateTimelinePlayback() {
    if (!timelineState.playbackState.isPlaying) {
        timelineAnimationFrameId = null;
        return;
    }

    const now = performance.now();
    const elapsed = (now - timelineState.playbackState.startTime) / 1000;
    timelineState.playbackState.currentTime = elapsed;

    updatePlayheadPosition();
    updateTimeDisplay();

    timelineAnimationFrameId = requestAnimationFrame(updateTimelinePlayback);
}

function updatePlayheadPosition() {
    const pixels = timeToPixels(timelineState.playbackState.currentTime);
    timelinePlayhead.style.left = pixels + 'px';

    if (timelineState.playbackState.isPlaying) {
        const containerWidth = timelineScrollContainer.clientWidth;
        const scrollLeft = timelineScrollContainer.scrollLeft;

        if (pixels > scrollLeft + containerWidth - 100) {
            timelineScrollContainer.scrollLeft = pixels - containerWidth / 2;
        }
    }
}

function updateTimeDisplay() {
    const time = timelineState.playbackState.currentTime;
    timelinePosition.textContent = time.toFixed(2) + 's';
}

function resizeTimelineCanvas() {
    if (!timelineCanvas || !timelineContainer.classList.contains('open')) return;

    const fontScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-scale-factor'));

    const totalDuration = Math.max(
        30,
        ...timelineState.clips.map(c => c.startTime + c.duration),
        ...timelineState.markers.map(m => m.time)
    );
    const totalWidth = timeToPixels(totalDuration + 10);
    const totalHeight = timelineState.tracks.length * 80 * fontScale;

    timelineCanvas.width = Math.max(totalWidth, 3000);
    timelineCanvas.height = Math.max(totalHeight, 300);
    timelineCanvas.style.width = timelineCanvas.width + 'px';
    timelineCanvas.style.height = timelineCanvas.height + 'px';

    const rulerWidth = timelineScrollContainer.clientWidth;
    timelineRulerCanvas.width = Math.max(totalWidth, rulerWidth);
    timelineRulerCanvas.height = 40 * fontScale;

    timelinePlayhead.style.height = totalHeight + 'px';
}

function renderTimeline() {
    renderRuler();
    renderGrid();
    renderTrackHeaders();
    renderClips();
    renderMarkers();
    updatePlayheadPosition();
    updateTimeDisplay();
    updateSnapGrid();
}

function renderRuler() {
    if (!timelineRulerCanvas) return;

    const ctx = timelineRulerCanvas.getContext('2d');
    const width = timelineRulerCanvas.width;
    const height = timelineRulerCanvas.height;
    const fontScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-scale-factor'));

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--secondary-surface-color').trim();
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
    ctx.font = (11 * fontScale) + 'px "Courier New", monospace';
    ctx.lineWidth = 1;

    const beatDuration = 60 / currentBPM;
    const barDuration = beatDuration * 4;

    let time = 0;
    let barNumber = 0;
    while (timeToPixels(time) < width) {
        const x = timeToPixels(time);

        ctx.beginPath();
        ctx.moveTo(x, height - 20);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.fillText('' + (barNumber + 1), x + 3, 15);

        for (let beat = 1; beat < 4; beat++) {
            const beatTime = time + (beat * beatDuration);
            const beatX = timeToPixels(beatTime);

            ctx.beginPath();
            ctx.moveTo(beatX, height - 10);
            ctx.lineTo(beatX, height);
            ctx.stroke();
        }

        time += barDuration;
        barNumber++;
    }

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted-color').trim();
    let second = 0;
    while (timeToPixels(second) < width) {
        const x = timeToPixels(second);
        ctx.fillText(second + 's', x + 3, height - 25);
        second++;
    }
}

function renderGrid() {
    if (!timelineCanvas) return;

    const ctx = timelineCanvas.getContext('2d');
    const width = timelineCanvas.width;
    const height = timelineCanvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
    ctx.lineWidth = 1;

    for (let i = 0; i <= timelineState.tracks.length; i++) {
        const y = i * 80;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}

function renderTrackHeaders() {
    if (!timelineTracksHeader) return;

    timelineTracksHeader.innerHTML = '';

    timelineState.tracks.forEach((track, index) => {
        const header = document.createElement('div');
        header.className = 'track-header';
        header.dataset.trackIndex = index;

        const nameDiv = document.createElement('div');
        nameDiv.className = 'track-header-name';
        nameDiv.textContent = track.name;

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'track-header-controls';

        const muteBtn = document.createElement('button');
        muteBtn.textContent = 'M';
        muteBtn.className = 'std-button';
        muteBtn.title = 'Mute';
        muteBtn.style.backgroundColor = track.muted ? 'var(--looper-record-color)' : '';
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            track.muted = !track.muted;
            muteBtn.style.backgroundColor = track.muted ? 'var(--looper-record-color)' : '';
        });

        const soloBtn = document.createElement('button');
        soloBtn.textContent = 'S';
        soloBtn.className = 'std-button';
        soloBtn.title = 'Solo';
        soloBtn.style.backgroundColor = track.solo ? 'var(--accent-color)' : '';
        soloBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            track.solo = !track.solo;
            soloBtn.style.backgroundColor = track.solo ? 'var(--accent-color)' : '';
        });

        controlsDiv.appendChild(muteBtn);
        controlsDiv.appendChild(soloBtn);

        header.appendChild(nameDiv);
        header.appendChild(controlsDiv);

        timelineTracksHeader.appendChild(header);
    });
}

function renderClips() {
    if (!timelineClipsContainer) return;

    timelineState.clips.forEach(clip => {
        if (clip.element && clip.element.parentElement) {
            clip.element.remove();
        }
    });

    timelineState.clips.forEach(clip => {
        const track = timelineState.tracks[clip.trackIndex];
        if (!track) return;

        const clipElement = document.createElement('div');
        clipElement.className = 'timeline-clip ' + clip.type;
        clipElement.dataset.clipId = clip.id;

        if (timelineState.selection.selectedClips.includes(clip.id)) {
            clipElement.classList.add('selected');
        }

        const left = timeToPixels(clip.startTime);
        const width = timeToPixels(clip.duration) - timeToPixels(0);
        const top = clip.trackIndex * 80;

        clipElement.style.left = left + 'px';
        clipElement.style.width = width + 'px';
        clipElement.style.top = top + 'px';
        clipElement.style.height = '76px';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = clip.name;
        clipElement.appendChild(nameSpan);

        const leftHandle = document.createElement('div');
        leftHandle.className = 'timeline-clip-resize-handle left';
        clipElement.appendChild(leftHandle);

        const rightHandle = document.createElement('div');
        rightHandle.className = 'timeline-clip-resize-handle right';
        clipElement.appendChild(rightHandle);

        clip.element = clipElement;
        timelineClipsContainer.appendChild(clipElement);
    });
}

function renderMarkers() {
    if (!timelineMarkersContainer) return;

    timelineState.markers.forEach(marker => {
        if (marker.element && marker.element.parentElement) {
            marker.element.remove();
        }
    });

    timelineState.markers.forEach(marker => {
        const markerElement = document.createElement('div');
        markerElement.className = 'timeline-marker';
        markerElement.dataset.markerId = marker.id;

        const left = timeToPixels(marker.time);
        markerElement.style.left = left + 'px';

        const label = document.createElement('div');
        label.className = 'timeline-marker-label';
        label.textContent = marker.name;
        markerElement.appendChild(label);

        markerElement.addEventListener('click', () => {
            seekToTime(marker.time);
        });

        marker.element = markerElement;
        timelineMarkersContainer.appendChild(markerElement);
    });
}
