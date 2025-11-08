// ========== TRANSPORT EVENT LISTENERS SETUP ==========
// Add this code to window.addEventListener('load') in index.html

function initTransportSystem() {
    // Get all transport UI elements
    transportPlayBtn = document.getElementById('transportPlay');
    transportPauseBtn = document.getElementById('transportPause');
    transportStopBtn = document.getElementById('transportStop');
    transportRecordBtn = document.getElementById('transportRecord');
    transportRewindBtn = document.getElementById('transportRewind');
    transportFFBtn = document.getElementById('transportFastForward');
    transportReturnBtn = document.getElementById('transportReturnToZero');
    transportCycleBtn = document.getElementById('transportCycle');

    transportTimecodeDisplay = document.getElementById('transportTimecode');
    timecodeFormatSelect = document.getElementById('timecodeFormat');

    countInEnableCheckbox = document.getElementById('countInEnable');
    countInBarsSelect = document.getElementById('countInBars');
    countInIndicator = document.getElementById('countInIndicator');

    currentTempoInput = document.getElementById('currentTempoInput');
    const currentTempoIncrement = document.getElementById('currentTempoIncrement');
    const currentTempoDecrement = document.getElementById('currentTempoDecrement');
    const tempoTapBtn = document.getElementById('tempoTapButton');

    timeSigNumeratorSelect = document.getElementById('timeSigNumerator');
    timeSigDenominatorSelect = document.getElementById('timeSigDenominator');

    loopStartInput = document.getElementById('loopStartBar');
    loopEndInput = document.getElementById('loopEndBar');
    const setLoopBtn = document.getElementById('setLoopToSelection');

    followPlayheadCheckbox = document.getElementById('followPlayhead');

    tempoLaneCanvas = document.getElementById('tempoLaneCanvas');
    tempoLaneContainer = document.getElementById('tempoLaneContainer');
    showTempoLaneBtn = document.getElementById('showTempoLaneButton');

    addMarkerBtn = document.getElementById('addMarkerButton');
    addTempoChangeBtn = document.getElementById('addTempoChangeButton');
    const clearTempoBtn = document.getElementById('clearTempoPoints');
    const clearTimeSigBtn = document.getElementById('clearTimeSigChanges');

    timelinePlayheadElement = document.getElementById('timelinePlayhead');

    // Transport button event listeners
    if (transportPlayBtn) {
        transportPlayBtn.addEventListener('click', () => {
            if (transportState === TransportState.PLAYING) {
                transportPause();
            } else {
                transportPlay();
            }
        });
    }

    if (transportPauseBtn) {
        transportPauseBtn.addEventListener('click', transportPause);
    }

    if (transportStopBtn) {
        transportStopBtn.addEventListener('click', transportStop);
    }

    if (transportRecordBtn) {
        transportRecordBtn.addEventListener('click', transportRecord);
    }

    if (transportRewindBtn) {
        transportRewindBtn.addEventListener('click', transportRewind);
    }

    if (transportFFBtn) {
        transportFFBtn.addEventListener('click', transportFastForward);
    }

    if (transportReturnBtn) {
        transportReturnBtn.addEventListener('click', transportReturnToZero);
    }

    if (transportCycleBtn) {
        transportCycleBtn.addEventListener('click', transportToggleCycle);
    }

    // Timecode format change
    if (timecodeFormatSelect) {
        timecodeFormatSelect.addEventListener('change', (e) => {
            timecodeFormat = e.target.value;
            updateTransportTimecode();
        });
    }

    // Count-in controls
    if (countInEnableCheckbox) {
        countInEnableCheckbox.addEventListener('change', (e) => {
            countInEnabled = e.target.checked;
        });
    }

    if (countInBarsSelect) {
        countInBarsSelect.addEventListener('change', (e) => {
            countInBars = parseInt(e.target.value);
        });
    }

    // Tempo controls
    if (currentTempoInput) {
        currentTempoInput.addEventListener('change', (e) => {
            currentBPM = Math.max(MIN_BPM, Math.min(MAX_BPM, parseInt(e.target.value)));
            currentTempoInput.value = currentBPM;
            updateBPMDisplay();
            if (metronomeEnabled) {
                stopMetronome();
                startMetronome();
            }
        });
    }

    if (currentTempoIncrement) {
        currentTempoIncrement.addEventListener('click', () => {
            currentBPM = Math.min(MAX_BPM, currentBPM + 1);
            if (currentTempoInput) currentTempoInput.value = currentBPM;
            updateBPMDisplay();
            if (metronomeEnabled) {
                stopMetronome();
                startMetronome();
            }
        });
    }

    if (currentTempoDecrement) {
        currentTempoDecrement.addEventListener('click', () => {
            currentBPM = Math.max(MIN_BPM, currentBPM - 1);
            if (currentTempoInput) currentTempoInput.value = currentBPM;
            updateBPMDisplay();
            if (metronomeEnabled) {
                stopMetronome();
                startMetronome();
            }
        });
    }

    if (tempoTapBtn) {
        tempoTapBtn.addEventListener('click', () => {
            handleTapTempo();
            if (currentTempoInput) currentTempoInput.value = currentBPM;
        });
    }

    // Time signature controls
    if (timeSigNumeratorSelect) {
        timeSigNumeratorSelect.addEventListener('change', (e) => {
            currentTimeSignature.numerator = parseInt(e.target.value);
        });
    }

    if (timeSigDenominatorSelect) {
        timeSigDenominatorSelect.addEventListener('change', (e) => {
            currentTimeSignature.denominator = parseInt(e.target.value);
        });
    }

    // Loop controls
    if (setLoopBtn) {
        setLoopBtn.addEventListener('click', () => {
            transportLoopStart = parseFloat(loopStartInput.value) - 1;
            transportLoopEnd = parseFloat(loopEndInput.value) - 1;
        });
    }

    // Follow playhead
    if (followPlayheadCheckbox) {
        followPlayheadCheckbox.addEventListener('change', (e) => {
            followPlayheadEnabled = e.target.checked;
        });
    }

    // Tempo lane
    if (showTempoLaneBtn) {
        showTempoLaneBtn.addEventListener('click', () => {
            tempoLaneVisible = !tempoLaneVisible;
            if (tempoLaneContainer) {
                tempoLaneContainer.style.display = tempoLaneVisible ? 'block' : 'none';
                showTempoLaneBtn.textContent = tempoLaneVisible ? 'Hide Tempo Lane' : 'Show Tempo Lane';
            }
            if (tempoLaneVisible) {
                drawTempoLane();
            }
        });
    }

    // Tempo lane canvas interaction
    if (tempoLaneCanvas) {
        tempoLaneCanvas.addEventListener('click', (e) => {
            const rect = tempoLaneCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const pixelsPerBar = 80;
            const bar = Math.round(x / pixelsPerBar);

            const height = tempoLaneCanvas.height;
            const bpmRange = MAX_BPM - MIN_BPM;
            const bpm = Math.round(MIN_BPM + (1 - y / height) * bpmRange);

            addTempoPoint(bar, bpm);
        });

        tempoLaneCanvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const rect = tempoLaneCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const pixelsPerBar = 80;
            const bar = Math.round(x / pixelsPerBar);

            // Find and remove tempo point at this bar
            const point = tempoPoints.find(tp => tp.bar === bar);
            if (point && confirm(`Delete tempo point at bar ${bar}?`)) {
                removeTempoPoint(bar);
            }
        });
    }

    // Add tempo point button
    if (addTempoChangeBtn) {
        addTempoChangeBtn.addEventListener('click', () => {
            const currentBar = Math.floor(secondsToBars(transportPosition));
            const bpm = parseInt(prompt(`Add tempo change at bar ${currentBar + 1}:`, currentBPM));
            if (bpm && bpm >= MIN_BPM && bpm <= MAX_BPM) {
                addTempoPoint(currentBar, bpm);
            }
        });
    }

    // Clear tempo points
    if (clearTempoBtn) {
        clearTempoBtn.addEventListener('click', () => {
            if (confirm('Clear all tempo points?')) {
                clearTempoPoints();
            }
        });
    }

    // Clear time signatures
    if (clearTimeSigBtn) {
        clearTimeSigBtn.addEventListener('click', () => {
            if (confirm('Clear all time signature changes?')) {
                clearTimeSigChanges();
            }
        });
    }

    // Add marker button
    if (addMarkerBtn) {
        addMarkerBtn.addEventListener('click', () => {
            const currentBar = Math.floor(secondsToBars(transportPosition));
            const name = prompt('Marker name:', `Marker ${markers.length + 1}`);
            if (name) {
                addMarker(name, currentBar);
            }
        });
    }

    // Timeline playhead scrubbing
    const timelineScrollContainer = document.getElementById('timelineScrollContainer');
    if (timelineScrollContainer) {
        let isDragging = false;

        timelineScrollContainer.addEventListener('mousedown', (e) => {
            if (e.target === timelineScrollContainer || e.target.id === 'timelineCanvas') {
                isDragging = true;
                const rect = timelineScrollContainer.getBoundingClientRect();
                const x = e.clientX - rect.left + timelineScrollContainer.scrollLeft;
                const pixelsPerSecond = 50;
                const seconds = x / pixelsPerSecond;
                scrubPlayhead(seconds);
            }
        });

        timelineScrollContainer.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const rect = timelineScrollContainer.getBoundingClientRect();
                const x = e.clientX - rect.left + timelineScrollContainer.scrollLeft;
                const pixelsPerSecond = 50;
                const seconds = x / pixelsPerSecond;
                scrubPlayhead(seconds);
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch(e.key) {
            case ' ':  // Spacebar
                e.preventDefault();
                if (transportState === TransportState.PLAYING) {
                    transportPause();
                } else {
                    transportPlay();
                }
                break;

            case 'Enter':  // Stop and return to zero
                e.preventDefault();
                transportStop();
                break;

            case 'r':  // Record
            case 'R':
                if (e.shiftKey) {
                    e.preventDefault();
                    transportRecord();
                }
                break;

            case 'l':  // Loop toggle
            case 'L':
                e.preventDefault();
                transportToggleCycle();
                break;

            case 'Home':  // Return to zero
                e.preventDefault();
                transportReturnToZero();
                break;

            case 'ArrowLeft':  // Rewind
                e.preventDefault();
                if (e.shiftKey) {
                    transportRewind();
                } else {
                    // Step back 1/4 note
                    const quarterNote = barsToSeconds(0.25);
                    scrubPlayhead(transportPosition - quarterNote);
                }
                break;

            case 'ArrowRight':  // Fast forward
                e.preventDefault();
                if (e.shiftKey) {
                    transportFastForward();
                } else {
                    // Step forward 1/4 note
                    const quarterNote = barsToSeconds(0.25);
                    scrubPlayhead(transportPosition + quarterNote);
                }
                break;

            case 'm':  // Add marker
            case 'M':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const currentBar = Math.floor(secondsToBars(transportPosition));
                    const name = prompt('Marker name:', `Marker ${markers.length + 1}`);
                    if (name) {
                        addMarker(name, currentBar);
                    }
                }
                break;

            case 't':  // Add tempo point
            case 'T':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const currentBar = Math.floor(secondsToBars(transportPosition));
                    const bpm = parseInt(prompt(`Add tempo change at bar ${currentBar + 1}:`, currentBPM));
                    if (bpm && bpm >= MIN_BPM && bpm <= MAX_BPM) {
                        addTempoPoint(currentBar, bpm);
                    }
                }
                break;
        }
    });

    // Initialize timecode display
    updateTransportTimecode();
    updateTransportUI();

    console.log('Transport system initialized successfully');
}

// Call this in your main window.load event handler
// window.addEventListener('load', () => {
//     initTransportSystem();
// });
