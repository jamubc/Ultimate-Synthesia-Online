/* Ultimate Synthesia Online - Advanced Mode DAW
 * UI layer: transport, browser, arrangement (tracks, clips, automation), device chain,
 * mixer, file menu, keyboard shortcuts and the bridge to the main synth page.
 */
(function () {
    'use strict';
    const DAW = window.DAW;
    const U = DAW.util;
    const E = DAW.engine;

    const HEADER_W = 220;
    const AUTO_H = 72;
    const SNAP_OPTIONS = [['Bar', -1], ['1/2', 2], ['1/4', 1], ['1/8', 0.5], ['1/16', 0.25], ['1/32', 0.125], ['1/4T', 2 / 3], ['1/8T', 1 / 3], ['1/16T', 1 / 6], ['Off', 0]];
    const TIME_SIGS = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [7, 8], [9, 8], [12, 8]];
    const STORAGE_KEY = 'synthDawProject';

    const S = {
        root: null, tab: 'devices', selectedClips: new Set(), editClipId: null,
        selectedStrip: null, clipboard: null, focus: false, bottomH: 320, fullscreen: false,
        meters: [], els: {}, totalBeats: 64, messageTimer: null,
    };
    DAW.ui = { state: S };

    // ------------------------------------------------------------- helpers
    function h(tag, props, ...kids) {
        const el = document.createElement(tag);
        if (props) {
            for (const k in props) {
                const v = props[k];
                if (v == null || v === false) continue;
                if (k === 'class') el.className = v;
                else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
                else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
                else if (k === 'dataset') Object.assign(el.dataset, v);
                else if (k === 'html') el.innerHTML = v;
                else if (k in el && typeof v !== 'string') el[k] = v;
                else el.setAttribute(k, v === true ? '' : v);
            }
        }
        kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; el.appendChild(c.nodeType ? c : document.createTextNode(String(c))); });
        return el;
    }
    DAW.h = h;
    function btn(label, onClick, opts = {}) {
        const b = h('button', Object.assign({ class: 'daw-btn ' + (opts.cls || ''), title: opts.title || '', type: 'button' }, opts.attrs || {}), label);
        b.addEventListener('click', e => { onClick(e); b.blur(); });
        return b;
    }
    // Pointer drag helper: calls move(e) and up(e) until the pointer is released.
    function drag(startEvent, move, up) {
        startEvent.preventDefault();
        const mm = e => move(e);
        const mu = e => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); window.removeEventListener('pointercancel', mu); if (up) up(e); };
        window.addEventListener('pointermove', mm);
        window.addEventListener('pointerup', mu);
        window.addEventListener('pointercancel', mu);
    }
    DAW.drag = drag;
    function closeMenus() { document.querySelectorAll('.daw-menu').forEach(m => m.remove()); }
    function showMenu(x, y, items) {
        closeMenus();
        const m = h('div', { class: 'daw-menu' });
        items.forEach(it => {
            if (it === '-') { m.appendChild(h('div', { class: 'daw-menu-sep' })); return; }
            if (!it) return;
            const row = h('div', { class: 'daw-menu-item' + (it.disabled ? ' disabled' : '') }, h('span', null, it.label), it.key ? h('span', { class: 'daw-menu-key' }, it.key) : null);
            if (!it.disabled) row.addEventListener('click', e => { e.stopPropagation(); closeMenus(); it.action(); });
            m.appendChild(row);
        });
        document.body.appendChild(m);
        const r = m.getBoundingClientRect();
        m.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
        m.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
        setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { closeMenus(); document.removeEventListener('pointerdown', off); } }), 0);
    }
    DAW.showMenu = showMenu;
    function modal(title, body, actions) {
        const back = h('div', { class: 'daw-modal-back' });
        const close = () => back.remove();
        const box = h('div', { class: 'daw-modal' }, h('div', { class: 'daw-modal-title' }, title), body,
            h('div', { class: 'daw-modal-actions' }, (actions || [{ label: 'Close' }]).map(a => btn(a.label, () => { if (!a.action || a.action() !== false) close(); }, { cls: a.primary ? 'primary' : '' }))));
        back.appendChild(box);
        back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
        document.body.appendChild(back);
        return close;
    }
    function message(text, ms = 2500) {
        const el = S.els.status;
        if (!el) return;
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(S.messageTimer);
        S.messageTimer = setTimeout(() => el.classList.remove('show'), ms);
    }
    DAW.message = message;
    function download(blob, name) {
        const a = h('a', { href: URL.createObjectURL(blob), download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    function pickFile(accept, multiple) {
        return new Promise(res => {
            const inp = h('input', { type: 'file', accept, multiple: !!multiple, style: { display: 'none' } });
            inp.addEventListener('change', () => { res(Array.from(inp.files || [])); inp.remove(); });
            document.body.appendChild(inp); inp.click();
        });
    }
    const gainToPos = g => (g <= 0.001 ? 0 : U.clamp((20 * Math.log10(g) + 60) / 66, 0, 1));
    const posToGain = p => (p <= 0.001 ? 0 : Math.pow(10, (p * 66 - 60) / 20));
    const fmtDb = g => { const d = U.gainToDb(g); return d === -Infinity ? '-inf' : (d > 0 ? '+' : '') + d.toFixed(1); };
    const fmtPan = p => (Math.abs(p) < 0.01 ? 'C' : (p < 0 ? Math.round(-p * 50) + 'L' : Math.round(p * 50) + 'R'));
    DAW.fmt = { gainToPos, posToGain, fmtDb, fmtPan };
    function fmtValue(def, v) {
        if (def.unit === 'note') return U.noteName(Math.round(v));
        if (def.unit === 'Hz') return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + 'k' : v.toFixed(0) + 'Hz';
        if (def.unit === 's') return v < 1 ? (v * 1000).toFixed(v < 0.01 ? 1 : 0) + 'ms' : v.toFixed(2) + 's';
        const digits = def.step >= 1 ? 0 : def.step >= 0.1 ? 1 : 2;
        return v.toFixed(digits) + (def.unit ? (def.unit === ':1' ? ':1' : ' ' + def.unit) : '');
    }
    function snapBeats() { const s = E.project.snap; return s === -1 ? E.beatsPerBar() : s; }
    function snap(b, force) { const s = snapBeats(); if (!s || force === false) return b; return Math.round(b / s) * s; }
    function snapFloor(b) { const s = snapBeats(); if (!s) return b; return Math.floor(b / s + 1e-9) * s; }
    DAW.snap = { snapBeats, snap, snapFloor };
    function fmtPos(b) {
        const proj = E.project, bpb = E.beatsPerBar(), unit = 4 / proj.timeSig[1];
        const neg = b < 0; const ab = Math.abs(b);
        const bar = Math.floor(ab / bpb) + 1, beat = Math.floor((ab % bpb) / unit) + 1, six = Math.floor((ab % unit) / (unit / 4)) + 1;
        return (neg ? '-' : '') + bar + '.' + beat + '.' + six;
    }
    function fmtTime(b) {
        const t = Math.max(0, b) * E.spb();
        const m = Math.floor(t / 60), s = t - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
    }

    // ----------------------------------------------------- mutation helpers
    let autosaveTimer = null;
    function autosave() {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(E.project)); } catch (e) { /* quota */ }
        }, 800);
    }
    function changed(opts = {}) {
        E.sync();
        if (!opts.noRender) render();
        autosave();
    }
    function mutate(label, fn, opts) {
        DAW.history.push(label);
        fn();
        changed(opts);
    }
    DAW.mutate = mutate;
    DAW.changed = changed;

    function selectedTrack() { return DAW.findTrack(E.project, E.selectedTrackId); }
    function selectTrack(id, opts = {}) {
        if (E.selectedTrackId === id && S.selectedStrip === id) return;
        E.selectedTrackId = id;
        S.selectedStrip = id;
        if (!opts.noRender) refreshSelection();
    }
    // Updates selection highlighting without rebuilding the arrangement (keeps double-click working).
    function refreshSelection() {
        const inner = S.els.arrangeInner;
        if (!inner) return;
        inner.querySelectorAll('.daw-track-row[data-track-id]').forEach(r => {
            const on = r.dataset.trackId === E.selectedTrackId;
            r.classList.toggle('selected', on);
            const hd = r.querySelector('.daw-track-header');
            if (hd) hd.classList.toggle('selected', on);
        });
        inner.querySelectorAll('.daw-clip').forEach(c => {
            c.classList.toggle('selected', S.selectedClips.has(c.dataset.clipId));
            c.classList.toggle('editing', c.dataset.clipId === S.editClipId);
        });
        renderBottom();
        updatePlayhead(true);
    }
    function allClips() { const out = []; E.project.tracks.forEach(t => t.clips.forEach(c => out.push({ track: t, clip: c }))); return out; }
    function findClip(id) { for (const t of E.project.tracks) { const c = t.clips.find(x => x.id === id); if (c) return { track: t, clip: c }; } return null; }
    DAW.findClip = findClip;

    // ----------------------------------------------------------- param UI
    function paramControl(def, value, onChange, opts = {}) {
        const wrap = h('div', { class: 'daw-param' + (def.type ? ' ' + def.type : '') });
        const label = h('label', { title: def.name }, def.name);
        wrap.appendChild(label);
        const begin = () => { if (opts.history !== false) DAW.history.push('Edit ' + def.name); };
        if (def.type === 'select') {
            const sel = h('select', null, def.options.map(o => h('option', { value: o, selected: String(o) === String(value) }, o)));
            sel.addEventListener('change', () => { begin(); onChange(sel.value, true); });
            wrap.appendChild(sel);
        } else if (def.type === 'toggle') {
            const b = btn(value ? 'On' : 'Off', () => { begin(); const nv = b.classList.contains('on') ? 0 : 1; b.classList.toggle('on', !!nv); b.textContent = nv ? 'On' : 'Off'; onChange(nv, true); }, { cls: 'toggle' + (value ? ' on' : '') });
            wrap.appendChild(b);
        } else if (def.type === 'sample') {
            const entry = DAW.audioPool.get(value);
            wrap.appendChild(h('div', { class: 'daw-sample-row' },
                h('span', { class: 'daw-sample-name' }, entry ? entry.name : '(no sample)'),
                btn('Load…', async () => {
                    const files = await pickFile('audio/*');
                    if (!files.length) return;
                    try {
                        const buf = await E.ctx.decodeAudioData(await files[0].arrayBuffer());
                        const id = DAW.addToPool(buf, files[0].name);
                        begin(); onChange(id, true); render();
                    } catch (e) { message('Could not decode ' + files[0].name); }
                })));
        } else {
            const toS = v => (def.log ? Math.log(v / def.min) / Math.log(def.max / def.min) : (v - def.min) / (def.max - def.min)) * 1000;
            const fromS = s => {
                const x = s / 1000;
                let v = def.log ? def.min * Math.pow(def.max / def.min, x) : def.min + x * (def.max - def.min);
                if (!def.log && def.step) v = Math.round(v / def.step) * def.step;
                if (def.log) v = parseFloat(v.toPrecision(4));
                return U.clamp(v, def.min, def.max);
            };
            const range = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: toS(value) });
            const val = h('span', { class: 'daw-param-val' }, fmtValue(def, value));
            range.addEventListener('pointerdown', begin);
            range.addEventListener('input', () => { const v = fromS(parseFloat(range.value)); val.textContent = fmtValue(def, v); onChange(v, false); });
            range.addEventListener('change', () => { onChange(fromS(parseFloat(range.value)), true); });
            range.addEventListener('dblclick', () => { begin(); range.value = toS(def.def); val.textContent = fmtValue(def, def.def); onChange(def.def, true); });
            label.appendChild(val);
            wrap.appendChild(range);
        }
        return wrap;
    }
    DAW.paramControl = paramControl;

    // Custom fader (vertical for the mixer, horizontal for track headers).
    function fader({ value, toPos, fromPos, vertical, def, onChange, title, cls, label }) {
        const fill = h('div', { class: 'daw-fader-fill' }), thumb = h('div', { class: 'daw-fader-thumb' });
        const el = h('div', { class: 'daw-fader ' + (vertical ? 'vertical ' : 'horizontal ') + (cls || ''), title: title || '' }, fill, thumb);
        const set = v => {
            const p = U.clamp(toPos(v), 0, 1) * 100;
            if (vertical) { fill.style.height = p + '%'; thumb.style.bottom = `calc(${p}% - 5px)`; }
            else { fill.style.width = p + '%'; thumb.style.left = `calc(${p}% - 5px)`; }
            if (label) label(v);
        };
        set(value);
        const posFromEvent = e => {
            const r = el.getBoundingClientRect();
            return U.clamp(vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width, 0, 1);
        };
        el.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.stopPropagation();
            DAW.history.push(title || 'Fader');
            const startPos = toPos(value), startC = vertical ? e.clientY : e.clientX;
            const fine = e.shiftKey;
            const apply = ev => {
                let p;
                if (fine) { const d = (vertical ? startC - ev.clientY : ev.clientX - startC) / 600; p = U.clamp(startPos + d, 0, 1); }
                else p = posFromEvent(ev);
                value = fromPos(p); set(value); onChange(value, false);
            };
            if (!fine) apply(e);
            drag(e, apply, () => onChange(value, true));
        });
        el.addEventListener('dblclick', e => { e.stopPropagation(); DAW.history.push(title || 'Fader'); value = def; set(def); onChange(def, true); });
        el.addEventListener('wheel', e => {
            e.preventDefault();
            const p = U.clamp(toPos(value) - Math.sign(e.deltaY) * 0.01, 0, 1);
            value = fromPos(p); set(value); onChange(value, true);
        }, { passive: false });
        el.setValue = v => { value = v; set(v); };
        return el;
    }
    DAW.fader = fader;
    const volFader = (st, opts = {}) => fader(Object.assign({
        value: st.volume, toPos: gainToPos, fromPos: posToGain, def: 0.8, title: 'Volume',
        onChange: (v, fin) => { st.volume = v; changed({ noRender: true }); if (fin) render(); },
    }, opts));
    const panFader = (st, opts = {}) => fader(Object.assign({
        value: st.pan, toPos: v => (v + 1) / 2, fromPos: p => { const v = p * 2 - 1; return Math.abs(v) < 0.03 ? 0 : v; }, def: 0, title: 'Pan', cls: 'pan',
        onChange: (v, fin) => { st.pan = v; changed({ noRender: true }); if (fin) render(); },
    }, opts));

    // ---------------------------------------------------------------- layout
    function build(rootEl) {
        S.root = rootEl;
        rootEl.classList.add('daw');
        rootEl.innerHTML = '';
        const els = S.els;
        els.transport = h('div', { class: 'daw-transport' });
        els.browser = h('aside', { class: 'daw-browser' });
        els.arrangeScroll = h('div', { class: 'daw-arrange-scroll' });
        els.arrangeInner = h('div', { class: 'daw-arrange-inner' });
        els.arrangeScroll.appendChild(els.arrangeInner);
        els.arrange = h('div', { class: 'daw-arrange' }, els.arrangeScroll);
        els.main = h('div', { class: 'daw-main' }, els.browser, els.arrange);
        els.resizer = h('div', { class: 'daw-resizer', title: 'Drag to resize' });
        els.tabs = h('div', { class: 'daw-tabs' });
        els.bottomBody = h('div', { class: 'daw-bottom-body' });
        els.bottom = h('div', { class: 'daw-bottom' }, els.tabs, els.bottomBody);
        els.status = h('div', { class: 'daw-status' });
        rootEl.append(els.transport, els.main, els.resizer, els.bottom, els.status);
        els.bottom.style.height = S.bottomH + 'px';

        els.resizer.addEventListener('pointerdown', e => {
            const startY = e.clientY, startH = S.bottomH;
            drag(e, ev => { S.bottomH = U.clamp(startH - (ev.clientY - startY), 120, window.innerHeight * 0.8); els.bottom.style.height = S.bottomH + 'px'; });
        });
        rootEl.addEventListener('pointerdown', () => { S.focus = true; }, true);
        // Drop focus from dropdowns after a choice so the note keys keep playing notes.
        rootEl.addEventListener('change', e => { if (e.target.tagName === 'SELECT') e.target.blur(); });
        document.addEventListener('pointerdown', e => { if (!rootEl.contains(e.target) && !e.target.closest('.daw-menu, .daw-modal-back')) S.focus = false; }, true);

        // Drag & drop of audio / MIDI / project files anywhere on the DAW.
        rootEl.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); rootEl.classList.add('drop'); } });
        rootEl.addEventListener('dragleave', e => { if (e.target === rootEl) rootEl.classList.remove('drop'); });
        rootEl.addEventListener('drop', e => {
            if (!e.dataTransfer || !e.dataTransfer.files.length) return;
            e.preventDefault(); rootEl.classList.remove('drop');
            const lane = e.target.closest && e.target.closest('.daw-lane');
            let beat = E.position, trackId = null;
            if (lane) { const r = lane.getBoundingClientRect(); beat = snapFloor(Math.max(0, (e.clientX - r.left) / E.project.zoom)); trackId = lane.dataset.trackId; }
            importFiles(Array.from(e.dataTransfer.files), beat, trackId);
        });
        buildTransport();
        buildBrowser();
        render();
    }

    // ------------------------------------------------------------- transport
    function buildTransport() {
        const t = S.els.transport;
        t.innerHTML = '';
        const proj = () => E.project;
        const els = S.els;
        els.btnStart = btn('⏮', () => E.seek(0), { title: 'Return to start (Home)' });
        els.btnPlay = btn('▶', () => togglePlay(), { title: 'Play / Pause (Space)', cls: 'play' });
        els.btnStop = btn('■', () => { E.stop(); }, { title: 'Stop (press twice to return to start)' });
        els.btnRec = btn('●', () => { E.record(); render(); }, { title: 'Record (R) - records onto armed tracks, or the selected track', cls: 'rec' });
        els.btnLoop = btn('⟳', () => { mutate('Toggle loop', () => { proj().loop.enabled = !proj().loop.enabled; }); }, { title: 'Loop on/off (L)' });
        els.btnMetro = btn('♩', () => { proj().metronome = !proj().metronome; changed(); }, { title: 'Metronome (C)' });
        els.btnCountIn = btn('1-2', () => { proj().countIn = !proj().countIn; changed(); }, { title: 'Count-in one bar before recording' });
        els.btnFollow = btn('⇥', () => { proj().followPlayhead = !proj().followPlayhead; changed(); }, { title: 'Follow playhead' });
        els.pos = h('div', { class: 'daw-pos', title: 'Bars.Beats.Sixteenths' }, '1.1.1');
        els.time = h('div', { class: 'daw-time', title: 'Minutes:Seconds' }, '0:00.000');
        els.bpm = h('input', { type: 'number', class: 'daw-bpm', min: 20, max: 300, step: 0.1, title: 'Tempo (BPM)' });
        els.bpm.addEventListener('change', () => {
            const v = U.clamp(parseFloat(els.bpm.value) || 120, 20, 300);
            setBpm(v);
        });
        els.tap = btn('Tap', tapTempo, { title: 'Tap tempo' });
        els.sig = h('select', { class: 'daw-sig', title: 'Time signature' }, TIME_SIGS.map(s => h('option', { value: s.join('/') }, s.join('/'))));
        els.sig.addEventListener('change', () => mutate('Time signature', () => { proj().timeSig = els.sig.value.split('/').map(Number); }));
        els.snapSel = h('select', { class: 'daw-snap', title: 'Grid / snap' }, SNAP_OPTIONS.map(([n, v]) => h('option', { value: v }, n)));
        els.snapSel.addEventListener('change', () => { proj().snap = parseFloat(els.snapSel.value); changed(); });
        els.recQ = h('select', { class: 'daw-recq', title: 'Record quantize' }, [['Rec Q: Off', 'off'], ['Rec Q: 1/4', '1'], ['Rec Q: 1/8', '0.5'], ['Rec Q: 1/16', '0.25'], ['Rec Q: 1/32', '0.125']].map(([n, v]) => h('option', { value: v }, n)));
        els.recQ.addEventListener('change', () => { proj().recQuantize = els.recQ.value; changed(); });
        els.undo = btn('↶', () => doUndo(), { title: 'Undo (Ctrl+Z)' });
        els.redo = btn('↷', () => doRedo(), { title: 'Redo (Ctrl+Shift+Z / Ctrl+Y)' });
        els.cpu = h('div', { class: 'daw-cpu', title: 'Audio engine state' });
        const fileBtn = btn('File ▾', e => fileMenu(e.currentTarget), { title: 'Project, import and export' });
        const editBtn = btn('Edit ▾', e => editMenu(e.currentTarget), { title: 'Edit commands' });
        els.fs = btn('⛶', () => toggleFullscreen(), { title: 'Maximise DAW (F11-style)' });
        const help = btn('?', showHelp, { title: 'Keyboard shortcuts & help' });
        els.projName = h('input', { class: 'daw-projname', type: 'text', title: 'Song name' });
        els.projName.addEventListener('change', () => { proj().name = els.projName.value || 'Untitled Song'; changed(); });
        t.append(
            h('div', { class: 'daw-group' }, fileBtn, editBtn, els.projName),
            h('div', { class: 'daw-group transport-buttons' }, els.btnStart, els.btnStop, els.btnPlay, els.btnRec, els.btnLoop, els.btnMetro, els.btnCountIn, els.btnFollow),
            h('div', { class: 'daw-group lcd' }, els.pos, els.time),
            h('div', { class: 'daw-group' }, h('span', { class: 'daw-lbl' }, 'BPM'), els.bpm, els.tap, els.sig),
            h('div', { class: 'daw-group' }, h('span', { class: 'daw-lbl' }, 'Grid'), els.snapSel, els.recQ),
            h('div', { class: 'daw-group' }, els.undo, els.redo, els.cpu, els.fs, help),
        );
    }
    function renderTransport() {
        const p = E.project, els = S.els;
        els.btnPlay.classList.toggle('active', E.playing);
        els.btnPlay.textContent = E.playing ? '❚❚' : '▶';
        els.btnRec.classList.toggle('active', E.recording);
        els.btnLoop.classList.toggle('active', p.loop.enabled);
        els.btnMetro.classList.toggle('active', p.metronome);
        els.btnCountIn.classList.toggle('active', p.countIn);
        els.btnFollow.classList.toggle('active', p.followPlayhead);
        if (document.activeElement !== els.bpm) els.bpm.value = p.bpm;
        els.sig.value = p.timeSig.join('/');
        els.snapSel.value = String(p.snap);
        if (els.snapSel.value !== String(p.snap)) els.snapSel.value = '0.25';
        els.recQ.value = p.recQuantize;
        if (document.activeElement !== els.projName) els.projName.value = p.name;
        els.undo.disabled = !DAW.history.undoStack.length;
        els.redo.disabled = !DAW.history.redoStack.length;
    }
    function togglePlay() {
        if (E.playing) E.stop(); else E.play();
    }
    function setBpm(v) {
        mutate('Tempo', () => { E.project.bpm = Math.round(v * 100) / 100; });
        if (E.playing) E.play(E.currentBeat());
        // Keep the main panel metronome in step with the song tempo.
        try { if (typeof currentBPM !== 'undefined') { currentBPM = Math.round(v); if (typeof updateBPMDisplay === 'function') updateBPMDisplay(); } } catch (e) { /* main panel not present */ }
    }
    const taps = [];
    function tapTempo() {
        const now = performance.now();
        if (taps.length && now - taps[taps.length - 1] > 2500) taps.length = 0;
        taps.push(now); if (taps.length > 6) taps.shift();
        if (taps.length >= 2) {
            const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
            setBpm(U.clamp(60000 / avg, 20, 300));
        }
    }
    function doUndo() { const l = DAW.history.undo(); if (l) message('Undo: ' + l); render(); autosave(); }
    function doRedo() { const l = DAW.history.redo(); if (l) message('Redo: ' + l); render(); autosave(); }
    function toggleFullscreen() {
        S.fullscreen = !S.fullscreen;
        S.root.classList.toggle('fullscreen', S.fullscreen);
        document.body.classList.toggle('daw-fullscreen', S.fullscreen);
        S.els.fs.classList.toggle('active', S.fullscreen);
    }

    // --------------------------------------------------------------- browser
    function buildBrowser() {
        const b = S.els.browser;
        b.innerHTML = '';
        const sec = (title, kids, open = true) => {
            const d = h('details', { class: 'daw-browser-sec', open }, h('summary', null, title), kids);
            return d;
        };
        const addTrackRow = h('div', { class: 'daw-browser-actions' },
            btn('+ Instrument Track', () => addTrack('instrument')),
            btn('+ Audio Track', () => addTrack('audio')),
            btn('Import Audio…', async () => { const f = await pickFile('audio/*', true); if (f.length) importFiles(f, E.position, null); }),
            btn('Import MIDI…', async () => { const f = await pickFile('.mid,.midi,audio/midi', true); if (f.length) importFiles(f, 0, null); }));
        const insts = Object.keys(DAW.INSTRUMENTS).map(type => {
            const def = DAW.INSTRUMENTS[type];
            return h('details', { class: 'daw-browser-item' },
                h('summary', { title: def.description, draggable: 'true', ondragstart: e => e.dataTransfer.setData('text/daw-instrument', type) }, def.name),
                h('div', { class: 'daw-browser-presets' }, Object.keys(def.presets).map(pn => h('div', {
                    class: 'daw-browser-preset', title: 'Click: load on selected track · Double-click: new track',
                    onclick: () => loadInstrumentOnSelected(type, pn), ondblclick: () => addTrack('instrument', type, pn),
                }, pn))));
        });
        const cats = {};
        Object.keys(DAW.PLUGINS).forEach(type => { const c = DAW.PLUGINS[type].category; (cats[c] = cats[c] || []).push(type); });
        const fx = Object.keys(cats).map(c => h('div', { class: 'daw-browser-cat' }, h('div', { class: 'daw-browser-cat-title' }, c),
            cats[c].map(type => h('div', {
                class: 'daw-browser-plugin', title: DAW.PLUGINS[type].description + '\nClick to add to the selected track / bus.',
                draggable: 'true', ondragstart: e => e.dataTransfer.setData('text/daw-plugin', type),
                onclick: () => addPluginTo(S.selectedStrip || E.selectedTrackId, type),
            }, DAW.PLUGINS[type].name))));
        b.append(
            sec('Tracks & Files', addTrackRow),
            sec('Instruments', insts),
            sec('Audio Effects (Plugins)', fx),
            h('div', { class: 'daw-browser-tip' }, 'Tip: drag an instrument or plugin onto a track header. Drop audio / MIDI files on the timeline.'),
        );
    }
    function addTrack(type, inst, preset) {
        mutate('Add track', () => {
            const idx = E.project.tracks.length;
            const def = inst ? DAW.INSTRUMENTS[inst] : null;
            const t = DAW.newTrack(type, { index: idx, instrument: inst || 'synth', preset, name: type === 'audio' ? 'Audio ' + (E.project.tracks.filter(x => x.type === 'audio').length + 1) : (preset || (def ? def.name : 'Synth')) });
            const sel = E.project.tracks.findIndex(x => x.id === E.selectedTrackId);
            E.project.tracks.splice(sel >= 0 ? sel + 1 : idx, 0, t);
            E.selectedTrackId = t.id; S.selectedStrip = t.id;
        });
    }
    function loadInstrumentOnSelected(type, preset) {
        const t = selectedTrack();
        if (!t || t.type !== 'instrument') { addTrack('instrument', type, preset); return; }
        mutate('Load instrument', () => { t.instrument = DAW.newInstrument(type, preset); });
        S.tab = 'devices'; render();
        message(`Loaded ${DAW.INSTRUMENTS[type].name} – ${preset} on ${t.name}`);
    }
    function addPluginTo(stripId, type, preset) {
        const st = DAW.findStripState(E.project, stripId || 'master');
        if (!st) return;
        mutate('Add ' + DAW.PLUGINS[type].name, () => { st.plugins.push(DAW.newPlugin(type, preset)); });
        S.selectedStrip = st.id; S.tab = 'devices'; render();
        message(`Added ${DAW.PLUGINS[type].name} to ${st.name}`);
    }
    DAW.addPluginTo = addPluginTo;

    // --------------------------------------------------------------- arrange
    function gridBackground(z) {
        const bpb = E.beatsPerBar();
        const sb = snapBeats();
        const imgs = ['linear-gradient(to right, var(--daw-grid-bar) 1px, transparent 1px)', 'linear-gradient(to right, var(--daw-grid-beat) 1px, transparent 1px)'];
        const sizes = [bpb * z + 'px 100%', z + 'px 100%'];
        if (sb > 0 && sb < 1 && sb * z >= 10) { imgs.push('linear-gradient(to right, var(--daw-grid-sub) 1px, transparent 1px)'); sizes.push(sb * z + 'px 100%'); }
        return { backgroundImage: imgs.join(','), backgroundSize: sizes.join(',') };
    }
    function renderArrange() {
        const proj = E.project, z = proj.zoom, bpb = E.beatsPerBar();
        const end = Math.max(DAW.songEndBeat(proj), proj.loop.end, E.position, proj.markers.reduce((m, k) => Math.max(m, k.b), 0));
        S.totalBeats = Math.max(proj.length, Math.ceil((end + bpb * 8) / bpb) * bpb);
        const inner = S.els.arrangeInner;
        inner.innerHTML = '';
        inner.style.width = HEADER_W + S.totalBeats * z + 'px';
        S.meters = S.meters.filter(m => m.kind !== 'track');
        inner.appendChild(renderRuler());
        proj.tracks.forEach((t, i) => {
            inner.appendChild(trackRow(t, i));
            if (t.automation.show) inner.appendChild(automationRow(t));
        });
        inner.appendChild(h('div', { class: 'daw-track-row add-row' },
            h('div', { class: 'daw-track-header add' }, btn('+ Instrument', () => addTrack('instrument')), btn('+ Audio', () => addTrack('audio'))),
            h('div', { class: 'daw-lane empty', style: gridBackground(z), ondblclick: () => addTrack('instrument') })));
        S.els.playhead = h('div', { class: 'daw-playhead' });
        inner.appendChild(S.els.playhead);
        updatePlayhead(true);
    }

    function renderRuler() {
        const proj = E.project, z = proj.zoom, bpb = E.beatsPerBar();
        const ruler = h('div', { class: 'daw-ruler' });
        const loopStrip = h('div', { class: 'daw-loop-strip', title: 'Drag to set the loop region' });
        const timeStrip = h('div', { class: 'daw-time-strip', title: 'Click to move the playhead, drag to scrub' });
        ruler.append(loopStrip, timeStrip);
        let every = 1;
        while (bpb * z * every < 36) every *= 2;
        for (let b = 0, bar = 1; b < S.totalBeats; b += bpb, bar++) {
            if ((bar - 1) % every) continue;
            timeStrip.appendChild(h('div', { class: 'daw-bar-label', style: { left: b * z + 'px' } }, String(bar)));
        }
        // Loop region.
        const lr = h('div', { class: 'daw-loop-region' + (proj.loop.enabled ? ' on' : ''), style: { left: proj.loop.start * z + 'px', width: (proj.loop.end - proj.loop.start) * z + 'px' } },
            h('div', { class: 'daw-loop-handle l' }), h('div', { class: 'daw-loop-handle r' }));
        loopStrip.appendChild(lr);
        loopStrip.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            const r = loopStrip.getBoundingClientRect();
            const beatAt = ev => Math.max(0, (ev.clientX - r.left) / z);
            const orig = Object.assign({}, proj.loop);
            DAW.history.push('Loop region');
            let mode;
            if (e.target.classList.contains('l')) mode = 'l';
            else if (e.target.classList.contains('r')) mode = 'r';
            else if (e.target === lr) mode = 'move';
            else mode = 'new';
            const b0 = beatAt(e);
            drag(e, ev => {
                const b = beatAt(ev), sb = snapBeats() || 0.25;
                if (mode === 'l') proj.loop.start = Math.min(snap(b), orig.end - sb);
                else if (mode === 'r') proj.loop.end = Math.max(snap(b), orig.start + sb);
                else if (mode === 'move') { const d = snap(b - b0); const len = orig.end - orig.start; proj.loop.start = Math.max(0, orig.start + d); proj.loop.end = proj.loop.start + len; }
                else { const a = snap(Math.min(b0, b)), c = snap(Math.max(b0, b)); if (c - a >= sb) { proj.loop.start = a; proj.loop.end = c; proj.loop.enabled = true; } }
                lr.style.left = proj.loop.start * z + 'px'; lr.style.width = (proj.loop.end - proj.loop.start) * z + 'px';
                lr.classList.toggle('on', proj.loop.enabled);
            }, () => changed());
        });
        timeStrip.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target.closest('.daw-marker')) return;
            const r = timeStrip.getBoundingClientRect();
            const at = ev => snap(Math.max(0, (ev.clientX - r.left) / z));
            E.seek(at(e));
            updatePlayhead(true);
            drag(e, ev => { E.position = at(ev); if (!E.playing) updatePlayhead(true); }, ev => { if (E.playing) E.seek(at(ev)); });
        });
        timeStrip.addEventListener('contextmenu', e => {
            e.preventDefault();
            const r = timeStrip.getBoundingClientRect();
            const b = snap(Math.max(0, (e.clientX - r.left) / z));
            showMenu(e.clientX, e.clientY, [
                { label: 'Add marker here', action: () => addMarker(b) },
                { label: 'Set loop start here', action: () => mutate('Loop start', () => { proj.loop.start = Math.min(b, proj.loop.end - 0.25); }) },
                { label: 'Set loop end here', action: () => mutate('Loop end', () => { proj.loop.end = Math.max(b, proj.loop.start + 0.25); }) },
            ]);
        });
        // Markers.
        proj.markers.forEach(m => {
            const mk = h('div', { class: 'daw-marker', style: { left: m.b * z + 'px' }, title: m.name + ' – click to jump, drag to move, right-click for options' }, m.name);
            mk.addEventListener('pointerdown', e => {
                if (e.button !== 0) return;
                e.stopPropagation();
                const r = timeStrip.getBoundingClientRect(); let moved = false; const x0 = e.clientX;
                drag(e, ev => {
                    if (!moved && Math.abs(ev.clientX - x0) < 4) return;
                    if (!moved) { DAW.history.push('Move marker'); moved = true; }
                    m.b = snap(Math.max(0, (ev.clientX - r.left) / z)); mk.style.left = m.b * z + 'px';
                }, () => { if (moved) changed(); else E.seek(m.b); });
            });
            mk.addEventListener('contextmenu', e => {
                e.preventDefault(); e.stopPropagation();
                showMenu(e.clientX, e.clientY, [
                    { label: 'Rename marker…', action: () => { const n = prompt('Marker name', m.name); if (n) mutate('Rename marker', () => { m.name = n; }); } },
                    { label: 'Delete marker', action: () => mutate('Delete marker', () => { proj.markers = proj.markers.filter(x => x !== m); }) },
                ]);
            });
            timeStrip.appendChild(mk);
        });
        const corner = h('div', { class: 'daw-ruler-corner' },
            h('span', null, 'Zoom'),
            btn('−', () => setZoom(proj.zoom / 1.4), { title: 'Zoom out (-)' }),
            btn('+', () => setZoom(proj.zoom * 1.4), { title: 'Zoom in (=)' }),
            btn('⚑', () => addMarker(snap(E.currentBeat())), { title: 'Add marker at playhead' }));
        return h('div', { class: 'daw-ruler-row' }, corner, ruler);
    }
    function addMarker(b) {
        mutate('Add marker', () => { E.project.markers.push({ id: U.uid('mk'), b, name: 'Marker ' + (E.project.markers.length + 1) }); E.project.markers.sort((a, c) => a.b - c.b); });
    }
    function setZoom(z) {
        const sc = S.els.arrangeScroll;
        const centerBeat = (sc.scrollLeft + sc.clientWidth / 2 - HEADER_W) / E.project.zoom;
        E.project.zoom = U.clamp(z, 4, 400);
        renderArrange();
        sc.scrollLeft = Math.max(0, centerBeat * E.project.zoom - sc.clientWidth / 2 + HEADER_W);
        autosave();
    }

    function trackRow(t, index) {
        const proj = E.project, z = proj.zoom;
        const sel = t.id === E.selectedTrackId;
        const row = h('div', { class: 'daw-track-row' + (sel ? ' selected' : ''), dataset: { trackId: t.id }, style: { height: t.height + 'px' } });
        row.appendChild(trackHeader(t, index));
        const lane = h('div', { class: 'daw-lane ' + t.type, dataset: { trackId: t.id }, style: gridBackground(z) });
        t.clips.forEach(c => lane.appendChild(clipEl(t, c)));
        lane.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target !== lane) return;
            if (!e.shiftKey) S.selectedClips.clear();
            selectTrack(t.id, { noRender: true });
            const r = lane.getBoundingClientRect();
            const b = snapFloor(Math.max(0, (e.clientX - r.left) / z));
            if (!E.playing) E.position = b;
            refreshSelection();
        });
        lane.addEventListener('dblclick', e => {
            if (e.target !== lane) return;
            const r = lane.getBoundingClientRect();
            const bpb = E.beatsPerBar();
            const b = Math.floor(Math.max(0, (e.clientX - r.left) / z) / bpb) * bpb;
            if (t.type === 'instrument') createMidiClip(t, b, bpb);
            else pickFile('audio/*', true).then(f => f.length && importFiles(f, b, t.id));
        });
        lane.addEventListener('contextmenu', e => {
            if (e.target !== lane) return;
            e.preventDefault();
            const r = lane.getBoundingClientRect();
            const b = snapFloor(Math.max(0, (e.clientX - r.left) / z));
            showMenu(e.clientX, e.clientY, [
                t.type === 'instrument' ? { label: 'Create MIDI clip', action: () => createMidiClip(t, Math.floor(b / E.beatsPerBar()) * E.beatsPerBar(), E.beatsPerBar()) } : { label: 'Import audio here…', action: () => pickFile('audio/*', true).then(f => f.length && importFiles(f, b, t.id)) },
                { label: 'Paste', key: 'Ctrl+V', disabled: !S.clipboard, action: () => pasteClips(t.id, b) },
                { label: 'Set playhead here', action: () => E.seek(b) },
            ]);
        });
        row.appendChild(lane);
        return row;
    }

    function trackHeader(t, index) {
        const sel = t.id === E.selectedTrackId;
        const hd = h('div', { class: 'daw-track-header' + (sel ? ' selected' : ''), style: { '--track-color': t.color } });
        const name = h('div', { class: 'daw-track-name', title: 'Double-click to rename' }, t.name);
        name.addEventListener('dblclick', e => { e.stopPropagation(); renameTrack(t); });
        const instName = t.type === 'instrument' ? DAW.INSTRUMENTS[t.instrument.type].name : 'Audio';
        const m = btn('M', () => mutate('Mute', () => { t.mute = !t.mute; }), { cls: 'mute' + (t.mute ? ' active' : ''), title: 'Mute (M)' });
        const s = btn('S', e => mutate('Solo', () => { if (!e.ctrlKey && !e.metaKey) E.project.tracks.forEach(x => { if (x !== t) x.solo = false; }); t.solo = !t.solo; }), { cls: 'solo' + (t.solo ? ' active' : ''), title: 'Solo (Ctrl+click for multi-solo)' });
        const a = btn('●', () => mutate('Arm', () => { t.arm = !t.arm; }), { cls: 'arm' + (t.arm ? ' active' : ''), title: t.type === 'audio' ? 'Arm for microphone recording' : 'Arm for MIDI recording' });
        const au = btn('A', () => { t.automation.show = !t.automation.show; changed(); }, { cls: 'auto' + (t.automation.show ? ' active' : ''), title: 'Show automation lane' });
        const meter = h('div', { class: 'daw-track-meter' }, h('div', { class: 'daw-track-meter-fill' }));
        S.meters.push({ kind: 'track', id: t.id, el: meter.firstChild });
        const vol = volFader(t, { cls: 'mini', label: null });
        const pan = panFader(t, { cls: 'mini pan' });
        hd.append(
            h('div', { class: 'daw-track-color' }),
            h('div', { class: 'daw-track-main' },
                h('div', { class: 'daw-track-top' }, h('span', { class: 'daw-track-num' }, String(index + 1)), name),
                h('div', { class: 'daw-track-inst', title: 'Click to open the device chain' }, (t.type === 'instrument' ? '🎹 ' : '🎤 ') + instName + (t.plugins.length ? ` · ${t.plugins.length} fx` : '')),
                h('div', { class: 'daw-track-btns' }, m, s, a, au),
                t.height >= 64 ? h('div', { class: 'daw-track-faders' }, vol, pan) : null),
            meter);
        hd.addEventListener('pointerdown', e => { if (e.button === 0 && !e.target.closest('button, .daw-fader')) { selectTrack(t.id); } });
        hd.querySelector('.daw-track-inst').addEventListener('click', () => { selectTrack(t.id, { noRender: true }); S.tab = 'devices'; render(); });
        hd.addEventListener('contextmenu', e => { e.preventDefault(); trackMenu(t, e.clientX, e.clientY); });
        hd.addEventListener('dragover', e => { const ty = Array.from(e.dataTransfer.types); if (ty.includes('text/daw-plugin') || ty.includes('text/daw-instrument')) { e.preventDefault(); hd.classList.add('drop'); } });
        hd.addEventListener('dragleave', () => hd.classList.remove('drop'));
        hd.addEventListener('drop', e => {
            hd.classList.remove('drop');
            const pl = e.dataTransfer.getData('text/daw-plugin'), ins = e.dataTransfer.getData('text/daw-instrument');
            if (pl) { e.preventDefault(); e.stopPropagation(); addPluginTo(t.id, pl); }
            else if (ins && t.type === 'instrument') { e.preventDefault(); e.stopPropagation(); selectTrack(t.id, { noRender: true }); loadInstrumentOnSelected(ins, Object.keys(DAW.INSTRUMENTS[ins].presets)[0]); }
        });
        // Bottom edge resizes the track height.
        const rz = h('div', { class: 'daw-track-resize', title: 'Drag to resize track' });
        rz.addEventListener('pointerdown', e => {
            e.stopPropagation();
            const y0 = e.clientY, h0 = t.height;
            const row = hd.parentElement;
            drag(e, ev => { t.height = U.clamp(Math.round(h0 + ev.clientY - y0), 36, 240); row.style.height = t.height + 'px'; }, () => changed());
        });
        hd.appendChild(rz);
        return hd;
    }
    function renameTrack(t) {
        const n = prompt('Track name', t.name);
        if (n && n.trim()) mutate('Rename track', () => { t.name = n.trim(); });
    }
    function trackMenu(t, x, y) {
        const proj = E.project, i = proj.tracks.indexOf(t);
        showMenu(x, y, [
            { label: 'Rename…', action: () => renameTrack(t) },
            { label: 'Change color', action: () => mutate('Track color', () => { const k = DAW.TRACK_COLORS.indexOf(t.color); t.color = DAW.TRACK_COLORS[(k + 1) % DAW.TRACK_COLORS.length]; }) },
            { label: 'Duplicate track', key: 'Ctrl+Shift+D', action: () => duplicateTrack(t) },
            { label: 'Delete track', action: () => deleteTrack(t) },
            '-',
            { label: 'Move up', disabled: i === 0, action: () => mutate('Move track', () => { proj.tracks.splice(i, 1); proj.tracks.splice(i - 1, 0, t); }) },
            { label: 'Move down', disabled: i === proj.tracks.length - 1, action: () => mutate('Move track', () => { proj.tracks.splice(i, 1); proj.tracks.splice(i + 1, 0, t); }) },
            '-',
            { label: 'Show automation', action: () => { t.automation.show = !t.automation.show; changed(); } },
            { label: 'Open device chain', action: () => { selectTrack(t.id, { noRender: true }); S.tab = 'devices'; render(); } },
            t.type === 'instrument' ? { label: 'Export track as MIDI', action: () => download(DAW.exportMidi(proj, [t.id]), t.name + '.mid') } : null,
            { label: 'Bounce track to WAV…', action: () => exportDialog([t.id]) },
        ]);
    }
    function duplicateTrack(t) {
        mutate('Duplicate track', () => {
            const c = U.deepClone(t);
            c.id = U.uid('trk'); c.name = t.name + ' copy';
            c.clips.forEach(cl => { cl.id = U.uid('clp'); if (cl.notes) cl.notes.forEach(n => { n.id = U.uid('n'); }); });
            c.plugins.forEach(p => { p.id = U.uid('fx'); });
            const i = E.project.tracks.indexOf(t);
            E.project.tracks.splice(i + 1, 0, c);
            E.selectedTrackId = c.id; S.selectedStrip = c.id;
        });
    }
    function deleteTrack(t) {
        mutate('Delete track', () => {
            E.project.tracks = E.project.tracks.filter(x => x !== t);
            if (S.editClipId && t.clips.some(c => c.id === S.editClipId)) S.editClipId = null;
            if (E.selectedTrackId === t.id) E.selectedTrackId = E.project.tracks[0] ? E.project.tracks[0].id : null;
            if (S.selectedStrip === t.id) S.selectedStrip = E.selectedTrackId;
        });
    }

    // ---------------------------------------------------------------- clips
    function createMidiClip(t, start, length) {
        let clip;
        mutate('Create clip', () => { clip = DAW.newMidiClip(start, length, [], t.name); t.clips.push(clip); });
        S.selectedClips.clear(); S.selectedClips.add(clip.id);
        openInPianoRoll(clip.id);
    }
    function openInPianoRoll(clipId) {
        const f = findClip(clipId);
        if (!f || f.clip.kind !== 'midi') return;
        S.editClipId = clipId; S.tab = 'piano';
        E.selectedTrackId = f.track.id; S.selectedStrip = f.track.id;
        render();
    }
    DAW.openInPianoRoll = openInPianoRoll;

    function clipEl(t, c) {
        const proj = E.project, z = proj.zoom;
        const el = h('div', {
            class: 'daw-clip ' + c.kind + (S.selectedClips.has(c.id) ? ' selected' : '') + (c.muted ? ' muted' : '') + (c.recording ? ' recording' : '') + (c.id === S.editClipId ? ' editing' : ''),
            dataset: { clipId: c.id },
            style: { left: c.start * z + 'px', width: Math.max(3, c.length * z) + 'px', '--clip-color': c.color || t.color },
        });
        const canvas = h('canvas', { class: 'daw-clip-canvas' });
        const missing = c.kind === 'audio' && !DAW.audioPool.get(c.bufferId);
        el.append(h('div', { class: 'daw-clip-name' }, (c.muted ? '[M] ' : '') + c.name + (missing ? ' (missing audio – re-import)' : '')), canvas,
            h('div', { class: 'daw-clip-handle l', title: 'Drag to trim start' }), h('div', { class: 'daw-clip-handle r', title: 'Drag to change length' }));
        requestAnimationFrame(() => drawClip(canvas, t, c));
        el.addEventListener('pointerdown', e => clipPointerDown(e, t, c, el));
        el.addEventListener('dblclick', e => { e.stopPropagation(); if (c.kind === 'midi') openInPianoRoll(c.id); });
        el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); if (!S.selectedClips.has(c.id)) { S.selectedClips.clear(); S.selectedClips.add(c.id); } clipMenu(t, c, e.clientX, e.clientY); });
        return el;
    }
    function drawClip(canvas, t, c) {
        const w = Math.min(8000, Math.max(1, Math.round(c.length * E.project.zoom))), hgt = Math.max(1, canvas.clientHeight || (t.height - 22));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = w * dpr; canvas.height = hgt * dpr;
        const g = canvas.getContext('2d'); g.scale(dpr, dpr);
        const xs = w / (c.length * E.project.zoom);
        g.fillStyle = cssVar('--text-color');
        if (c.kind === 'midi') {
            if (!c.notes.length) return;
            let lo = 127, hi = 0;
            c.notes.forEach(n => { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); });
            lo -= 1; hi += 1;
            const rh = Math.max(1.5, Math.min(6, hgt / (hi - lo + 1)));
            const span = (hi - lo + 1) * rh, top = (hgt - span) / 2;
            c.notes.forEach(n => {
                if (n.s >= c.length || n.s + n.l <= 0) return;
                const x = Math.max(0, n.s) * E.project.zoom * xs, wd = Math.max(1.5, (Math.min(n.l, c.length - n.s)) * E.project.zoom * xs - 1);
                g.globalAlpha = 0.45 + 0.55 * n.v;
                g.fillRect(x, top + (hi - n.p) * rh, wd, Math.max(1, rh - 0.5));
            });
        } else {
            const entry = DAW.audioPool.get(c.bufferId);
            if (!entry) return;
            const peaks = entry.peaks, dur = entry.buffer.duration, spb = E.spb(), mid = hgt / 2;
            g.globalAlpha = 0.8;
            g.beginPath();
            for (let x = 0; x < w; x++) {
                const tm = c.offset + (x / xs / E.project.zoom) * spb;
                if (tm >= dur) break;
                const i0 = Math.floor((tm / dur) * peaks.length), i1 = Math.max(i0 + 1, Math.floor(((c.offset + ((x + 1) / xs / E.project.zoom) * spb) / dur) * peaks.length));
                let pk = 0; for (let i = i0; i < Math.min(i1, peaks.length); i++) pk = Math.max(pk, peaks[i]);
                const a = Math.max(0.5, pk * c.gain * mid);
                g.rect(x, mid - a, 1, a * 2);
            }
            g.fill();
        }
    }
    function clipPointerDown(e, t, c, el) {
        if (e.button !== 0) return;
        e.stopPropagation();
        const proj = E.project, z = proj.zoom;
        selectTrack(t.id, { noRender: true });
        const handle = e.target.classList.contains('daw-clip-handle') ? (e.target.classList.contains('l') ? 'l' : 'r') : null;
        if (e.shiftKey && !handle) {
            if (S.selectedClips.has(c.id)) S.selectedClips.delete(c.id); else S.selectedClips.add(c.id);
            el.classList.toggle('selected', S.selectedClips.has(c.id));
            return;
        }
        if (!S.selectedClips.has(c.id)) {
            S.selectedClips.clear(); S.selectedClips.add(c.id);
            document.querySelectorAll('.daw-clip.selected').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
        }
        const x0 = e.clientX, y0 = e.clientY;
        let moved = false;
        if (handle) {
            const orig = { start: c.start, length: c.length, offset: c.offset };
            const minLen = snapBeats() || 0.0625;
            const entry = c.kind === 'audio' ? DAW.audioPool.get(c.bufferId) : null;
            drag(e, ev => {
                const db = (ev.clientX - x0) / z;
                if (!moved && Math.abs(ev.clientX - x0) < 2) return;
                moved = true;
                if (handle === 'r') {
                    let end = snap(orig.start + orig.length + db);
                    let len = Math.max(minLen, end - orig.start);
                    if (entry) len = Math.min(len, (entry.buffer.duration - (orig.offset || 0)) / E.spb());
                    c.length = len;
                } else {
                    let ns = U.clamp(snap(orig.start + db), 0, orig.start + orig.length - minLen);
                    if (entry) ns = Math.max(ns, orig.start - (orig.offset || 0) / E.spb());
                    c.start = ns; c.length = orig.start + orig.length - ns;
                }
                el.style.left = c.start * z + 'px'; el.style.width = c.length * z + 'px';
            }, () => {
                if (!moved) return;
                const fin = { start: c.start, length: c.length };
                Object.assign(c, orig);
                mutate(handle === 'r' ? 'Resize clip' : 'Trim clip', () => {
                    const delta = fin.start - orig.start;
                    c.start = fin.start; c.length = fin.length;
                    if (handle === 'l') {
                        if (c.kind === 'midi') c.notes.forEach(n => { n.s -= delta; });
                        else c.offset = Math.max(0, (orig.offset || 0) + delta * E.spb());
                    }
                });
            });
            return;
        }
        // Move (Alt/Ctrl-drag copies).
        const copy = e.altKey || e.ctrlKey || e.metaKey;
        const sel = allClips().filter(x => S.selectedClips.has(x.clip.id));
        const rows = Array.from(S.els.arrangeInner.querySelectorAll('.daw-track-row[data-track-id]'));
        const rowOf = id => rows.find(r => r.dataset.trackId === id);
        const trackIdx = id => proj.tracks.findIndex(x => x.id === id);
        const primaryIdx = trackIdx(t.id);
        let dBeats = 0, dTrack = 0;
        const els = sel.map(x => S.els.arrangeInner.querySelector(`.daw-clip[data-clip-id="${x.clip.id}"]`));
        drag(e, ev => {
            if (!moved && Math.abs(ev.clientX - x0) < 4 && Math.abs(ev.clientY - y0) < 4) return;
            moved = true;
            const minStart = Math.min(...sel.map(x => x.clip.start));
            dBeats = Math.max(-minStart, snap(c.start + (ev.clientX - x0) / z) - c.start);
            const under = document.elementFromPoint(ev.clientX, ev.clientY);
            const row = under && under.closest('.daw-track-row[data-track-id]');
            if (row) dTrack = trackIdx(row.dataset.trackId) - primaryIdx;
            const dy = row ? row.getBoundingClientRect().top - rowOf(t.id).getBoundingClientRect().top : 0;
            els.forEach(x => { if (x) { x.style.transform = `translate(${dBeats * z}px, ${dy}px)`; x.classList.add('dragging', copy ? 'copying' : 'moving'); } });
        }, () => {
            if (!moved) {
                if (!e.shiftKey) { S.selectedClips.clear(); S.selectedClips.add(c.id); }
                if (c.kind === 'midi' && S.tab === 'piano') { S.editClipId = c.id; }
                refreshSelection();
                return;
            }
            mutate(copy ? 'Copy clips' : 'Move clips', () => {
                const newSel = new Set();
                sel.forEach(({ track, clip }) => {
                    const ti = trackIdx(track.id) + dTrack;
                    let dest = proj.tracks[ti];
                    const kindOk = dest && ((clip.kind === 'midi' && dest.type === 'instrument') || (clip.kind === 'audio' && dest.type === 'audio'));
                    if (!kindOk) dest = track;
                    let target = clip;
                    if (copy) { target = cloneClip(clip); dest.clips.push(target); }
                    else if (dest !== track) { track.clips = track.clips.filter(x => x !== clip); dest.clips.push(clip); }
                    target.start = Math.max(0, clip.start + dBeats);
                    newSel.add(target.id);
                });
                S.selectedClips = newSel;
            });
        });
    }
    function cloneClip(c) {
        const n = U.deepClone(c);
        n.id = U.uid('clp');
        if (n.notes) n.notes.forEach(x => { x.id = U.uid('n'); });
        return n;
    }
    function clipMenu(t, c, x, y) {
        const proj = E.project;
        showMenu(x, y, [
            c.kind === 'midi' ? { label: 'Edit in piano roll', action: () => openInPianoRoll(c.id) } : null,
            { label: 'Rename…', action: () => { const n = prompt('Clip name', c.name); if (n) mutate('Rename clip', () => { c.name = n; }); } },
            { label: c.muted ? 'Unmute clip' : 'Mute clip', key: '0', action: () => mutate('Mute clip', () => { selectedClipObjs().forEach(x => { x.clip.muted = !c.muted; }); }) },
            { label: 'Change color', action: () => mutate('Clip color', () => { const k = DAW.TRACK_COLORS.indexOf(c.color || t.color); selectedClipObjs().forEach(x => { x.clip.color = DAW.TRACK_COLORS[(k + 1) % DAW.TRACK_COLORS.length]; }); }) },
            '-',
            { label: 'Copy', key: 'Ctrl+C', action: copyClips },
            { label: 'Duplicate', key: 'Ctrl+D', action: duplicateClips },
            { label: 'Split at playhead', key: 'Ctrl+E', action: splitAtPlayhead },
            { label: 'Loop region to clip', action: () => mutate('Loop to clip', () => { proj.loop.start = c.start; proj.loop.end = c.start + c.length; proj.loop.enabled = true; }) },
            c.kind === 'midi' ? { label: 'Quantize notes (grid)', key: 'Q', action: () => mutate('Quantize', () => selectedClipObjs().forEach(x => x.clip.kind === 'midi' && quantizeNotes(x.clip.notes, 1))) } : null,
            c.kind === 'midi' ? { label: 'Consolidate selected clips', action: consolidate } : null,
            c.kind === 'audio' ? { label: 'Reverse audio', action: () => reverseAudio(c) } : null,
            c.kind === 'audio' ? { label: 'Normalize clip gain', action: () => normalizeClip(c) } : null,
            c.kind === 'audio' ? { label: 'Fades…', action: () => fadesDialog(c) } : null,
            '-',
            { label: 'Delete', key: 'Del', action: deleteSelectedClips },
        ]);
    }
    function selectedClipObjs() { return allClips().filter(x => S.selectedClips.has(x.clip.id)); }
    function deleteSelectedClips() {
        if (!S.selectedClips.size) return;
        mutate('Delete clips', () => {
            E.project.tracks.forEach(t => { t.clips = t.clips.filter(c => !S.selectedClips.has(c.id)); });
            if (S.selectedClips.has(S.editClipId)) S.editClipId = null;
            S.selectedClips.clear();
        });
    }
    function copyClips() {
        const sel = selectedClipObjs();
        if (!sel.length) return;
        const minStart = Math.min(...sel.map(x => x.clip.start));
        S.clipboard = { type: 'clips', items: sel.map(x => ({ trackId: x.track.id, clip: U.deepClone(x.clip), rel: x.clip.start - minStart })) };
        message(`Copied ${sel.length} clip(s)`);
    }
    function pasteClips(trackId, at) {
        if (!S.clipboard || S.clipboard.type !== 'clips') return;
        const proj = E.project;
        const base = at != null ? at : snap(E.currentBeat());
        const firstTrack = S.clipboard.items[0].trackId;
        const targetIdx = proj.tracks.findIndex(t => t.id === (trackId || E.selectedTrackId));
        const srcIdx = proj.tracks.findIndex(t => t.id === firstTrack);
        mutate('Paste clips', () => {
            S.selectedClips.clear();
            S.clipboard.items.forEach(it => {
                const si = proj.tracks.findIndex(t => t.id === it.trackId);
                let dest = proj.tracks[si + (targetIdx >= 0 && srcIdx >= 0 ? targetIdx - srcIdx : 0)] || DAW.findTrack(proj, it.trackId);
                const ok = d => d && ((it.clip.kind === 'midi') === (d.type === 'instrument'));
                if (!ok(dest)) dest = DAW.findTrack(proj, it.trackId);
                if (!ok(dest)) return;
                const c = cloneClip(it.clip);
                c.start = base + it.rel;
                dest.clips.push(c);
                S.selectedClips.add(c.id);
            });
        });
    }
    function duplicateClips() {
        const sel = selectedClipObjs();
        if (!sel.length) return;
        const minStart = Math.min(...sel.map(x => x.clip.start));
        const maxEnd = Math.max(...sel.map(x => x.clip.start + x.clip.length));
        const shift = maxEnd - minStart;
        mutate('Duplicate clips', () => {
            S.selectedClips.clear();
            sel.forEach(({ track, clip }) => { const c = cloneClip(clip); c.start = clip.start + shift; track.clips.push(c); S.selectedClips.add(c.id); });
        });
    }
    function splitAtPlayhead() {
        const b = E.currentBeat();
        let targets = selectedClipObjs();
        if (!targets.length) targets = allClips().filter(x => x.track.id === E.selectedTrackId);
        targets = targets.filter(x => b > x.clip.start && b < x.clip.start + x.clip.length);
        if (!targets.length) { message('Place the playhead inside a clip to split it'); return; }
        mutate('Split clip', () => targets.forEach(({ track, clip }) => { const r = DAW.splitClip(clip, b); if (r) track.clips.push(r); }));
    }
    function consolidate() {
        const sel = selectedClipObjs().filter(x => x.clip.kind === 'midi');
        const byTrack = new Map();
        sel.forEach(x => { if (!byTrack.has(x.track)) byTrack.set(x.track, []); byTrack.get(x.track).push(x.clip); });
        mutate('Consolidate', () => {
            byTrack.forEach((clips, track) => {
                if (clips.length < 2) return;
                const s = Math.min(...clips.map(c => c.start)), e = Math.max(...clips.map(c => c.start + c.length));
                const notes = [];
                clips.forEach(c => c.notes.forEach(n => { if (n.s >= 0 && n.s < c.length) notes.push({ p: n.p, s: c.start + n.s - s, l: Math.min(n.l, c.length - n.s), v: n.v }); }));
                track.clips = track.clips.filter(c => !clips.includes(c));
                const nc = DAW.newMidiClip(s, e - s, notes, clips[0].name);
                track.clips.push(nc);
                S.selectedClips = new Set([nc.id]);
            });
        });
    }
    function reverseAudio(c) {
        const entry = DAW.audioPool.get(c.bufferId);
        if (!entry) return;
        const b = entry.buffer, nb = E.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
        for (let ch = 0; ch < b.numberOfChannels; ch++) { const s = b.getChannelData(ch), d = nb.getChannelData(ch); for (let i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i]; }
        const id = DAW.addToPool(nb, entry.name + ' (rev)');
        mutate('Reverse audio', () => { c.bufferId = id; c.offset = Math.max(0, b.duration - c.offset - c.length * E.spb()); });
    }
    function normalizeClip(c) {
        const entry = DAW.audioPool.get(c.bufferId);
        if (!entry) return;
        let pk = 0; entry.peaks.forEach(v => { pk = Math.max(pk, v); });
        if (pk > 0) mutate('Normalize', () => { c.gain = 0.98 / pk; });
    }
    function fadesDialog(c) {
        const fi = h('input', { type: 'number', min: 0, max: c.length, step: 0.25, value: c.fadeIn || 0 });
        const fo = h('input', { type: 'number', min: 0, max: c.length, step: 0.25, value: c.fadeOut || 0 });
        const g = h('input', { type: 'number', min: -36, max: 24, step: 0.5, value: U.gainToDb(c.gain).toFixed(1) });
        modal('Clip fades & gain', h('div', { class: 'daw-form' }, h('label', null, 'Fade in (beats) ', fi), h('label', null, 'Fade out (beats) ', fo), h('label', null, 'Clip gain (dB) ', g)), [
            { label: 'Cancel' },
            { label: 'Apply', primary: true, action: () => mutate('Clip fades', () => { c.fadeIn = U.clamp(parseFloat(fi.value) || 0, 0, c.length); c.fadeOut = U.clamp(parseFloat(fo.value) || 0, 0, c.length); c.gain = U.dbToGain(parseFloat(g.value) || 0); }) },
        ]);
    }
    function quantizeNotes(notes, strength, grid) {
        const q = grid || snapBeats() || 0.25;
        notes.forEach(n => { const target = Math.round(n.s / q) * q; n.s = n.s + (target - n.s) * strength; });
    }
    DAW.quantizeNotes = quantizeNotes;

    // ------------------------------------------------------------ automation
    function automationRow(t) {
        const proj = E.project, z = proj.zoom;
        const pname = t.automation.param;
        const info = DAW.AUTOMATION_PARAMS[pname];
        const lane = (t.automation.lanes[pname] = t.automation.lanes[pname] || []);
        const toNorm = v => (pname === 'volume' ? gainToPos(v) : (v - info.min) / (info.max - info.min));
        const fromNorm = n => (pname === 'volume' ? posToGain(n) : info.min + n * (info.max - info.min));
        const valText = v => (pname === 'volume' ? fmtDb(v) + ' dB' : pname === 'pan' ? fmtPan(v) : Math.round(v * 100) + '%');
        const sel = h('select', { class: 'daw-auto-param' }, Object.keys(DAW.AUTOMATION_PARAMS).map(k => h('option', { value: k, selected: k === pname }, DAW.AUTOMATION_PARAMS[k].name + ((t.automation.lanes[k] || []).length ? ' •' : ''))));
        sel.addEventListener('change', () => { t.automation.param = sel.value; changed(); });
        const readout = h('span', { class: 'daw-auto-val' }, lane.length ? lane.length + ' pts' : 'no points');
        const header = h('div', { class: 'daw-track-header auto', style: { '--track-color': t.color } },
            h('div', { class: 'daw-track-color' }),
            h('div', { class: 'daw-track-main' }, h('div', { class: 'daw-auto-title' }, 'Automation'), sel,
                h('div', { class: 'daw-track-btns' }, readout, btn('Clear', () => mutate('Clear automation', () => { t.automation.lanes[pname] = []; }), { title: 'Remove all points' }))));
        const W = S.totalBeats * z;
        const area = h('div', { class: 'daw-lane auto-lane', style: Object.assign({ height: AUTO_H + 'px' }, gridBackground(z)) });
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', W); svg.setAttribute('height', AUTO_H); svg.classList.add('daw-auto-svg');
        area.appendChild(svg);
        const yOf = v => AUTO_H - 6 - toNorm(v) * (AUTO_H - 12);
        const vOf = y => fromNorm(U.clamp((AUTO_H - 6 - y) / (AUTO_H - 12), 0, 1));
        const staticVal = pname === 'volume' ? t.volume : pname === 'pan' ? t.pan : t.sends[pname === 'sendA' ? 0 : 1];
        const draw = () => {
            svg.innerHTML = '';
            const pts = lane.length ? [[0, lane[0].v]].concat(lane.map(p => [p.b, p.v]), [[S.totalBeats, lane[lane.length - 1].v]]) : [[0, staticVal], [S.totalBeats, staticVal]];
            const pl = document.createElementNS(svgNS, 'polyline');
            pl.setAttribute('points', pts.map(([b, v]) => `${b * z},${yOf(v)}`).join(' '));
            pl.setAttribute('class', lane.length ? 'line' : 'line static');
            svg.appendChild(pl);
            lane.forEach(p => {
                const c = document.createElementNS(svgNS, 'circle');
                c.setAttribute('cx', p.b * z); c.setAttribute('cy', yOf(p.v)); c.setAttribute('r', 5);
                c.setAttribute('class', 'pt');
                const title = document.createElementNS(svgNS, 'title'); title.textContent = `${fmtPos(p.b)}  ${valText(p.v)} (double-click to delete)`; c.appendChild(title);
                c.addEventListener('pointerdown', e => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    DAW.history.push('Move automation point');
                    const r = svg.getBoundingClientRect();
                    drag(e, ev => {
                        p.b = Math.max(0, snap((ev.clientX - r.left) / z));
                        p.v = vOf(ev.clientY - r.top);
                        lane.sort((a, b2) => a.b - b2.b);
                        readout.textContent = valText(p.v);
                        draw();
                    }, () => changed());
                });
                c.addEventListener('dblclick', e => { e.stopPropagation(); mutate('Delete automation point', () => { const i = lane.indexOf(p); if (i >= 0) lane.splice(i, 1); }); });
                svg.appendChild(c);
            });
        };
        draw();
        svg.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target.tagName === 'circle') return;
            const r = svg.getBoundingClientRect();
            const b = Math.max(0, snap((e.clientX - r.left) / z));
            const v = vOf(e.clientY - r.top);
            DAW.history.push('Add automation point');
            const p = { b, v };
            lane.push(p); lane.sort((a, c) => a.b - c.b);
            draw();
            drag(e, ev => { p.v = vOf(ev.clientY - r.top); p.b = Math.max(0, snap((ev.clientX - r.left) / z)); lane.sort((a, c) => a.b - c.b); readout.textContent = valText(p.v); draw(); }, () => changed());
        });
        return h('div', { class: 'daw-track-row auto-row', dataset: { autoFor: t.id }, style: { height: AUTO_H + 'px' } }, header, area);
    }

    // ------------------------------------------------------------- playhead
    function updatePlayhead(force) {
        const ph = S.els.playhead;
        if (!ph || !E.project) return;
        const b = E.currentBeat();
        const x = HEADER_W + Math.max(0, b) * E.project.zoom;
        ph.style.transform = `translateX(${x}px)`;
        if (E.playing && E.project.followPlayhead && !force) {
            const sc = S.els.arrangeScroll;
            const viewL = sc.scrollLeft + HEADER_W, viewR = sc.scrollLeft + sc.clientWidth - 30;
            if (x > viewR || x < viewL) sc.scrollLeft = Math.max(0, x - HEADER_W - 20);
        }
        if (S.els.pos) { S.els.pos.textContent = fmtPos(b); S.els.time.textContent = fmtTime(b); }
        if (DAW.PianoRoll && S.tab === 'piano') DAW.PianoRoll.updatePlayhead(b);
    }

    // --------------------------------------------------------- bottom panel
    function renderBottom() {
        const tabs = S.els.tabs;
        tabs.innerHTML = '';
        const tab = (id, label, key) => btn(label, () => { S.tab = id; renderBottom(); }, { cls: 'tab' + (S.tab === id ? ' active' : ''), title: label + ' (' + key + ')' });
        const sel = DAW.findStripState(E.project, S.selectedStrip || E.selectedTrackId);
        tabs.append(tab('piano', '🎼 Piano Roll', '1'), tab('devices', '🎛 Devices' + (sel ? ' – ' + sel.name : ''), '2'), tab('mixer', '🎚 Mixer', '3'));
        const body = S.els.bottomBody;
        body.innerHTML = '';
        S.meters = S.meters.filter(m => m.kind === 'track');
        S.fxMeters = [];
        if (S.tab === 'piano') {
            const f = S.editClipId && findClip(S.editClipId);
            if (!f) {
                const t = selectedTrack();
                const clips = t && t.type === 'instrument' ? t.clips.filter(c => c.kind === 'midi') : [];
                body.appendChild(h('div', { class: 'daw-empty' },
                    h('p', null, 'Double-click a MIDI clip to edit it here, or double-click an empty spot on an instrument track to create one.'),
                    t && t.type === 'instrument' ? btn('Create a 1-bar clip at the playhead on "' + t.name + '"', () => createMidiClip(t, Math.floor(E.position / E.beatsPerBar()) * E.beatsPerBar(), E.beatsPerBar())) : null,
                    clips.length ? h('div', null, 'Clips on this track: ', clips.map(c => btn(c.name + ' @' + fmtPos(c.start), () => openInPianoRoll(c.id)))) : null));
            } else DAW.PianoRoll.render(body, f.track, f.clip);
        } else if (S.tab === 'devices') renderDevices(body);
        else renderMixer(body);
    }

    function renderDevices(body) {
        const id = S.selectedStrip || E.selectedTrackId;
        const st = DAW.findStripState(E.project, id);
        if (!st) { body.appendChild(h('div', { class: 'daw-empty' }, 'Select a track, return or the master to see its device chain.')); return; }
        const isTrack = !!st.type;
        const chain = h('div', { class: 'daw-chain' });
        // Strip selector so returns and master are reachable.
        const pick = h('select', { class: 'daw-chain-pick' },
            E.project.tracks.map(t => h('option', { value: t.id, selected: t.id === st.id }, 'Track: ' + t.name)),
            E.project.returns.map(r => h('option', { value: r.id, selected: r.id === st.id }, 'Return: ' + r.name)),
            h('option', { value: 'master', selected: st.id === 'master' }, 'Master'));
        pick.addEventListener('change', () => { S.selectedStrip = pick.value; if (DAW.findTrack(E.project, pick.value)) E.selectedTrackId = pick.value; render(); });
        const addSel = h('select', { class: 'daw-add-plugin' }, h('option', { value: '' }, '+ Add plugin…'),
            Object.keys(DAW.PLUGINS).map(k => h('option', { value: k }, DAW.PLUGINS[k].category + ' › ' + DAW.PLUGINS[k].name)));
        addSel.addEventListener('change', () => { if (addSel.value) addPluginTo(st.id, addSel.value); });
        body.appendChild(h('div', { class: 'daw-chain-bar' }, pick, addSel,
            h('span', { class: 'daw-chain-hint' }, 'Signal flows left → right. Double-click a slider to reset it.')));
        if (isTrack && st.type === 'instrument') chain.appendChild(instrumentCard(st));
        if (isTrack && st.type === 'audio') chain.appendChild(h('div', { class: 'daw-device audio-in' }, h('div', { class: 'daw-device-head' }, h('span', { class: 'daw-device-name' }, '🎤 Audio Input')),
            h('div', { class: 'daw-device-body' }, h('p', null, 'Arm this track (●) and press Record to capture your microphone. You can also drop audio files onto the lane.'),
                btn('Import audio at playhead…', async () => { const f = await pickFile('audio/*', true); if (f.length) importFiles(f, E.position, st.id); }))));
        st.plugins.forEach((p, i) => chain.appendChild(pluginCard(st, p, i)));
        chain.appendChild(h('div', { class: 'daw-device add', ondragover: e => e.preventDefault(), ondrop: e => { const pl = e.dataTransfer.getData('text/daw-plugin'); if (pl) addPluginTo(st.id, pl); } },
            h('div', { class: 'daw-device-add-inner' }, 'Drop a plugin here or pick one:', h('div', { class: 'daw-add-grid' }, Object.keys(DAW.PLUGINS).map(k => btn(DAW.PLUGINS[k].name, () => addPluginTo(st.id, k)))))));
        body.appendChild(chain);
    }
    function instrumentCard(t) {
        const inst = t.instrument, def = DAW.INSTRUMENTS[inst.type];
        const typeSel = h('select', { title: 'Instrument' }, Object.keys(DAW.INSTRUMENTS).map(k => h('option', { value: k, selected: k === inst.type }, DAW.INSTRUMENTS[k].name)));
        typeSel.addEventListener('change', () => mutate('Change instrument', () => { t.instrument = DAW.newInstrument(typeSel.value); }));
        const presetSel = h('select', { title: 'Preset' }, h('option', { value: '' }, 'Presets…'), Object.keys(def.presets).map(k => h('option', { value: k, selected: k === inst.preset }, k)));
        presetSel.addEventListener('change', () => { if (presetSel.value) mutate('Load preset', () => { t.instrument = DAW.newInstrument(inst.type, presetSel.value); if (inst.params.sampleId) t.instrument.params.sampleId = inst.params.sampleId; }); });
        const extra = [];
        if (inst.type === 'synth') {
            extra.push(h('div', { class: 'daw-device-note' }, inst.params.linkMain ? 'Linked: this track plays with the live settings of the main synth panel below.' : 'Unlinked: uses the parameters shown here.'),
                btn('Copy settings from main panel', () => {
                    if (typeof window.getCurrentSynthParams !== 'function') return;
                    mutate('Copy from main panel', () => { Object.assign(inst.params, def.fromMain(window.getCurrentSynthParams())); inst.params.linkMain = 0; });
                    message('Copied the main panel sound into ' + t.name);
                }, { title: 'Snapshot the main panel into this instrument (and unlink it)' }));
        }
        if (inst.type === 'drums') extra.push(h('div', { class: 'daw-device-note drums' }, def.drumNames.map((n, i) => h('span', null, U.NOTE_NAMES[i] + ' ' + n))));
        const body = h('div', { class: 'daw-device-body params' },
            def.params.map(pd => {
                if (inst.type === 'synth' && inst.params.linkMain && pd.id !== 'linkMain' && !['unison', 'spread', 'fenv', 'keytrack', 'velSens', 'gain'].includes(pd.id)) return null;
                return paramControl(pd, inst.params[pd.id], (v, fin) => { inst.params[pd.id] = v; if (fin) { autosave(); if (pd.id === 'linkMain' || pd.type === 'sample') render(); } });
            }));
        return h('div', { class: 'daw-device instrument', style: { '--track-color': t.color } },
            h('div', { class: 'daw-device-head' }, h('span', { class: 'daw-device-name' }, '🎹 ' + def.name), typeSel, presetSel,
                btn('▶', () => auditionInstrument(t), { title: 'Audition (plays a short phrase)' })),
            h('div', { class: 'daw-device-desc' }, def.description), extra, body);
    }
    function auditionInstrument(t) {
        if (!E.graph) return;
        const strip = E.graph.tracks.get(t.id), def = DAW.INSTRUMENTS[t.instrument.type], now = E.ctx.currentTime + 0.05;
        const seq = t.instrument.type === 'drums' ? [[36, 0], [42, 0.25], [38, 0.5], [42, 0.75]] : [[60, 0], [64, 0.2], [67, 0.4], [72, 0.6]];
        seq.forEach(([p, o]) => { const v = def.voice(E.ctx, strip.input, t.instrument.params, p, 0.8, now + o); v.release(now + o + 0.35); });
    }
    function pluginCard(st, p, i) {
        const def = DAW.PLUGINS[p.type];
        if (!def) return h('div', { class: 'daw-device' }, 'Unknown plugin ' + p.type);
        const power = btn('⏻', () => mutate('Bypass', () => { p.bypass = !p.bypass; }), { cls: 'power' + (p.bypass ? '' : ' on'), title: p.bypass ? 'Enable' : 'Bypass' });
        const presetSel = h('select', { title: 'Preset' }, h('option', { value: '' }, 'Presets…'), Object.keys(def.presets).map(k => h('option', { value: k, selected: k === p.preset }, k)));
        presetSel.addEventListener('change', () => { if (presetSel.value) mutate('Plugin preset', () => { p.params = DAW.defaultParams(def.params, def.presets[presetSel.value]); p.preset = presetSel.value; }); });
        const left = btn('◀', () => mutate('Move plugin', () => { st.plugins.splice(i, 1); st.plugins.splice(i - 1, 0, p); }), { title: 'Move earlier in chain', attrs: { disabled: i === 0 } });
        const right = btn('▶', () => mutate('Move plugin', () => { st.plugins.splice(i, 1); st.plugins.splice(i + 1, 0, p); }), { title: 'Move later in chain', attrs: { disabled: i === st.plugins.length - 1 } });
        const del = btn('✕', () => mutate('Remove plugin', () => { st.plugins.splice(i, 1); }), { title: 'Remove plugin', cls: 'danger' });
        const body = h('div', { class: 'daw-device-body params' }, def.params.map(pd => paramControl(pd, p.params[pd.id], (v, fin) => {
            p.params[pd.id] = v;
            E.sync();
            if (fin) autosave();
        })));
        const card = h('div', { class: 'daw-device' + (p.bypass ? ' bypassed' : '') },
            h('div', { class: 'daw-device-head' }, power, h('span', { class: 'daw-device-name', title: def.description }, def.name), presetSel, left, right, del));
        if (def.meter === 'gr') {
            const fill = h('div', { class: 'daw-gr-fill' }), lbl = h('span', null, '0.0 dB');
            card.appendChild(h('div', { class: 'daw-gr', title: 'Gain reduction' }, h('span', { class: 'daw-gr-label' }, 'GR'), h('div', { class: 'daw-gr-bar' }, fill), lbl));
            S.fxMeters.push({ stripId: st.id, pluginId: p.id, kind: 'gr', fill, lbl });
        } else if (def.meter === 'spectrum') {
            const cv = h('canvas', { class: 'daw-spectrum', width: 360, height: 120 });
            card.appendChild(cv);
            S.fxMeters.push({ stripId: st.id, pluginId: p.id, kind: 'spectrum', cv });
        } else if (p.type === 'eq' || p.type === 'autofilter') {
            const cv = h('canvas', { class: 'daw-eqcurve', width: 360, height: 90 });
            card.appendChild(cv);
            S.fxMeters.push({ stripId: st.id, pluginId: p.id, kind: 'curve', cv });
        }
        card.appendChild(body);
        return card;
    }

    function stripNodeFor(id) {
        const g = E.graph;
        if (!g) return null;
        if (id === 'master') return g.master;
        return g.returns.get(id) || g.tracks.get(id);
    }
    function renderMixer(body) {
        const proj = E.project;
        const wrap = h('div', { class: 'daw-mixer' });
        const strip = (st, kind) => {
            const isTrack = kind === 'track';
            const sel = (S.selectedStrip || E.selectedTrackId) === st.id;
            const color = isTrack ? st.color : kind === 'master' ? 'var(--accent-color)' : '#9e9e9e';
            const meterL = h('div', { class: 'daw-meter-fill' }), meterR = h('div', { class: 'daw-meter-fill' });
            const peakLbl = h('div', { class: 'daw-meter-peak' }, '-inf');
            S.meters.push({ kind: 'mixer', id: st.id, l: meterL, r: meterR, peak: peakLbl, hold: 0 });
            const dbLbl = h('div', { class: 'daw-strip-db' }, fmtDb(st.volume));
            const panLbl = h('span', { class: 'daw-strip-pan' }, fmtPan(st.pan));
            const vf = volFader(st, { vertical: true, label: v => { dbLbl.textContent = fmtDb(v); } });
            const pf = panFader(st, { cls: 'pan', label: v => { panLbl.textContent = fmtPan(v); } });
            const sends = isTrack ? proj.returns.map((r, i) => {
                const lbl = h('span', null, Math.round(st.sends[i] * 100) + '%');
                return h('div', { class: 'daw-send' }, h('span', { class: 'daw-send-name', title: 'Send to ' + r.name }, r.name.split('-')[0]),
                    fader({ value: st.sends[i], toPos: v => v, fromPos: p => p, def: 0, cls: 'mini send', title: 'Send ' + r.name, label: v => { lbl.textContent = Math.round(v * 100) + '%'; }, onChange: v => { st.sends[i] = v; changed({ noRender: true }); } }), lbl);
            }) : [];
            const inserts = h('div', { class: 'daw-inserts' }, st.plugins.map(p => h('div', {
                class: 'daw-insert' + (p.bypass ? ' off' : ''), title: 'Open in device chain',
                onclick: () => { S.selectedStrip = st.id; if (isTrack) E.selectedTrackId = st.id; S.tab = 'devices'; render(); },
            }, DAW.PLUGINS[p.type] ? DAW.PLUGINS[p.type].name : p.type)), h('div', { class: 'daw-insert add', onclick: e => {
                showMenu(e.clientX, e.clientY, Object.keys(DAW.PLUGINS).map(k => ({ label: DAW.PLUGINS[k].name, action: () => addPluginTo(st.id, k) })));
            } }, '+ insert'));
            const btns = h('div', { class: 'daw-strip-btns' },
                btn('M', () => mutate('Mute', () => { st.mute = !st.mute; }), { cls: 'mute' + (st.mute ? ' active' : '') }),
                isTrack ? btn('S', () => mutate('Solo', () => { st.solo = !st.solo; }), { cls: 'solo' + (st.solo ? ' active' : '') }) : null,
                isTrack ? btn('●', () => mutate('Arm', () => { st.arm = !st.arm; }), { cls: 'arm' + (st.arm ? ' active' : '') }) : null);
            const name = h('div', { class: 'daw-strip-name', title: st.name }, st.name);
            if (isTrack) name.addEventListener('dblclick', () => renameTrack(st));
            const el = h('div', { class: 'daw-strip ' + kind + (sel ? ' selected' : ''), style: { '--track-color': color } },
                name, inserts, sends, h('div', { class: 'daw-strip-panrow' }, pf, panLbl),
                h('div', { class: 'daw-strip-fader' }, vf, h('div', { class: 'daw-meter' }, meterL, meterR)), dbLbl, peakLbl, btns);
            el.addEventListener('pointerdown', e => { if (e.target.closest('button, .daw-fader, .daw-insert')) return; S.selectedStrip = st.id; if (isTrack) E.selectedTrackId = st.id; render(); });
            return el;
        };
        proj.tracks.forEach(t => wrap.appendChild(strip(t, 'track')));
        wrap.appendChild(h('div', { class: 'daw-mixer-sep' }));
        proj.returns.forEach(r => wrap.appendChild(strip(r, 'return')));
        wrap.appendChild(strip(proj.master, 'master'));
        body.appendChild(wrap);
    }

    // ----------------------------------------------------------- meters loop
    const buf = new Float32Array(1024);
    function peakOf(an) {
        an.getFloatTimeDomainData(buf.subarray(0, an.fftSize));
        let m = 0; for (let i = 0; i < an.fftSize; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; }
        return m;
    }
    const meterPos = pk => U.clamp((20 * Math.log10(Math.max(pk, 1e-6)) + 60) / 66, 0, 1);
    function animate() {
        requestAnimationFrame(animate);
        if (!DAW.enabled || !E.project || !S.root) return;
        updatePlayhead();
        S.meters.forEach(m => {
            const node = stripNodeFor(m.id);
            if (!node) return;
            if (m.kind === 'track') {
                const pk = Math.max(peakOf(node.meterL), peakOf(node.meterR));
                m.el.style.height = meterPos(pk) * 100 + '%';
                m.el.classList.toggle('clip', pk >= 1);
            } else {
                const l = peakOf(node.meterL), r = peakOf(node.meterR);
                m.l.style.height = meterPos(l) * 100 + '%'; m.r.style.height = meterPos(r) * 100 + '%';
                m.l.classList.toggle('clip', l >= 1); m.r.classList.toggle('clip', r >= 1);
                const pk = Math.max(l, r), now = performance.now();
                if (pk > (m.hv || 0) || now - m.hold > 1500) { m.hv = pk; m.hold = now; m.peak.textContent = pk > 1e-5 ? (20 * Math.log10(pk)).toFixed(1) : '-inf'; m.peak.classList.toggle('clip', pk >= 1); }
            }
        });
        (S.fxMeters || []).forEach(m => {
            const node = stripNodeFor(m.stripId);
            const inst = node && node.instances.get(m.pluginId);
            if (!inst) return;
            if (m.kind === 'gr') { const gr = inst.getReduction(); m.fill.style.width = U.clamp(-gr / 24, 0, 1) * 100 + '%'; m.lbl.textContent = gr.toFixed(1) + ' dB'; }
            else if (m.kind === 'spectrum') drawSpectrum(m.cv, inst.analyser);
            else if (m.kind === 'curve' && !m.drawn) { drawCurve(m.cv, inst); m.drawn = performance.now(); }
            else if (m.kind === 'curve' && performance.now() - m.drawn > 120) { drawCurve(m.cv, inst); m.drawn = performance.now(); }
        });
    }
    function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#0ff'; }
    function drawSpectrum(cv, an) {
        const g = cv.getContext('2d'), W = cv.width, H = cv.height;
        const data = new Float32Array(an.frequencyBinCount);
        an.getFloatFrequencyData(data);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        [100, 1000, 10000].forEach(f => { const x = Math.log(f / 20) / Math.log(1000) * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); });
        g.strokeStyle = cssVar('--accent-color'); g.lineWidth = 1.5; g.beginPath();
        const nyq = E.ctx.sampleRate / 2;
        for (let x = 0; x < W; x++) {
            const f = 20 * Math.pow(1000, x / W), i = Math.min(data.length - 1, Math.round(f / nyq * data.length));
            const y = H - U.clamp((data[i] + 100) / 90, 0, 1) * H;
            if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
    }
    function drawCurve(cv, inst) {
        const g = cv.getContext('2d'), W = cv.width, H = cv.height;
        g.clearRect(0, 0, W, H);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
        const freqs = new Float32Array(W); for (let x = 0; x < W; x++) freqs[x] = 20 * Math.pow(1000, x / W);
        const total = new Float32Array(W).fill(1), mag = new Float32Array(W), ph = new Float32Array(W);
        (inst.filters || []).forEach(f => { f.getFrequencyResponse(freqs, mag, ph); for (let x = 0; x < W; x++) total[x] *= mag[x]; });
        g.strokeStyle = cssVar('--accent-color'); g.lineWidth = 2; g.beginPath();
        for (let x = 0; x < W; x++) { const db = 20 * Math.log10(Math.max(total[x], 1e-5)); const y = H / 2 - U.clamp(db, -24, 24) / 24 * (H / 2 - 4); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
    }

    // ----------------------------------------------------------------- files
    async function importFiles(files, beat, trackId) {
        const proj = E.project;
        for (const f of files) {
            const name = f.name.toLowerCase();
            try {
                if (name.endsWith('.mid') || name.endsWith('.midi')) {
                    const res = DAW.importMidi(await f.arrayBuffer());
                    mutate('Import MIDI', () => {
                        if (res.bpm && !proj.tracks.some(t => t.clips.length)) proj.bpm = res.bpm;
                        if (res.timeSig) proj.timeSig = res.timeSig;
                        res.tracks.forEach(rt => {
                            if (!rt.notes.length) return;
                            const t = DAW.newTrack('instrument', { index: proj.tracks.length, name: rt.name, instrument: rt.drums ? 'drums' : 'synth', preset: rt.drums ? '808 Style' : 'Init Saw' });
                            const notes = rt.drums ? rt.notes.map(n => Object.assign(n, { p: DAW.gmToDrum(n.p) })) : rt.notes;
                            const len = Math.ceil(Math.max(...notes.map(n => n.s + n.l)) / E.beatsPerBar()) * E.beatsPerBar();
                            t.clips.push(DAW.newMidiClip(beat || 0, len, notes, rt.name));
                            proj.tracks.push(t);
                        });
                    });
                    message(`Imported ${res.tracks.length} MIDI track(s) from ${f.name}`);
                } else if (name.endsWith('.json') || name.endsWith('.usdaw')) {
                    await openProjectFile(f);
                } else {
                    const ab = await f.arrayBuffer();
                    const buffer = await E.ctx.decodeAudioData(ab);
                    const id = DAW.addToPool(buffer, f.name);
                    mutate('Import audio', () => {
                        const len = buffer.duration / E.spb(), at = beat || 0;
                        const free = x => x.type === 'audio' && !x.clips.some(c => c.start < at + len && c.start + c.length > at);
                        let t = trackId ? DAW.findTrack(proj, trackId) : null;
                        if (!t || t.type !== 'audio') t = proj.tracks.find(x => x.type === 'audio' && x.id === E.selectedTrackId) || proj.tracks.find(free) || null;
                        if (!t) { t = DAW.newTrack('audio', { index: proj.tracks.length, name: f.name.replace(/\.[^.]+$/, '') }); proj.tracks.push(t); }
                        const c = DAW.newAudioClip(beat || 0, buffer.duration / E.spb(), id, f.name.replace(/\.[^.]+$/, ''));
                        t.clips.push(c);
                        trackId = t.id;
                        beat = (beat || 0) + c.length;
                    });
                    message('Imported ' + f.name);
                }
            } catch (e) {
                console.error(e);
                message('Could not import ' + f.name + ': ' + e.message, 4000);
            }
        }
    }
    async function saveProjectFile() {
        message('Packing project…');
        const data = await DAW.serializeProject(E.project, true);
        download(new Blob([JSON.stringify(data)], { type: 'application/json' }), (E.project.name || 'song').replace(/[^\w\- ]+/g, '') + '.usdaw.json');
        message('Project saved');
    }
    async function openProjectFile(file) {
        try {
            const obj = JSON.parse(await file.text());
            const proj = await DAW.deserializeProject(obj, E.ctx);
            DAW.history.push('Open project');
            DAW.loadState(normalizeProject(proj));
            S.selectedClips.clear(); S.editClipId = null; S.selectedStrip = E.selectedTrackId;
            render(); autosave();
            message('Opened ' + file.name);
        } catch (e) { message('Could not open project: ' + e.message, 4000); }
    }
    function normalizeProject(p) {
        const d = DAW.newProject();
        const out = Object.assign({}, d, p);
        out.loop = Object.assign({}, d.loop, p.loop || {});
        out.markers = p.markers || [];
        out.returns = p.returns && p.returns.length === 2 ? p.returns : d.returns;
        out.master = p.master || d.master;
        out.tracks = (p.tracks || []).map(t => {
            t.automation = t.automation || { show: false, param: 'volume', lanes: {} };
            t.sends = t.sends || [0, 0]; t.plugins = t.plugins || []; t.clips = t.clips || []; t.height = t.height || 64;
            if (t.type === 'instrument' && (!t.instrument || !DAW.INSTRUMENTS[t.instrument.type])) t.instrument = DAW.newInstrument('synth');
            else if (t.instrument) t.instrument.params = Object.assign(DAW.defaultParams(DAW.INSTRUMENTS[t.instrument.type].params), t.instrument.params);
            t.plugins = t.plugins.filter(p2 => DAW.PLUGINS[p2.type]).map(p2 => Object.assign(p2, { params: Object.assign(DAW.defaultParams(DAW.PLUGINS[p2.type].params), p2.params) }));
            return t;
        });
        return out;
    }
    function newProject() {
        if (!confirm('Start a new song? Unsaved changes in the current song will be lost (you can still Undo).')) return;
        DAW.history.push('New project');
        DAW.loadState(DAW.newProject());
        S.selectedClips.clear(); S.editClipId = null; S.selectedStrip = E.selectedTrackId;
        render(); autosave();
    }
    function exportDialog(onlyTrackIds) {
        const proj = E.project;
        const range = h('select', null, h('option', { value: 'song' }, 'Whole song'), h('option', { value: 'loop' }, 'Loop region'));
        const sr = h('select', null, h('option', { value: '44100' }, '44.1 kHz'), h('option', { value: '48000' }, '48 kHz'), h('option', { value: '96000' }, '96 kHz'));
        const bits = h('select', null, h('option', { value: '16' }, '16-bit'), h('option', { value: '24' }, '24-bit'), h('option', { value: '32' }, '32-bit float'));
        const stems = h('input', { type: 'checkbox' });
        const tail = h('input', { type: 'number', min: 0, max: 20, step: 0.5, value: 2 });
        const body = h('div', { class: 'daw-form' },
            h('label', null, 'Range ', range), h('label', null, 'Sample rate ', sr), h('label', null, 'Bit depth ', bits),
            h('label', null, 'Tail (seconds) ', tail),
            onlyTrackIds ? null : h('label', null, stems, ' Export stems (one file per track)'),
            h('p', { class: 'daw-form-note' }, 'Renders offline (faster than real time) through every instrument, plugin, send and the master chain.'));
        modal(onlyTrackIds ? 'Bounce track' : 'Export audio (WAV)', body, [
            { label: 'Cancel' },
            { label: 'Export', primary: true, action: () => { doExport(range.value, parseInt(sr.value, 10), parseInt(bits.value, 10), stems.checked, onlyTrackIds, parseFloat(tail.value) || 0); } },
        ]);
    }
    async function doExport(range, sampleRate, bits, stems, onlyTrackIds, tail) {
        const proj = E.project;
        const from = range === 'loop' ? proj.loop.start : 0;
        const to = range === 'loop' ? proj.loop.end : Math.max(DAW.songEndBeat(proj), E.beatsPerBar());
        const base = (proj.name || 'song').replace(/[^\w\- ]+/g, '');
        const renderOne = async (ids, label) => {
            const p = U.deepClone(proj);
            if (ids) p.tracks.forEach(t => { t.solo = false; t.mute = !ids.includes(t.id); });
            message('Rendering ' + label + '…', 60000);
            const buf = await DAW.renderOffline(p, from, to, sampleRate, tail);
            download(DAW.encodeWav(buf, bits), base + (label === 'mix' ? '' : ' - ' + label) + '.wav');
        };
        try {
            if (onlyTrackIds) await renderOne(onlyTrackIds, DAW.findTrack(proj, onlyTrackIds[0]).name);
            else if (stems) { for (const t of proj.tracks) { if (t.clips.length) await renderOne([t.id], t.name); } }
            else await renderOne(null, 'mix');
            message('Export complete');
        } catch (e) { console.error(e); message('Export failed: ' + e.message, 5000); }
    }
    function fileMenu(anchor) {
        const r = anchor.getBoundingClientRect();
        showMenu(r.left, r.bottom + 4, [
            { label: 'New song', action: newProject },
            { label: 'Open project…', key: 'Ctrl+O', action: async () => { const f = await pickFile('.json,.usdaw,application/json'); if (f.length) openProjectFile(f[0]); } },
            { label: 'Save project (with audio)', key: 'Ctrl+S', action: saveProjectFile },
            '-',
            { label: 'Import audio file(s)…', action: async () => { const f = await pickFile('audio/*', true); if (f.length) importFiles(f, E.position, null); } },
            { label: 'Import MIDI file…', action: async () => { const f = await pickFile('.mid,.midi,audio/midi'); if (f.length) importFiles(f, 0, null); } },
            '-',
            { label: 'Export audio / stems (WAV)…', key: 'Ctrl+Shift+E', action: () => exportDialog() },
            { label: 'Export MIDI file', action: () => download(DAW.exportMidi(E.project), (E.project.name || 'song') + '.mid') },
        ]);
    }
    function editMenu(anchor) {
        const r = anchor.getBoundingClientRect();
        showMenu(r.left, r.bottom + 4, [
            { label: 'Undo', key: 'Ctrl+Z', disabled: !DAW.history.undoStack.length, action: doUndo },
            { label: 'Redo', key: 'Ctrl+Shift+Z', disabled: !DAW.history.redoStack.length, action: doRedo },
            '-',
            { label: 'Copy clips', key: 'Ctrl+C', action: copyClips },
            { label: 'Paste clips at playhead', key: 'Ctrl+V', disabled: !S.clipboard, action: () => pasteClips() },
            { label: 'Duplicate clips', key: 'Ctrl+D', action: duplicateClips },
            { label: 'Split at playhead', key: 'Ctrl+E', action: splitAtPlayhead },
            { label: 'Delete clips', key: 'Del', action: deleteSelectedClips },
            { label: 'Select all clips', key: 'Ctrl+A', action: () => { S.selectedClips = new Set(allClips().map(x => x.clip.id)); render(); } },
            '-',
            { label: 'Insert 1 bar of silence at playhead', action: () => insertTime(E.beatsPerBar()) },
            { label: 'Delete 1 bar at playhead', action: () => insertTime(-E.beatsPerBar()) },
            { label: 'Duplicate track', key: 'Ctrl+Shift+D', disabled: !selectedTrack(), action: () => duplicateTrack(selectedTrack()) },
        ]);
    }
    function insertTime(beats) {
        const at = snapFloor(E.currentBeat());
        mutate(beats > 0 ? 'Insert time' : 'Delete time', () => {
            const proj = E.project;
            proj.tracks.forEach(t => {
                if (beats < 0) {
                    const cutEnd = at - beats;
                    t.clips.forEach(c => { if (c.start < cutEnd && c.start + c.length > at) { const r = DAW.splitClip(c, cutEnd); if (r) t.clips.push(r); } });
                    t.clips.forEach(c => { if (c.start < at && c.start + c.length > at) { const r = DAW.splitClip(c, at); if (r) t.clips.push(r); } });
                    t.clips = t.clips.filter(c => !(c.start >= at && c.start < cutEnd));
                }
                t.clips.forEach(c => { if (c.start >= at) c.start = Math.max(0, c.start + beats); });
                Object.values(t.automation.lanes).forEach(l => l.forEach(p => { if (p.b >= at) p.b = Math.max(at, p.b + beats); }));
            });
            proj.markers.forEach(m => { if (m.b >= at) m.b = Math.max(at, m.b + beats); });
        });
    }
    function showHelp() {
        const rows = [
            ['Space', 'Play / stop (when the DAW has focus)'], ['R', 'Record'], ['Home / End', 'Jump to start / end of song'],
            ['C', 'Metronome'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+C / Ctrl+V', 'Copy / paste clips or notes'],
            ['Ctrl+D', 'Duplicate selection'], ['Ctrl+E', 'Split clip at playhead'], ['Delete', 'Delete selected clips / notes'],
            ['Ctrl+A', 'Select all'], ['Q', 'Quantize selected notes'], ['↑ ↓ (Shift = octave)', 'Transpose selected notes'],
            ['← →', 'Nudge selected notes by grid'], ['= / -', 'Zoom in / out'], ['M', 'Mute selected track'], ['1 / 2 / 3', 'Piano roll / Devices / Mixer'],
            ['Ctrl+S', 'Save project'], ['Alt-drag clip', 'Copy clip'], ['Shift-drag fader', 'Fine adjust'], ['Double-click slider', 'Reset to default'],
        ];
        modal('Advanced Mode – shortcuts & tips', h('div', null,
            h('p', null, 'Play notes with the on-screen keyboard, your computer keyboard (A W S E D …) or a MIDI controller: they go to the selected track (or the armed track while recording). The note keys still play notes even while the DAW has focus, so the shortcuts below avoid them.'),
            h('table', { class: 'daw-help' }, rows.map(([k, v]) => h('tr', null, h('td', null, h('kbd', null, k)), h('td', null, v))))));
    }

    // ------------------------------------------------------------- shortcuts
    function onKeyDown(e) {
        if (!DAW.enabled) return;
        const tgt = e.target;
        if (tgt && tgt.closest && tgt.closest('input, select, textarea, [contenteditable="true"]')) return;
        const ctrl = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        const consume = () => { e.preventDefault(); e.stopImmediatePropagation(); };
        if (k === 'escape' && document.querySelector('.daw-menu')) { consume(); closeMenus(); return; }
        if (ctrl && k === 's') { consume(); saveProjectFile(); return; }
        if (!S.focus) return;
        if (e.code === 'Space') { consume(); if (!e.repeat) togglePlay(); return; }
        if (ctrl) {
            if (k === 'z' && !e.shiftKey) { consume(); doUndo(); return; }
            if ((k === 'z' && e.shiftKey) || k === 'y') { consume(); doRedo(); return; }
            if (k === 'o') { consume(); pickFile('.json,.usdaw,application/json').then(f => f.length && openProjectFile(f[0])); return; }
            if (k === 'e' && e.shiftKey) { consume(); exportDialog(); return; }
            if (k === 'e') { consume(); splitAtPlayhead(); return; }
            if (k === 'd' && e.shiftKey) { consume(); if (selectedTrack()) duplicateTrack(selectedTrack()); return; }
            if (S.tab === 'piano' && DAW.PianoRoll && DAW.PianoRoll.handleKey(e, k, ctrl)) { consume(); return; }
            if (k === 'c') { consume(); copyClips(); return; }
            if (k === 'v') { consume(); pasteClips(); return; }
            if (k === 'd') { consume(); duplicateClips(); return; }
            if (k === 'a') { consume(); S.selectedClips = new Set(allClips().map(x => x.clip.id)); render(); return; }
            return;
        }
        if (S.tab === 'piano' && DAW.PianoRoll && DAW.PianoRoll.handleKey(e, k, false)) { consume(); return; }
        if (k === 'delete' || k === 'backspace') { consume(); deleteSelectedClips(); return; }
        if (k === 'home') { consume(); E.seek(0); return; }
        if (k === 'end') { consume(); E.seek(DAW.songEndBeat(E.project)); return; }
        if (e.repeat) return;
        if (k === 'r') { consume(); E.record(); render(); return; }
        if (k === 'c') { consume(); E.project.metronome = !E.project.metronome; changed(); return; }
        if (k === '=' || k === '+') { consume(); setZoom(E.project.zoom * 1.4); return; }
        if (k === '-') { consume(); setZoom(E.project.zoom / 1.4); return; }
        if (k === 'm') { const t = selectedTrack(); if (t) { consume(); mutate('Mute', () => { t.mute = !t.mute; }); } return; }
        if (k === '0') { if (S.selectedClips.size) { consume(); mutate('Mute clip', () => selectedClipObjs().forEach(x => { x.clip.muted = !x.clip.muted; })); } return; }
        if (k === '1' || k === '2' || k === '3') { consume(); S.tab = ['piano', 'devices', 'mixer'][parseInt(k, 10) - 1]; renderBottom(); return; }
        if (k === 'escape') { S.selectedClips.clear(); render(); }
    }
    function onKeyUp(e) {
        if (!DAW.enabled || !S.focus) return;
        if (e.code === 'Space' && !(e.target && e.target.closest && e.target.closest('input, select, textarea'))) { e.preventDefault(); e.stopImmediatePropagation(); }
    }

    // ----------------------------------------------------------------- render
    let renderQueued = false;
    function render() {
        if (!S.root || !E.project) return;
        renderTransport();
        renderArrange();
        renderBottom();
    }
    function renderSoon() {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(() => { renderQueued = false; render(); });
    }
    DAW.render = render;
    DAW.renderArrangeOnly = () => { if (S.root && E.project) { renderTransport(); renderArrange(); } };

    // Light-up the on-screen keyboard for notes played back on the selected track.
    function keyFlash(pitch, t, te) {
        const kb = document.getElementById('keyboard');
        if (!kb) return;
        const now = E.ctx.currentTime;
        const falling = typeof synthesiaToggle !== 'undefined' && synthesiaToggle && synthesiaToggle.checked && typeof startFallingNote === 'function' && typeof midiNoteToNoteString === 'function';
        setTimeout(() => {
            if (!E.playing) return;
            const el = kb.querySelector(`[data-midi="${pitch}"]`);
            if (el) el.classList.add('daw-hit');
            const ns = falling ? midiNoteToNoteString(pitch) : null;
            if (ns) startFallingNote(ns);
            setTimeout(() => { if (el) el.classList.remove('daw-hit'); if (ns) releaseFallingNote(ns); }, Math.max(60, (te - t) * 1000));
        }, Math.max(0, (t - now) * 1000));
    }

    // ------------------------------------------------------------------ boot
    DAW.enabled = false;
    DAW.boot = function (ctx, output) {
        if (DAW.booted) return;
        DAW.booted = true;
        E.init(ctx, output);
        let proj = null;
        try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) proj = normalizeProject(JSON.parse(raw)); } catch (e) { proj = null; }
        E.setProject(proj || DAW.newProject());
        S.selectedStrip = E.selectedTrackId;
        E.on((type, data) => {
            if (type === 'transport') { renderTransport(); updatePlayhead(true); if (S.tab === 'piano') renderBottom(); }
            else if (type === 'project') { if (data && data.light) renderSoon(); else render(); autosave(); }
            else if (type === 'message') message(data, 4000);
            else if (type === 'notevis' && DAW.enabled) keyFlash(data.pitch, data.t, data.te);
        });
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        requestAnimationFrame(animate);
        const root = document.getElementById('dawRoot');
        if (root) build(root);
        if (localStorage.getItem('synthAdvancedMode') === 'true') DAW.setEnabled(true);
    };
    DAW.setEnabled = function (on) {
        DAW.enabled = !!on;
        localStorage.setItem('synthAdvancedMode', DAW.enabled);
        document.body.classList.toggle('daw-on', DAW.enabled);
        const b = document.getElementById('advancedModeButton');
        if (b) b.textContent = DAW.enabled ? 'Exit Advanced Mode' : 'Advanced Mode (DAW)';
        if (!DAW.enabled) {
            E.stop(true);
            E.liveVoices.forEach(v => v.voice.release(E.ctx.currentTime));
            E.liveVoices.clear();
            if (S.fullscreen) toggleFullscreen();
        } else {
            if (E.ctx && E.ctx.state === 'suspended') E.ctx.resume();
            render();
        }
    };

    // Bridge used by the main synth page (playNote / stopNote / panic).
    DAW.wantsLiveInput = () => DAW.enabled && E.wantsLiveInput();
    DAW.liveNoteOn = (noteString, vel) => E.liveNoteOn(U.noteStringToMidi(noteString), vel);
    DAW.liveNoteOff = noteString => E.liveNoteOff(U.noteStringToMidi(noteString));
    DAW.panic = () => { if (DAW.booted) { E.panic(); render(); } };
})();
