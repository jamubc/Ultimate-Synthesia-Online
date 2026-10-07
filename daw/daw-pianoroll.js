/* Ultimate Synthesia Online - Advanced Mode DAW
 * Piano roll: draw / select / move / resize notes, velocity lane, quantize, transpose,
 * scale highlighting, chord stamping, legato, humanize and clip length editing.
 */
(function () {
    'use strict';
    const DAW = window.DAW;
    const U = DAW.util;
    const E = DAW.engine;
    const h = DAW.h;

    const ROW_H = 14, KEYS_W = 72, RULER_H = 22, VEL_H = 72;
    const SCALES = {
        Off: null, Major: [0, 2, 4, 5, 7, 9, 11], Minor: [0, 2, 3, 5, 7, 8, 10], 'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
        Dorian: [0, 2, 3, 5, 7, 9, 10], Mixolydian: [0, 2, 4, 5, 7, 9, 10], Phrygian: [0, 1, 3, 5, 7, 8, 10],
        'Major Pentatonic': [0, 2, 4, 7, 9], 'Minor Pentatonic': [0, 3, 5, 7, 10], Blues: [0, 3, 5, 6, 7, 10],
    };
    const CHORDS = { Off: [0], Major: [0, 4, 7], Minor: [0, 3, 7], '7th': [0, 4, 7, 10], 'Maj7': [0, 4, 7, 11], 'Min7': [0, 3, 7, 10], Sus2: [0, 2, 7], Sus4: [0, 5, 7], Dim: [0, 3, 6], Aug: [0, 4, 8], Power: [0, 7, 12], Octave: [0, 12] };
    const LENGTHS = [['Grid', 0], ['1/32', 0.125], ['1/16', 0.25], ['1/8', 0.5], ['1/4', 1], ['1/2', 2], ['1 Bar', -1]];

    const st = { zoom: 80, tool: 'draw', noteLen: 0, lastLen: 0.25, vel: 0.8, chord: 'Off', scaleRoot: 0, scale: 'Off', scaleSnap: false, selected: new Set(), clipId: null, clipboard: null, strength: 1 };
    let cur = null; // { track, clip, els }

    const snapBeats = () => DAW.snap.snapBeats();
    const snap = b => DAW.snap.snap(b);
    const snapFloor = b => DAW.snap.snapFloor(b);
    const inScale = p => { const sc = SCALES[st.scale]; return !sc || sc.includes(((p - st.scaleRoot) % 12 + 12) % 12); };
    function toScale(p) {
        if (!st.scaleSnap || !SCALES[st.scale]) return p;
        for (let d = 0; d < 12; d++) { if (inScale(p - d)) return p - d; if (inScale(p + d)) return p + d; }
        return p;
    }
    function newLen() {
        if (st.noteLen === -1) return E.beatsPerBar();
        if (st.noteLen > 0) return st.noteLen;
        return st.lastLen || snapBeats() || 0.25;
    }
    function preview(pitch, dur = 0.25) {
        if (!cur || !E.graph) return null;
        const strip = E.graph.tracks.get(cur.track.id);
        if (!strip) return null;
        if (E.ctx.state === 'suspended') E.ctx.resume();
        const v = DAW.INSTRUMENTS[cur.track.instrument.type].voice(E.ctx, strip.input, cur.track.instrument.params, pitch, st.vel, E.ctx.currentTime);
        if (dur) v.release(E.ctx.currentTime + dur);
        return v;
    }
    function rowBackground() {
        // 12-row repeating pattern starting at pitch 127 (G9) at the top.
        const stops = [];
        for (let r = 0; r < 12; r++) {
            const pc = ((127 - r) % 12 + 12) % 12;
            const black = [1, 3, 6, 8, 10].includes(pc);
            let col = black ? 'var(--daw-pr-black)' : 'var(--daw-pr-white)';
            if (SCALES[st.scale]) col = inScale(127 - r) ? (pc === st.scaleRoot ? 'var(--daw-pr-root)' : 'var(--daw-pr-scale)') : 'var(--daw-pr-off)';
            const y0 = r * ROW_H, y1 = (r + 1) * ROW_H;
            const line = pc === 0 ? 'var(--daw-grid-bar)' : 'var(--daw-pr-rowline)';
            stops.push(`${col} ${y0}px`, `${col} ${y1 - 1}px`, `${line} ${y1 - 1}px`, `${line} ${y1}px`);
        }
        return `repeating-linear-gradient(to bottom, ${stops.join(', ')})`;
    }
    function gridLines(z) {
        const bpb = E.beatsPerBar(), sb = snapBeats();
        const imgs = ['linear-gradient(to right, var(--daw-grid-bar) 1px, transparent 1px)', 'linear-gradient(to right, var(--daw-grid-beat) 1px, transparent 1px)'];
        const sizes = [bpb * z + 'px 100%', z + 'px 100%'];
        if (sb > 0 && sb < 1 && sb * z >= 6) { imgs.push('linear-gradient(to right, var(--daw-grid-sub) 1px, transparent 1px)'); sizes.push(sb * z + 'px 100%'); }
        imgs.push(rowBackground()); sizes.push('100% ' + ROW_H * 12 + 'px');
        return { backgroundImage: imgs.join(','), backgroundSize: sizes.join(',') };
    }
    function commit(label, fn) { DAW.mutate(label, fn, { noRender: true }); refresh(); }
    function refresh() { if (cur) { drawNotes(); drawVelocity(); updateClipInArrange(); } }
    function updateClipInArrange() {
        // Re-render the arrangement only (keeps the piano roll DOM and scroll position).
        if (DAW.renderArrangeOnly) DAW.renderArrangeOnly();
    }
    function notesSorted(clip) { return clip.notes.slice().sort((a, b) => a.s - b.s || a.p - b.p); }
    function selectedNotes() { return cur ? cur.clip.notes.filter(n => st.selected.has(n.id)) : []; }
    function targetNotes() { const s = selectedNotes(); return s.length ? s : (cur ? cur.clip.notes : []); }

    const PR = DAW.PianoRoll = {
        get hasSelection() { return st.selected.size > 0; },
        render(container, track, clip) {
            if (st.clipId !== clip.id) { st.selected.clear(); st.clipId = clip.id; st.needScroll = true; }
            cur = { track, clip, els: {} };
            const els = cur.els;
            const isDrums = track.instrument.type === 'drums';
            container.appendChild(toolbar(track, clip));
            const z = st.zoom;
            const bpb = E.beatsPerBar();
            const visBeats = Math.ceil((clip.length + bpb * 2) / bpb) * bpb;
            const W = visBeats * z, GH = 128 * ROW_H;
            els.scroll = h('div', { class: 'pr-scroll' });
            els.content = h('div', { class: 'pr-content', style: { gridTemplateColumns: `${KEYS_W}px ${W}px`, gridTemplateRows: `${RULER_H}px ${GH}px` } });
            els.corner = h('div', { class: 'pr-corner' }, clip.name);
            els.ruler = h('div', { class: 'pr-ruler' });
            els.keys = h('div', { class: 'pr-keys' + (isDrums ? ' drums' : '') });
            els.grid = h('div', { class: 'pr-grid', style: gridLines(z) });
            els.outside = h('div', { class: 'pr-outside', style: { left: clip.length * z + 'px' } });
            els.marquee = h('div', { class: 'pr-marquee' });
            els.playhead = h('div', { class: 'pr-playhead' });
            els.notes = h('div', { class: 'pr-notes' });
            els.grid.append(els.outside, els.notes, els.marquee, els.playhead);
            els.content.append(els.corner, els.ruler, els.keys, els.grid);
            els.scroll.appendChild(els.content);
            // Ruler: bars and the clip-end handle.
            for (let b = 0, bar = 1; b < visBeats; b += bpb, bar++) els.ruler.appendChild(h('div', { class: 'pr-bar', style: { left: b * z + 'px' } }, String(Math.floor((clip.start + b) / bpb) + 1)));
            els.endHandle = h('div', { class: 'pr-end', style: { left: clip.length * z + 'px' }, title: 'Drag to change the clip length' });
            els.ruler.appendChild(els.endHandle);
            els.endHandle.addEventListener('pointerdown', e => {
                e.stopPropagation();
                const r = els.ruler.getBoundingClientRect();
                DAW.history.push('Clip length');
                DAW.drag(e, ev => {
                    clip.length = Math.max(snapBeats() || 0.25, snap((ev.clientX - r.left) / z));
                    els.endHandle.style.left = els.outside.style.left = clip.length * z + 'px';
                }, () => { DAW.changed(); });
            });
            els.ruler.addEventListener('pointerdown', e => {
                if (e.target === els.endHandle) return;
                const r = els.ruler.getBoundingClientRect();
                E.seek(clip.start + snap(Math.max(0, (e.clientX - r.left) / z)));
            });
            // Keyboard column.
            for (let p = 127; p >= 0; p--) {
                const black = U.isBlack(p);
                const label = isDrums ? DAW.INSTRUMENTS.drums.drumName(p) + (p % 12 === 0 ? ' ' + U.noteName(p) : '') : (p % 12 === 0 ? U.noteName(p) : '');
                const k = h('div', { class: 'pr-key' + (black ? ' black' : '') + (p % 12 === 0 ? ' c' : '') + (!inScale(p) ? ' off' : ''), dataset: { pitch: p }, title: U.noteName(p) + (isDrums ? ' – ' + DAW.INSTRUMENTS.drums.drumName(p) : '') }, label);
                k.addEventListener('pointerdown', e => {
                    e.preventDefault();
                    const v = preview(p, 0);
                    k.classList.add('down');
                    const up = () => { k.classList.remove('down'); if (v) v.release(E.ctx.currentTime); window.removeEventListener('pointerup', up); };
                    window.addEventListener('pointerup', up);
                });
                els.keys.appendChild(k);
            }
            // Velocity lane.
            els.velWrap = h('div', { class: 'pr-vel-wrap' });
            els.velLabel = h('div', { class: 'pr-vel-label', style: { width: KEYS_W + 'px' } }, 'Velocity');
            els.vel = h('div', { class: 'pr-vel', style: { width: W + 'px', height: VEL_H + 'px' } });
            els.velClip = h('div', { class: 'pr-vel-clip' }, els.vel);
            els.velWrap.append(els.velLabel, els.velClip);
            els.scroll.addEventListener('scroll', () => { els.vel.style.transform = `translateX(${-els.scroll.scrollLeft}px)`; });
            container.append(els.scroll, els.velWrap);
            bindGrid(track, clip);
            bindVelocity(clip);
            drawNotes(); drawVelocity();
            PR.updatePlayhead(E.currentBeat());
            if (st.needScroll) {
                st.needScroll = false;
                requestAnimationFrame(() => {
                    const ps = clip.notes.map(n => n.p);
                    const center = ps.length ? (Math.max(...ps) + Math.min(...ps)) / 2 : (isDrums ? 40 : 60);
                    els.scroll.scrollTop = Math.max(0, (127 - center) * ROW_H - els.scroll.clientHeight / 2 + RULER_H);
                });
            } else if (st.scrollTop != null) {
                els.scroll.scrollTop = st.scrollTop; els.scroll.scrollLeft = st.scrollLeft;
                els.vel.style.transform = `translateX(${-st.scrollLeft}px)`;
            }
            els.scroll.addEventListener('scroll', () => { st.scrollTop = els.scroll.scrollTop; st.scrollLeft = els.scroll.scrollLeft; });
        },
        updatePlayhead(beat) {
            if (!cur || !cur.els.playhead || !cur.els.playhead.isConnected) return;
            const rel = beat - cur.clip.start;
            const ph = cur.els.playhead;
            if (rel < 0 || rel > cur.clip.length + E.beatsPerBar() * 2) { ph.style.display = 'none'; return; }
            ph.style.display = 'block';
            ph.style.transform = `translateX(${rel * st.zoom}px)`;
        },
        handleKey(e, k, ctrl) {
            if (!cur || !cur.els.scroll || !cur.els.scroll.isConnected) return false;
            const clip = cur.clip;
            if (ctrl) {
                if (k === 'a') { st.selected = new Set(clip.notes.map(n => n.id)); drawNotes(); drawVelocity(); return true; }
                if (k === 'c' && st.selected.size) { copyNotes(); return true; }
                if (k === 'v' && st.clipboard) { pasteNotes(); return true; }
                if (k === 'd' && st.selected.size) { duplicateNotes(); return true; }
                return false;
            }
            if ((k === 'delete' || k === 'backspace') && st.selected.size) { commit('Delete notes', () => { clip.notes = clip.notes.filter(n => !st.selected.has(n.id)); st.selected.clear(); }); return true; }
            if (k === 'q') { commit('Quantize', () => DAW.quantizeNotes(targetNotes(), st.strength)); return true; }
            if (!st.selected.size) return false;
            if (k === 'arrowup' || k === 'arrowdown') {
                const d = (k === 'arrowup' ? 1 : -1) * (e.shiftKey ? 12 : 1);
                commit('Transpose', () => selectedNotes().forEach(n => { n.p = U.clamp(n.p + d, 0, 127); }));
                const f = selectedNotes()[0]; if (f) preview(f.p, 0.15);
                return true;
            }
            if (k === 'arrowleft' || k === 'arrowright') {
                const d = (k === 'arrowright' ? 1 : -1) * (snapBeats() || 0.25);
                commit('Nudge notes', () => selectedNotes().forEach(n => { n.s = Math.max(0, n.s + d); }));
                return true;
            }
            if (k === 'escape') { st.selected.clear(); drawNotes(); drawVelocity(); return true; }
            return false;
        },
    };

    function toolbar(track, clip) {
        const sel = (opts, value, onChange, title) => {
            const s = h('select', { title }, opts.map(([n, v]) => h('option', { value: v, selected: String(v) === String(value) }, n)));
            s.addEventListener('change', () => onChange(s.value));
            return s;
        };
        const b = (label, fn, title, cls) => { const x = h('button', { class: 'daw-btn ' + (cls || ''), title: title || '', type: 'button' }, label); x.addEventListener('click', () => { fn(); x.blur(); }); return x; };
        const toolDraw = b('✎ Draw', () => { st.tool = 'draw'; DAW.render(); }, 'Draw tool: click to add notes, drag to set length, right-click to delete', st.tool === 'draw' ? 'active' : '');
        const toolSel = b('⬚ Select', () => { st.tool = 'select'; DAW.render(); }, 'Select tool: drag a box to select, double-click to add notes', st.tool === 'select' ? 'active' : '');
        const name = h('input', { type: 'text', class: 'pr-name', value: clip.name, title: 'Clip name' });
        name.addEventListener('change', () => commit('Rename clip', () => { clip.name = name.value || 'Clip'; }));
        const lenBars = h('input', { type: 'number', class: 'pr-len', min: 0.25, step: 0.25, value: +(clip.length / E.beatsPerBar()).toFixed(3), title: 'Clip length in bars' });
        lenBars.addEventListener('change', () => { DAW.mutate('Clip length', () => { clip.length = Math.max(0.0625, (parseFloat(lenBars.value) || 1) * E.beatsPerBar()); }); });
        const velIn = h('input', { type: 'number', class: 'pr-velin', min: 1, max: 127, value: Math.round(st.vel * 127), title: 'Velocity for new notes (1-127)' });
        velIn.addEventListener('change', () => { st.vel = U.clamp((parseInt(velIn.value, 10) || 100) / 127, 0.01, 1); });
        const rootSel = sel(U.NOTE_NAMES.map((n, i) => [n, i]), st.scaleRoot, v => { st.scaleRoot = parseInt(v, 10); DAW.render(); }, 'Scale root');
        const scaleSel = sel(Object.keys(SCALES).map(k => [k === 'Off' ? 'Scale: Off' : k, k]), st.scale, v => { st.scale = v; DAW.render(); }, 'Highlight a scale on the grid');
        const snapScale = h('label', { class: 'pr-check', title: 'Force new / moved notes onto the scale' }, h('input', { type: 'checkbox', checked: st.scaleSnap, onchange: e => { st.scaleSnap = e.target.checked; } }), 'Snap to scale');
        return h('div', { class: 'pr-toolbar' },
            h('div', { class: 'daw-group' }, toolDraw, toolSel),
            h('div', { class: 'daw-group' }, h('span', { class: 'daw-lbl' }, 'Clip'), name, lenBars, h('span', { class: 'daw-lbl' }, 'bars')),
            h('div', { class: 'daw-group' }, h('span', { class: 'daw-lbl' }, 'Note'), sel(LENGTHS, st.noteLen, v => { st.noteLen = parseFloat(v); }, 'Length of new notes'),
                h('span', { class: 'daw-lbl' }, 'Vel'), velIn, sel(Object.keys(CHORDS).map(k => [k === 'Off' ? 'Chord: Off' : k, k]), st.chord, v => { st.chord = v; }, 'Stamp chords when drawing')),
            h('div', { class: 'daw-group' },
                b('Quantize', () => commit('Quantize', () => DAW.quantizeNotes(targetNotes(), st.strength)), 'Quantize selected (or all) notes to the grid (Q)'),
                sel([['100%', 1], ['75%', 0.75], ['50%', 0.5], ['25%', 0.25]], st.strength, v => { st.strength = parseFloat(v); }, 'Quantize strength'),
                b('Legato', legato, 'Extend each note to the next one'),
                b('Humanize', humanize, 'Add subtle random timing and velocity variation'),
                b('×2', () => scaleTime(2), 'Double length (half speed)'), b('÷2', () => scaleTime(0.5), 'Halve length (double speed)'),
                b('Reverse', reverseNotes, 'Reverse note order in time')),
            h('div', { class: 'daw-group' }, h('span', { class: 'daw-lbl' }, 'Transpose'),
                b('-12', () => transpose(-12)), b('-1', () => transpose(-1)), b('+1', () => transpose(1)), b('+12', () => transpose(12))),
            h('div', { class: 'daw-group' }, rootSel, scaleSel, snapScale),
            h('div', { class: 'daw-group' }, h('span', { class: 'daw-lbl' }, 'Zoom'), b('−', () => { st.zoom = Math.max(10, st.zoom / 1.4); DAW.render(); }), b('+', () => { st.zoom = Math.min(600, st.zoom * 1.4); DAW.render(); }),
                b('Select all', () => { st.selected = new Set(clip.notes.map(n => n.id)); drawNotes(); drawVelocity(); }, 'Ctrl+A'),
                b('Delete', () => commit('Delete notes', () => { clip.notes = clip.notes.filter(n => !st.selected.has(n.id)); st.selected.clear(); }), 'Delete selected notes', 'danger'),
                b('Close', () => { DAW.ui.state.editClipId = null; DAW.render(); }, 'Close the piano roll')));
    }
    function transpose(d) { commit('Transpose', () => targetNotes().forEach(n => { n.p = U.clamp(n.p + d, 0, 127); })); }
    function legato() {
        commit('Legato', () => {
            const ns = notesSorted(cur.clip), tgt = new Set(targetNotes().map(n => n.id));
            ns.forEach(n => {
                if (!tgt.has(n.id)) return;
                const next = ns.find(m => m.s > n.s + 1e-6);
                n.l = (next ? next.s : cur.clip.length) - n.s;
            });
        });
    }
    function humanize() {
        commit('Humanize', () => targetNotes().forEach(n => {
            n.s = Math.max(0, n.s + (Math.random() * 2 - 1) * 0.02);
            n.v = U.clamp(n.v + (Math.random() * 2 - 1) * 0.1, 0.05, 1);
        }));
    }
    function scaleTime(f) {
        commit(f > 1 ? 'Double length' : 'Halve length', () => {
            const ns = targetNotes();
            const s0 = Math.min(...ns.map(n => n.s));
            ns.forEach(n => { n.s = s0 + (n.s - s0) * f; n.l *= f; });
            if (ns.length === cur.clip.notes.length) cur.clip.length = Math.max(0.25, cur.clip.length * f);
        });
    }
    function reverseNotes() {
        commit('Reverse notes', () => {
            const ns = targetNotes();
            const s0 = Math.min(...ns.map(n => n.s)), e0 = Math.max(...ns.map(n => n.s + n.l));
            ns.forEach(n => { n.s = s0 + (e0 - (n.s + n.l) - s0); });
        });
    }
    function copyNotes() {
        const ns = selectedNotes();
        const s0 = Math.min(...ns.map(n => n.s));
        st.clipboard = ns.map(n => ({ p: n.p, s: n.s - s0, l: n.l, v: n.v }));
        DAW.message(`Copied ${ns.length} note(s)`);
    }
    function pasteNotes() {
        const clip = cur.clip;
        let at = E.currentBeat() - clip.start;
        if (at < 0 || at >= clip.length) {
            const sel = selectedNotes();
            at = sel.length ? Math.max(...sel.map(n => n.s + n.l)) : 0;
        }
        at = snap(at);
        commit('Paste notes', () => {
            st.selected.clear();
            st.clipboard.forEach(n => { const nn = { id: U.uid('n'), p: n.p, s: at + n.s, l: n.l, v: n.v }; clip.notes.push(nn); st.selected.add(nn.id); });
            extendClipTo(clip, Math.max(...clip.notes.map(n => n.s + n.l)));
        });
    }
    function duplicateNotes() {
        const ns = selectedNotes();
        const s0 = Math.min(...ns.map(n => n.s)), e0 = Math.max(...ns.map(n => n.s + n.l));
        const span = Math.max(snapBeats() || 0.25, Math.ceil((e0 - s0) / (snapBeats() || 0.25) - 1e-9) * (snapBeats() || 0.25));
        commit('Duplicate notes', () => {
            st.selected.clear();
            ns.forEach(n => { const nn = Object.assign({}, n, { id: U.uid('n'), s: n.s + span }); cur.clip.notes.push(nn); st.selected.add(nn.id); });
            extendClipTo(cur.clip, e0 + span);
        });
    }
    function extendClipTo(clip, beat) {
        if (beat > clip.length) { const bpb = E.beatsPerBar(); clip.length = Math.ceil(beat / bpb - 1e-9) * bpb; }
    }

    function drawNotes() {
        if (!cur) return;
        const { clip, els } = cur, z = st.zoom;
        els.notes.innerHTML = '';
        const isDrums = cur.track.instrument.type === 'drums';
        clip.notes.forEach(n => {
            const el = h('div', {
                class: 'pr-note' + (st.selected.has(n.id) ? ' selected' : '') + (n.s >= clip.length ? ' outside' : ''),
                dataset: { id: n.id },
                style: { left: n.s * z + 'px', top: (127 - n.p) * ROW_H + 'px', width: Math.max(3, n.l * z - 1) + 'px', height: ROW_H - 1 + 'px', opacity: 0.45 + 0.55 * n.v },
                title: `${isDrums ? DAW.INSTRUMENTS.drums.drumName(n.p) : U.noteName(n.p)}  vel ${Math.round(n.v * 127)}`,
            }, n.l * z > 26 ? (isDrums ? DAW.INSTRUMENTS.drums.drumName(n.p) : U.noteName(n.p)) : '');
            els.notes.appendChild(el);
        });
        els.content.style.setProperty('--clip-color', cur.track.color);
    }
    function drawVelocity() {
        if (!cur) return;
        const { clip, els } = cur, z = st.zoom;
        els.vel.innerHTML = '';
        clip.notes.forEach(n => {
            els.vel.appendChild(h('div', {
                class: 'pr-velbar' + (st.selected.has(n.id) ? ' selected' : ''),
                style: { left: n.s * z + 'px', height: n.v * (VEL_H - 4) + 'px' }, title: 'Velocity ' + Math.round(n.v * 127),
            }));
        });
    }

    function bindGrid(track, clip) {
        const els = cur.els;
        const z = () => st.zoom;
        const posOf = e => { const r = els.grid.getBoundingClientRect(); return { b: (e.clientX - r.left) / z(), p: 127 - Math.floor((e.clientY - r.top) / ROW_H), x: e.clientX - r.left, y: e.clientY - r.top }; };
        const noteById = id => clip.notes.find(n => n.id === id);
        const addNotesAt = (b, p) => {
            const base = toScale(U.clamp(p, 0, 127));
            const len = newLen();
            const created = [];
            CHORDS[st.chord].forEach(iv => {
                const pitch = toScale(base + iv);
                if (pitch > 127 || clip.notes.some(n => n.p === pitch && Math.abs(n.s - b) < 1e-6)) return;
                const n = { id: U.uid('n'), p: pitch, s: b, l: len, v: st.vel };
                clip.notes.push(n); created.push(n);
            });
            return created;
        };
        els.grid.addEventListener('contextmenu', e => e.preventDefault());
        els.grid.addEventListener('pointerdown', e => {
            const noteEl = e.target.closest('.pr-note');
            const pos = posOf(e);
            if (e.button === 2) {
                // Right-click deletes (FL-style); drag to erase several.
                e.preventDefault();
                DAW.history.push('Erase notes');
                const erase = ev => {
                    const el = document.elementFromPoint(ev.clientX, ev.clientY);
                    const ne = el && el.closest && el.closest('.pr-note');
                    if (ne) { clip.notes = clip.notes.filter(n => n.id !== ne.dataset.id); st.selected.delete(ne.dataset.id); ne.remove(); }
                };
                erase(e);
                DAW.drag(e, erase, () => { drawVelocity(); DAW.changed({ noRender: true }); updateClipInArrange(); });
                return;
            }
            if (e.button !== 0) return;
            if (noteEl) { noteDown(e, noteById(noteEl.dataset.id), noteEl, pos); return; }
            if (st.tool === 'draw' && !e.shiftKey) {
                const b = Math.max(0, snapFloor(pos.b));
                DAW.history.push('Add note');
                const created = addNotesAt(b, pos.p);
                if (!created.length) return;
                st.selected = new Set(created.map(n => n.id));
                extendClipTo(clip, b + created[0].l);
                const voices = created.map(n => preview(n.p, 0));
                drawNotes();
                let stretching = false;
                DAW.drag(e, ev => {
                    if (!stretching && Math.abs(ev.clientX - e.clientX) < 5) return;
                    stretching = true;
                    const q = posOf(ev);
                    const sb = snapBeats() || 0.0625;
                    const len = snapBeats() ? Math.max(sb, snap(q.b - b)) : Math.max(0.03, q.b - b);
                    created.forEach(n => { n.l = len; });
                    drawNotes();
                }, () => {
                    voices.forEach(v => v && v.release(E.ctx.currentTime));
                    st.lastLen = created[0].l;
                    extendClipTo(clip, b + created[0].l);
                    drawVelocity(); DAW.changed({ noRender: true }); updateClipInArrange();
                });
                return;
            }
            // Marquee selection.
            const start = { x: pos.x, y: pos.y };
            const additive = e.shiftKey;
            const base = additive ? new Set(st.selected) : new Set();
            if (!additive) { st.selected.clear(); drawNotes(); drawVelocity(); }
            els.marquee.style.display = 'block';
            DAW.drag(e, ev => {
                const q = posOf(ev);
                const x0 = Math.min(start.x, q.x), x1 = Math.max(start.x, q.x), y0 = Math.min(start.y, q.y), y1 = Math.max(start.y, q.y);
                Object.assign(els.marquee.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
                st.selected = new Set(base);
                clip.notes.forEach(n => {
                    const nx0 = n.s * z(), nx1 = (n.s + n.l) * z(), ny0 = (127 - n.p) * ROW_H, ny1 = ny0 + ROW_H;
                    if (nx1 >= x0 && nx0 <= x1 && ny1 >= y0 && ny0 <= y1) st.selected.add(n.id);
                });
                drawNotes();
            }, () => { els.marquee.style.display = 'none'; drawVelocity(); });
        });
        els.grid.addEventListener('dblclick', e => {
            const noteEl = e.target.closest('.pr-note');
            if (noteEl) { commit('Delete note', () => { clip.notes = clip.notes.filter(n => n.id !== noteEl.dataset.id); st.selected.delete(noteEl.dataset.id); }); return; }
            if (st.tool === 'select') {
                const pos = posOf(e);
                commit('Add note', () => { const c = addNotesAt(Math.max(0, snapFloor(pos.b)), pos.p); st.selected = new Set(c.map(n => n.id)); if (c[0]) extendClipTo(clip, c[0].s + c[0].l); });
                preview(toScale(pos.p));
            }
        });

        function noteDown(e, note, noteEl, pos) {
            if (!note) return;
            const r = noteEl.getBoundingClientRect();
            const resize = e.clientX > r.right - Math.min(8, r.width / 3);
            if (e.shiftKey) {
                if (st.selected.has(note.id)) st.selected.delete(note.id); else st.selected.add(note.id);
                drawNotes(); drawVelocity();
                return;
            }
            if (!st.selected.has(note.id)) { st.selected = new Set([note.id]); }
            const sel = clip.notes.filter(n => st.selected.has(n.id));
            const orig = sel.map(n => ({ n, s: n.s, p: n.p, l: n.l }));
            const copy = e.altKey;
            let moved = false, lastPitch = note.p, voice = null;
            DAW.history.push(resize ? 'Resize notes' : copy ? 'Copy notes' : 'Move notes');
            if (!resize) voice = preview(note.p, 0);
            let copies = null;
            DAW.drag(e, ev => {
                const q = posOf(ev);
                const db = q.b - pos.b;
                if (!moved && Math.abs(ev.clientX - e.clientX) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return;
                moved = true;
                if (resize) {
                    const sb = snapBeats() || 0.0625;
                    orig.forEach(o => { o.n.l = Math.max(sb / 2, snap(o.l + db) || sb / 2); if (!snapBeats()) o.n.l = Math.max(0.03, o.l + db); });
                } else {
                    if (copy && !copies) {
                        copies = orig.map(o => { const c = Object.assign({}, o.n, { id: U.uid('n') }); clip.notes.push(c); return c; });
                        st.selected = new Set(orig.map(o => o.n.id));
                    }
                    const minS = Math.min(...orig.map(o => o.s));
                    const po = orig.find(o => o.n === note) || orig[0];
                    const ds = Math.max(-minS, snap(po.s + db) - po.s);
                    const dp = q.p - pos.p;
                    orig.forEach(o => { o.n.s = Math.max(0, o.s + ds); o.n.p = U.clamp(toScale(o.p + dp), 0, 127); });
                    if (note.p !== lastPitch) { lastPitch = note.p; if (voice) voice.release(E.ctx.currentTime); voice = preview(note.p, 0); }
                }
                drawNotes();
            }, () => {
                if (voice) voice.release(E.ctx.currentTime);
                if (!moved) { DAW.history.undoStack.pop(); st.selected = new Set([note.id]); drawNotes(); drawVelocity(); return; }
                if (resize) st.lastLen = note.l;
                extendClipTo(clip, Math.max(...sel.map(n => n.s + n.l)));
                drawNotes(); drawVelocity(); DAW.changed({ noRender: true }); updateClipInArrange();
            });
        }
    }

    function bindVelocity(clip) {
        const els = cur.els;
        els.vel.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            DAW.history.push('Edit velocity');
            const apply = ev => {
                const r = els.vel.getBoundingClientRect();
                const x = (ev.clientX - r.left) / st.zoom, v = U.clamp(1 - (ev.clientY - r.top) / VEL_H, 0.01, 1);
                const pool = st.selected.size ? clip.notes.filter(n => st.selected.has(n.id)) : clip.notes;
                let hit = pool.filter(n => x >= n.s - 4 / st.zoom && x <= n.s + Math.max(n.l, 6 / st.zoom));
                if (!hit.length) return;
                // Prefer notes starting closest to the pointer.
                const best = Math.min(...hit.map(n => Math.abs(n.s - x)));
                hit = hit.filter(n => Math.abs(Math.abs(n.s - x) - best) < 1e-6);
                hit.forEach(n => { n.v = v; });
                drawVelocity(); drawNotes();
            };
            apply(e);
            DAW.drag(e, apply, () => { DAW.changed({ noRender: true }); updateClipInArrange(); });
        });
    }
})();
