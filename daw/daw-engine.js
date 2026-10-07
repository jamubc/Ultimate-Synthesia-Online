/* Ultimate Synthesia Online - Advanced Mode DAW
 * Engine layer: project model, mixer graph, look-ahead scheduler, recording,
 * undo/redo history, offline bounce and file import/export (WAV, MIDI, project JSON).
 */
(function () {
    'use strict';
    const DAW = window.DAW;
    const U = DAW.util;

    const TRACK_COLORS = ['#00e5ff', '#ff4081', '#ffd740', '#69f0ae', '#b388ff', '#ff6e40', '#40c4ff', '#eeff41', '#ff80ab', '#64ffda', '#ea80fc', '#ffab40'];
    DAW.TRACK_COLORS = TRACK_COLORS;
    DAW.AUTOMATION_PARAMS = { volume: { name: 'Volume', min: 0, max: 2, def: 0.8 }, pan: { name: 'Pan', min: -1, max: 1, def: 0 }, sendA: { name: 'Send A', min: 0, max: 1, def: 0 }, sendB: { name: 'Send B', min: 0, max: 1, def: 0 } };

    // ------------------------------------------------------------ audio pool
    // Decoded AudioBuffers live outside the (JSON-serialisable) project: id -> {name, buffer, peaks}.
    const pool = new Map();
    DAW.audioPool = pool;
    function computePeaks(buffer, n = 2000) {
        const d0 = buffer.getChannelData(0), d1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : d0;
        const step = Math.max(1, Math.floor(buffer.length / n)), peaks = new Float32Array(Math.ceil(buffer.length / step));
        for (let i = 0, k = 0; i < buffer.length; i += step, k++) {
            let m = 0;
            for (let j = i; j < Math.min(i + step, buffer.length); j += 4) { const v = Math.max(Math.abs(d0[j]), Math.abs(d1[j])); if (v > m) m = v; }
            peaks[k] = m;
        }
        return peaks;
    }
    DAW.addToPool = function (buffer, name, id) {
        id = id || U.uid('au');
        pool.set(id, { id, name, buffer, peaks: computePeaks(buffer) });
        return id;
    };

    // ---------------------------------------------------------- project model
    DAW.newTrack = function (type, opts = {}) {
        const idx = opts.index || 0;
        const t = {
            id: U.uid('trk'), type, name: opts.name || (type === 'audio' ? 'Audio' : 'Instrument'),
            color: opts.color || TRACK_COLORS[idx % TRACK_COLORS.length],
            volume: 0.8, pan: 0, mute: false, solo: false, arm: false,
            sends: [0, 0], plugins: [], clips: [],
            automation: { show: false, param: 'volume', lanes: {} },
            height: 64,
        };
        if (type === 'instrument') t.instrument = DAW.newInstrument(opts.instrument || 'synth', opts.preset);
        return t;
    };
    DAW.newProject = function () {
        const p = {
            version: 1, name: 'Untitled Song', bpm: 120, timeSig: [4, 4],
            loop: { enabled: false, start: 0, end: 16 },
            metronome: false, countIn: false, recQuantize: 'off', followPlayhead: true,
            snap: 0.25, zoom: 40, length: 64,
            tracks: [], markers: [],
            returns: [
                { id: 'retA', name: 'A-Reverb', volume: 0.8, pan: 0, mute: false, plugins: [DAW.newPlugin('reverb', 'Return 100% Wet')] },
                { id: 'retB', name: 'B-Delay', volume: 0.8, pan: 0, mute: false, plugins: [DAW.newPlugin('delay', 'Return 100% Wet')] },
            ],
            master: { id: 'master', name: 'Master', volume: 0.9, pan: 0, mute: false, plugins: [DAW.newPlugin('limiter', 'Safe')] },
        };
        const synth = DAW.newTrack('instrument', { name: 'Ultimate Synth', index: 0, instrument: 'synth', preset: 'Init Saw' });
        synth.instrument.params.linkMain = 1;
        const drums = DAW.newTrack('instrument', { name: 'Drums', index: 1, instrument: 'drums', preset: '808 Style' });
        const keys = DAW.newTrack('instrument', { name: 'E-Piano', index: 2, instrument: 'fm', preset: 'E-Piano' });
        keys.sends[0] = 0.25;
        const audio = DAW.newTrack('audio', { name: 'Audio 1', index: 3 });
        p.tracks.push(synth, drums, keys, audio);
        // A starter drum pattern so the DAW makes sound straight away.
        const notes = [];
        for (let b = 0; b < 4; b++) {
            notes.push({ p: 36, s: b, l: 0.25, v: 0.95 });
            notes.push({ p: 42, s: b + 0.5, l: 0.25, v: 0.6 });
            if (b % 2 === 1) notes.push({ p: 38, s: b, l: 0.25, v: 0.9 });
        }
        drums.clips.push(DAW.newMidiClip(0, 4, notes, 'Beat'));
        return p;
    };
    DAW.newMidiClip = function (start, length, notes = [], name = 'MIDI Clip') {
        return { id: U.uid('clp'), kind: 'midi', name, start, length, notes: notes.map(n => Object.assign({ id: U.uid('n') }, n)), color: null };
    };
    DAW.newAudioClip = function (start, length, bufferId, name) {
        return { id: U.uid('clp'), kind: 'audio', name: name || 'Audio', start, length, bufferId, offset: 0, gain: 1, color: null };
    };
    DAW.findTrack = (proj, id) => proj.tracks.find(t => t.id === id);
    DAW.findStripState = (proj, id) => (id === 'master' ? proj.master : proj.returns.find(r => r.id === id) || proj.tracks.find(t => t.id === id));
    DAW.songEndBeat = proj => {
        let end = 0;
        proj.tracks.forEach(t => t.clips.forEach(c => { end = Math.max(end, c.start + c.length); }));
        return end;
    };
    DAW.automationValueAt = function (lane, beat, def) {
        if (!lane || !lane.length) return def;
        if (beat <= lane[0].b) return lane[0].v;
        for (let i = 1; i < lane.length; i++) {
            if (beat <= lane[i].b) {
                const a = lane[i - 1], b = lane[i];
                return a.v + (b.v - a.v) * ((beat - a.b) / Math.max(1e-9, b.b - a.b));
            }
        }
        return lane[lane.length - 1].v;
    };

    // ------------------------------------------------------------ mixer graph
    class Strip {
        constructor(graph, id) {
            const ctx = graph.ctx;
            this.graph = graph; this.ctx = ctx; this.id = id;
            this.input = ctx.createGain();
            this.vol = ctx.createGain();
            this.pan = ctx.createStereoPanner();
            this.mute = ctx.createGain();
            this.meter = ctx.createAnalyser(); this.meter.fftSize = 1024;
            this.splitter = ctx.createChannelSplitter(2);
            this.meterL = ctx.createAnalyser(); this.meterL.fftSize = 512;
            this.meterR = ctx.createAnalyser(); this.meterR.fftSize = 512;
            this.vol.connect(this.pan).connect(this.mute);
            this.mute.connect(this.splitter); this.splitter.connect(this.meterL, 0); this.splitter.connect(this.meterR, 1);
            this.sends = [ctx.createGain(), ctx.createGain()];
            this.sends.forEach(s => { s.gain.value = 0; this.mute.connect(s); });
            this.instances = new Map();
            this.chainSig = null;
            this.automated = {};
            this.input.connect(this.vol);
        }
        connectOut(dest) { this.mute.connect(dest); }
        syncPlugins(list) {
            const ctx = this.ctx, env = this.graph.env;
            const ids = new Set(list.map(p => p.id));
            for (const [id, inst] of this.instances) {
                if (!ids.has(id)) { try { inst.input.disconnect(); inst.output.disconnect(); if (inst.dispose) inst.dispose(); } catch (e) { /* noop */ } this.instances.delete(id); }
            }
            list.forEach(p => {
                if (!this.instances.has(p.id) && DAW.PLUGINS[p.type]) {
                    const inst = DAW.PLUGINS[p.type].create(ctx, env);
                    inst.type = p.type;
                    this.instances.set(p.id, inst);
                }
            });
            const sig = list.map(p => p.id + (p.bypass ? '0' : '1')).join('|');
            if (sig !== this.chainSig) {
                this.chainSig = sig;
                try { this.input.disconnect(); } catch (e) { /* noop */ }
                this.instances.forEach(inst => { try { inst.output.disconnect(); } catch (e) { /* noop */ } });
                let prev = this.input;
                list.forEach(p => {
                    const inst = this.instances.get(p.id);
                    if (!inst || p.bypass) return;
                    prev.connect(inst.input); prev = inst.output;
                });
                prev.connect(this.vol);
            }
            list.forEach(p => { const inst = this.instances.get(p.id); if (inst) inst.update(p.params); });
        }
        setParam(name, value) {
            const ctx = this.ctx;
            const param = name === 'volume' ? this.vol.gain : name === 'pan' ? this.pan.pan : name === 'sendA' ? this.sends[0].gain : this.sends[1].gain;
            param.setTargetAtTime(value, ctx.currentTime, 0.01);
        }
        paramFor(name) { return name === 'volume' ? this.vol.gain : name === 'pan' ? this.pan.pan : name === 'sendA' ? this.sends[0].gain : this.sends[1].gain; }
        dispose() {
            this.instances.forEach(inst => { try { inst.input.disconnect(); inst.output.disconnect(); if (inst.dispose) inst.dispose(); } catch (e) { /* noop */ } });
            [this.input, this.vol, this.pan, this.mute].concat(this.sends).forEach(n => { try { n.disconnect(); } catch (e) { /* noop */ } });
        }
    }

    class Graph {
        constructor(ctx, destination, project) {
            this.ctx = ctx;
            this.project = project;
            this.env = { getBpm: () => this.project.bpm };
            this.master = new Strip(this, 'master');
            this.master.connectOut(destination);
            this.returns = new Map();
            this.tracks = new Map();
            this.sync(project);
        }
        sync(project) {
            this.project = project;
            const anySolo = project.tracks.some(t => t.solo);
            const apply = (strip, st, mute, isTrack) => {
                strip.syncPlugins(st.plugins || []);
                if (!strip.automated.volume) strip.setParam('volume', st.volume);
                if (!strip.automated.pan) strip.setParam('pan', st.pan);
                strip.mute.gain.setTargetAtTime(mute ? 0 : 1, this.ctx.currentTime, 0.005);
                if (isTrack) {
                    if (!strip.automated.sendA) strip.setParam('sendA', st.sends[0]);
                    if (!strip.automated.sendB) strip.setParam('sendB', st.sends[1]);
                }
            };
            apply(this.master, project.master, project.master.mute, false);
            const retIds = new Set(project.returns.map(r => r.id));
            for (const [id, s] of this.returns) if (!retIds.has(id)) { s.dispose(); this.returns.delete(id); }
            project.returns.forEach(r => {
                if (!this.returns.has(r.id)) { const s = new Strip(this, r.id); s.connectOut(this.master.input); this.returns.set(r.id, s); }
                apply(this.returns.get(r.id), r, r.mute, false);
            });
            const trkIds = new Set(project.tracks.map(t => t.id));
            for (const [id, s] of this.tracks) if (!trkIds.has(id)) { s.dispose(); this.tracks.delete(id); }
            project.tracks.forEach(t => {
                let s = this.tracks.get(t.id);
                if (!s) {
                    s = new Strip(this, t.id); s.connectOut(this.master.input);
                    const rets = project.returns.map(r => this.returns.get(r.id));
                    s.sends.forEach((sg, i) => { if (rets[i]) sg.connect(rets[i].input); });
                    this.tracks.set(t.id, s);
                }
                apply(s, t, t.mute || (anySolo && !t.solo), true);
            });
        }
        dispose() {
            this.master.dispose();
            this.returns.forEach(s => s.dispose());
            this.tracks.forEach(s => s.dispose());
        }
    }
    DAW.Graph = Graph;

    // ------------------------------------------------- shared event scheduling
    // Schedules every event in [b0, b1) of the song, with beat b0 occurring at audio time t0.
    function scheduleRange(engineLike, project, graph, b0, b1, t0, opts) {
        const spb = 60 / project.bpm;
        const ctx = graph.ctx;
        const timeOf = b => t0 + (b - b0) * spb;
        const loopEnd = opts.loopEnd;
        project.tracks.forEach(track => {
            const strip = graph.tracks.get(track.id);
            if (!strip) return;
            if (track.type === 'instrument') {
                const def = DAW.INSTRUMENTS[track.instrument.type];
                track.clips.forEach(clip => {
                    if (clip.kind !== 'midi' || clip.muted) return;
                    const cEnd = clip.start + clip.length;
                    if (cEnd <= b0 || clip.start >= b1) return;
                    clip.notes.forEach(n => {
                        if (n.s >= clip.length || n.s < 0) return;
                        const ab = clip.start + n.s;
                        if (ab < b0 || ab >= b1) return;
                        let endB = Math.min(ab + n.l, cEnd);
                        if (loopEnd != null && ab < loopEnd) endB = Math.min(endB, loopEnd);
                        const t = timeOf(ab), te = timeOf(endB);
                        const v = def.voice(ctx, strip.input, track.instrument.params, n.p, n.v, Math.max(t, ctx.currentTime));
                        v.release(Math.max(te, t + 0.005));
                        if (engineLike) engineLike.trackVoice(v, track.id, n.p, t, te);
                    });
                });
            } else if (track.type === 'audio') {
                track.clips.forEach(clip => {
                    if (clip.kind !== 'audio' || clip.muted) return;
                    const entry = pool.get(clip.bufferId);
                    if (!entry) return;
                    const cEnd = clip.start + clip.length;
                    let startB = null;
                    if (clip.start >= b0 && clip.start < b1) startB = clip.start;
                    else if (opts.segmentStart && clip.start < b0 && cEnd > b0) startB = b0; // start in the middle of a clip
                    if (startB === null) return;
                    let endB = cEnd;
                    if (loopEnd != null && startB < loopEnd) endB = Math.min(endB, loopEnd);
                    const offset = clip.offset + (startB - clip.start) * spb;
                    const dur = (endB - startB) * spb;
                    if (offset >= entry.buffer.duration || dur <= 0) return;
                    const src = ctx.createBufferSource(); src.buffer = entry.buffer;
                    const g = ctx.createGain();
                    const t = timeOf(startB), te = timeOf(endB);
                    const fadeIn = clip.fadeIn ? clip.fadeIn * spb : 0.003, fadeOut = clip.fadeOut ? clip.fadeOut * spb : 0.003;
                    g.gain.setValueAtTime(0, Math.max(t, ctx.currentTime));
                    g.gain.linearRampToValueAtTime(clip.gain, Math.max(t, ctx.currentTime) + Math.max(0.003, startB === clip.start ? fadeIn : 0.003));
                    g.gain.setValueAtTime(clip.gain, Math.max(te - Math.max(0.003, fadeOut), t + 0.004));
                    g.gain.linearRampToValueAtTime(0, te);
                    src.connect(g).connect(strip.input);
                    src.start(Math.max(t, ctx.currentTime), offset, dur + 0.01);
                    if (engineLike) engineLike.trackSource(src);
                });
            }
            // Automation lanes.
            const lanes = track.automation && track.automation.lanes;
            if (lanes) {
                Object.keys(lanes).forEach(name => {
                    const lane = lanes[name];
                    if (!lane || !lane.length) { strip.automated[name] = false; return; }
                    strip.automated[name] = true;
                    const param = strip.paramFor(name);
                    if (opts.segmentStart) {
                        param.cancelScheduledValues(t0);
                        param.setValueAtTime(DAW.automationValueAt(lane, b0, 0), Math.max(t0, ctx.currentTime));
                    }
                    lane.forEach(pt => { if (pt.b > b0 && pt.b <= b1) param.linearRampToValueAtTime(pt.v, timeOf(pt.b)); });
                    // Hold the value at the segment end so the next segment continues from it.
                    if (!lane.some(pt => pt.b > b0 && pt.b <= b1)) param.linearRampToValueAtTime(DAW.automationValueAt(lane, b1, 0), timeOf(b1));
                });
            }
        });
        // Metronome (real-time only).
        if (opts.metronome && engineLike) {
            const bpb = project.timeSig[0] * (4 / project.timeSig[1]);
            const beatUnit = 4 / project.timeSig[1];
            for (let b = Math.ceil(b0 / beatUnit - 1e-9) * beatUnit; b < b1; b += beatUnit) {
                const barPos = ((b % bpb) + bpb) % bpb;
                engineLike.click(timeOf(b), Math.abs(barPos) < 1e-6);
            }
        }
    }

    // --------------------------------------------------------------- engine
    const E = DAW.engine = {
        ctx: null, graph: null, project: null, output: null,
        playing: false, recording: false,
        position: 0, // playhead in beats when stopped
        cursorBeat: 0, cursorTime: 0, anchors: [], timer: null, startBeat: 0,
        voices: new Set(), sources: new Set(), liveVoices: new Map(),
        rec: null, listeners: new Set(), selectedTrackId: null,
        lookahead: 0.12, interval: 25,

        init(ctx, output) {
            this.ctx = ctx; this.output = output || ctx.destination;
            this.clickGain = ctx.createGain(); this.clickGain.gain.value = 0.35; this.clickGain.connect(this.output);
        },
        setProject(project) {
            this.stop(true);
            this.project = project;
            if (this.graph) this.graph.dispose();
            this.graph = this.ctx ? new Graph(this.ctx, this.output, project) : null;
            if (!this.selectedTrackId || !DAW.findTrack(project, this.selectedTrackId)) this.selectedTrackId = project.tracks[0] ? project.tracks[0].id : null;
        },
        sync() { if (this.graph) this.graph.sync(this.project); },
        on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
        emit(type, data) { this.listeners.forEach(fn => { try { fn(type, data); } catch (e) { console.error(e); } }); },

        spb() { return 60 / this.project.bpm; },
        beatsPerBar() { return this.project.timeSig[0] * (4 / this.project.timeSig[1]); },
        currentBeat() {
            if (!this.playing) return this.position;
            const now = this.ctx.currentTime;
            let a = this.anchors[0];
            for (const an of this.anchors) { if (an.time <= now) a = an; else break; }
            return a.beat + (now - a.time) / this.spb();
        },

        trackVoice(v, trackId, pitch, t, te) {
            this.voices.add(v);
            v.onended = () => this.voices.delete(v);
            setTimeout(() => this.voices.delete(v), Math.max(0, (te - this.ctx.currentTime) * 1000) + 15000);
            if (trackId === this.selectedTrackId) this.emit('notevis', { pitch, t, te });
        },
        trackSource(src) { this.sources.add(src); src.onended = () => this.sources.delete(src); },
        click(t, accent) {
            const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.value = accent ? 1760 : 1100;
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 1 : 0.6, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
            o.connect(g).connect(this.clickGain); o.start(t); o.stop(t + 0.05);
            this.emit('click', { t, accent });
        },

        play(fromBeat) {
            if (!this.ctx || !this.project) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            if (this.playing) this.stop(false, true);
            const start = fromBeat != null ? fromBeat : this.position;
            this.playing = true;
            this.startBeat = start;
            this.cursorBeat = start;
            this.cursorTime = this.ctx.currentTime + 0.05;
            this.anchors = [{ time: this.cursorTime, beat: start }];
            this.segmentStart = true;
            this.tick();
            this.timer = setInterval(() => this.tick(), this.interval);
            this.emit('transport');
        },
        tick() {
            if (!this.playing) return;
            const proj = this.project, spb = this.spb();
            const target = this.ctx.currentTime + this.lookahead;
            let guard = 0;
            while (this.cursorTime < target && guard++ < 16) {
                const loop = proj.loop;
                const loopOn = loop.enabled && loop.end > loop.start && !this.countingIn();
                let segEnd = this.cursorBeat + (target - this.cursorTime) / spb;
                let wrap = false;
                if (loopOn && this.cursorBeat < loop.end && segEnd >= loop.end) { segEnd = loop.end; wrap = true; }
                const metronome = proj.metronome || this.cursorBeat < this.recStartBeat();
                scheduleRange(this, proj, this.graph, this.cursorBeat, segEnd, this.cursorTime, {
                    loopEnd: loopOn ? loop.end : null, segmentStart: this.segmentStart, metronome,
                });
                this.segmentStart = false;
                this.cursorTime += (segEnd - this.cursorBeat) * spb;
                this.cursorBeat = segEnd;
                if (wrap) {
                    this.cursorBeat = loop.start;
                    this.segmentStart = true;
                    this.anchors.push({ time: this.cursorTime, beat: loop.start });
                    if (this.rec) this.rec.passes++;
                }
            }
            // Prune anchors that are well in the past.
            const now = this.ctx.currentTime;
            while (this.anchors.length > 1 && this.anchors[1].time < now - 1) this.anchors.shift();
        },
        countingIn() { return this.rec && this.cursorBeat < this.rec.startBeat; },
        recStartBeat() { return this.rec ? this.rec.startBeat : -Infinity; },
        stop(silent, keepPosition) {
            const wasPlaying = this.playing;
            if (this.recording) this.finishRecording();
            if (this.timer) clearInterval(this.timer);
            this.timer = null;
            if (wasPlaying && !keepPosition) {
                const b = this.currentBeat();
                this.position = Math.max(0, b);
            } else if (!wasPlaying && !keepPosition && !silent) {
                this.position = 0; // second stop returns to start
            }
            this.playing = false;
            if (this.ctx) {
                const t = this.ctx.currentTime;
                this.voices.forEach(v => v.kill(t));
                this.voices.clear();
                this.sources.forEach(s => { try { s.stop(t + 0.02); } catch (e) { /* noop */ } });
                this.sources.clear();
                if (this.graph) {
                    // Release automation so static fader values apply again.
                    this.graph.tracks.forEach(s => {
                        ['volume', 'pan', 'sendA', 'sendB'].forEach(n => { const p = s.paramFor(n); p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); });
                        s.automated = {};
                    });
                    this.sync();
                }
            }
            if (!silent) this.emit('transport');
        },
        seek(beat) {
            beat = Math.max(0, beat);
            if (this.playing && !this.recording) { this.position = beat; this.play(beat); }
            else { this.position = beat; this.emit('transport'); }
        },
        panic() {
            this.stop(true);
            this.liveVoices.forEach(v => v.voice.kill());
            this.liveVoices.clear();
            this.emit('transport');
        },

        // ----- live input (on-screen keyboard, computer keys, MIDI)
        targetTrack() {
            const proj = this.project;
            if (!proj) return null;
            if (this.recording && this.rec) {
                const armed = proj.tracks.find(t => t.arm && t.type === 'instrument');
                if (armed) return armed;
            }
            return DAW.findTrack(proj, this.selectedTrackId);
        },
        wantsLiveInput() { const t = this.targetTrack(); return !!(DAW.enabled && t && t.type === 'instrument' && this.graph); },
        liveNoteOn(midi, vel) {
            const track = this.targetTrack();
            if (!track || track.type !== 'instrument' || !this.graph) return false;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const strip = this.graph.tracks.get(track.id);
            const existing = this.liveVoices.get(midi);
            if (existing) existing.voice.release(this.ctx.currentTime);
            const voice = DAW.INSTRUMENTS[track.instrument.type].voice(this.ctx, strip.input, track.instrument.params, midi, vel, this.ctx.currentTime);
            this.liveVoices.set(midi, { voice, trackId: track.id });
            if (this.recording && this.rec) {
                const b = this.currentBeat();
                this.rec.pending.set(midi, { s: b, v: vel, trackId: track.id, pass: this.rec.passes });
            }
            this.emit('live', { midi, on: true });
            return true;
        },
        liveNoteOff(midi) {
            const lv = this.liveVoices.get(midi);
            if (lv) { lv.voice.release(this.ctx.currentTime); this.liveVoices.delete(midi); }
            if (this.recording && this.rec && this.rec.pending.has(midi)) {
                const pend = this.rec.pending.get(midi);
                this.rec.pending.delete(midi);
                this.commitRecordedNote(midi, pend, this.currentBeat());
            }
            this.emit('live', { midi, on: false });
        },

        // ----- recording
        record() {
            if (!this.project || !this.ctx) return;
            if (this.recording) { this.stop(); return; }
            const proj = this.project;
            let armed = proj.tracks.filter(t => t.arm);
            if (!armed.length) {
                const sel = DAW.findTrack(proj, this.selectedTrackId);
                if (sel) { sel.arm = true; armed = [sel]; }
            }
            if (!armed.length) return;
            DAW.history.push('Record');
            const loop = proj.loop;
            let startBeat = this.playing ? this.currentBeat() : this.position;
            if (!this.playing && loop.enabled && loop.end > loop.start && (startBeat < loop.start || startBeat >= loop.end)) startBeat = loop.start;
            const bpb = this.beatsPerBar();
            this.rec = { startBeat, passes: 0, pending: new Map(), clips: new Map(), audio: null, undoPushed: true };
            this.recording = true;
            const instTracks = armed.filter(t => t.type === 'instrument');
            instTracks.forEach(t => {
                let clipStart, clipLen;
                if (loop.enabled && loop.end > loop.start) { clipStart = loop.start; clipLen = loop.end - loop.start; } else { clipStart = Math.floor(startBeat / bpb) * bpb; clipLen = bpb; }
                const clip = DAW.newMidiClip(clipStart, clipLen, [], 'Recording');
                clip.recording = true;
                t.clips.push(clip);
                this.rec.clips.set(t.id, clip);
            });
            const audioTrack = armed.find(t => t.type === 'audio');
            if (audioTrack) this.startAudioRecording(audioTrack);
            const countIn = proj.countIn && !this.playing;
            if (!this.playing) this.play(countIn ? startBeat - bpb : startBeat);
            this.emit('transport'); this.emit('project');
        },
        commitRecordedNote(midi, pend, endBeat) {
            const rec = this.rec, proj = this.project;
            const clip = rec.clips.get(pend.trackId);
            if (!clip) return;
            if (pend.s < rec.startBeat - 0.001 && !(proj.loop.enabled && pend.pass < rec.passes)) return; // played during count-in
            let s = pend.s, e = endBeat;
            const loop = proj.loop;
            if (loop.enabled && e < s) e = loop.end; // wrapped while held
            const q = proj.recQuantize !== 'off' ? parseFloat(proj.recQuantize) : 0;
            if (q) s = Math.round(s / q) * q;
            let rel = s - clip.start;
            if (rel < 0) return;
            const len = Math.max(0.03, e - s);
            clip.notes.push({ id: U.uid('n'), p: midi, s: rel, l: len, v: Math.round(pend.v * 127) / 127 });
            if (!loop.enabled) {
                const bpb = this.beatsPerBar();
                const need = Math.ceil((rel + len) / bpb) * bpb;
                if (need > clip.length) clip.length = need;
            }
            this.emit('project', { light: true });
        },
        finishRecording() {
            const rec = this.rec;
            if (!rec) return;
            const end = this.currentBeat();
            rec.pending.forEach((pend, midi) => this.commitRecordedNote(midi, pend, end));
            rec.pending.clear();
            rec.clips.forEach((clip, trackId) => {
                const t = DAW.findTrack(this.project, trackId);
                delete clip.recording;
                if (!clip.notes.length && t) t.clips = t.clips.filter(c => c !== clip);
                else if (t) {
                    clip.name = t.name + ' Rec';
                    DAW.resolveOverlaps(t, clip);
                }
            });
            if (rec.audio) this.stopAudioRecording(rec.audio);
            this.recording = false;
            this.rec = null;
            this.emit('project');
        },
        async startAudioRecording(track) {
            const rec = this.rec;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
                this.emit('message', 'Audio recording is not supported in this browser.');
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
                if (!this.recording || this.rec !== rec) { stream.getTracks().forEach(t => t.stop()); return; }
                const mr = new MediaRecorder(stream);
                const chunks = [];
                const audio = { mr, stream, chunks, trackId: track.id, startBeat: null };
                rec.audio = audio;
                mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
                mr.onstart = () => { audio.startBeat = Math.max(rec.startBeat, this.currentBeat()); };
                mr.start();
                this.emit('message', 'Recording audio from microphone…');
            } catch (e) {
                this.emit('message', 'Microphone access was denied: ' + e.message);
            }
        },
        stopAudioRecording(audio) {
            const { mr, stream, chunks } = audio;
            const startBeat = audio.startBeat != null ? audio.startBeat : 0;
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                try {
                    const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
                    const buf = await this.ctx.decodeAudioData(await blob.arrayBuffer());
                    const id = DAW.addToPool(buf, 'Recording');
                    const t = DAW.findTrack(this.project, audio.trackId);
                    if (t) {
                        const clip = DAW.newAudioClip(startBeat, buf.duration / this.spb(), id, 'Recording');
                        t.clips.push(clip);
                        DAW.resolveOverlaps(t, clip);
                        this.emit('project');
                    }
                } catch (e) { this.emit('message', 'Could not decode recorded audio: ' + e.message); }
            };
            try { mr.stop(); } catch (e) { /* noop */ }
        },
    };

    // When a clip lands on top of others on the same track, trim/split them (DAW-style "overwrite").
    DAW.resolveOverlaps = function (track, keep) {
        const ks = keep.start, ke = keep.start + keep.length;
        const out = [];
        track.clips.forEach(c => {
            if (c === keep) { out.push(c); return; }
            const cs = c.start, ce = c.start + c.length;
            if (ce <= ks || cs >= ke) { out.push(c); return; }
            if (cs >= ks && ce <= ke) return; // fully covered
            if (cs < ks && ce > ke) { // keep sits inside c: split c in two
                const right = DAW.splitClip(c, ke);
                const left = c; left.length = ks - cs;
                out.push(left); if (right) out.push(right);
                return;
            }
            if (cs < ks) { c.length = ks - cs; out.push(c); return; }
            // c starts inside keep: trim its head
            const r = DAW.splitClip(c, ke);
            if (r) out.push(r);
        });
        track.clips = out;
    };
    // Splits a clip at song beat b; mutates `clip` to be the left part and returns the right part.
    DAW.splitClip = function (clip, b) {
        if (b <= clip.start || b >= clip.start + clip.length) return null;
        const cut = b - clip.start;
        const right = U.deepClone(clip);
        right.id = U.uid('clp');
        right.start = b; right.length = clip.length - cut;
        if (clip.kind === 'midi') {
            right.notes = clip.notes.filter(n => n.s >= cut).map(n => Object.assign({}, n, { id: U.uid('n'), s: n.s - cut }));
            clip.notes = clip.notes.filter(n => n.s < cut).map(n => Object.assign(n, { l: Math.min(n.l, cut - n.s) }));
        } else {
            right.offset = clip.offset + cut * (60 / (DAW.engine.project ? DAW.engine.project.bpm : 120));
            right.fadeIn = 0; clip.fadeOut = 0;
        }
        clip.length = cut;
        return right;
    };

    // ---------------------------------------------------------- undo / redo
    DAW.history = {
        undoStack: [], redoStack: [], max: 120,
        snapshot() { return JSON.stringify(E.project); },
        push(label) {
            this.undoStack.push({ label, state: this.snapshot() });
            if (this.undoStack.length > this.max) this.undoStack.shift();
            this.redoStack.length = 0;
        },
        undo() {
            const s = this.undoStack.pop();
            if (!s) return null;
            this.redoStack.push({ label: s.label, state: this.snapshot() });
            DAW.loadState(JSON.parse(s.state), true);
            return s.label;
        },
        redo() {
            const s = this.redoStack.pop();
            if (!s) return null;
            this.undoStack.push({ label: s.label, state: this.snapshot() });
            DAW.loadState(JSON.parse(s.state), true);
            return s.label;
        },
        clear() { this.undoStack.length = 0; this.redoStack.length = 0; },
    };
    // Replace project contents while keeping the same object identity where possible (keeps graph in sync).
    DAW.loadState = function (state, keepTransport) {
        const wasPlaying = E.playing, pos = E.currentBeat();
        if (!keepTransport) E.stop(true);
        const p = E.project;
        Object.keys(p).forEach(k => delete p[k]);
        Object.assign(p, state);
        E.sync();
        if (!DAW.findTrack(p, E.selectedTrackId)) E.selectedTrackId = p.tracks[0] ? p.tracks[0].id : null;
        if (!keepTransport && wasPlaying) E.play(pos);
        E.emit('project');
    };

    // ------------------------------------------------------ offline bounce
    DAW.renderOffline = async function (project, fromBeat, toBeat, sampleRate = 44100, tail = 2) {
        const spb = 60 / project.bpm;
        const dur = (toBeat - fromBeat) * spb + tail;
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const ctx = new OAC(2, Math.ceil(dur * sampleRate), sampleRate);
        const graph = new Graph(ctx, ctx.destination, project);
        // Snap smoothed params to their targets before rendering.
        scheduleRange(null, project, graph, fromBeat, toBeat, 0.0, { loopEnd: null, segmentStart: true, metronome: false });
        return ctx.startRendering();
    };

    // ---------------------------------------------------------- WAV encode
    DAW.encodeWav = function (buffer, bits = 16) {
        const ch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
        const bytes = bits / 8, dataLen = len * ch * bytes;
        const ab = new ArrayBuffer(44 + dataLen), v = new DataView(ab);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); w(8, 'WAVE'); w(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, ch, true);
        v.setUint32(24, sr, true); v.setUint32(28, sr * ch * bytes, true); v.setUint16(32, ch * bytes, true); v.setUint16(34, bits, true);
        w(36, 'data'); v.setUint32(40, dataLen, true);
        const chans = []; for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
        let o = 44;
        for (let i = 0; i < len; i++) {
            for (let c = 0; c < ch; c++) {
                const s = Math.max(-1, Math.min(1, chans[c][i]));
                if (bits === 32) { v.setFloat32(o, s, true); o += 4; } else if (bits === 24) { const x = Math.round(s * 8388607); v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); o += 3; } else { v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
            }
        }
        return new Blob([ab], { type: 'audio/wav' });
    };

    // ------------------------------------------------------- MIDI files
    const PPQ = 480;
    function vlq(n) { const out = [n & 0x7f]; n >>= 7; while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; } return out; }
    function str(s) { return Array.from(s).map(c => c.charCodeAt(0) & 0xff); }
    function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
    function chunk(type, data) { return str(type).concat(u32(data.length), data); }
    DAW.exportMidi = function (project, trackIds) {
        const tracks = project.tracks.filter(t => t.type === 'instrument' && (!trackIds || trackIds.includes(t.id)));
        const mpqn = Math.round(60000000 / project.bpm);
        const tempo = [0, 0xff, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255,
            0, 0xff, 0x58, 0x04, project.timeSig[0], Math.log2(project.timeSig[1]), 24, 8,
            0, 0xff, 0x2f, 0x00];
        const chunks = [chunk('MThd', [0, 1, 0, tracks.length + 1, (PPQ >> 8) & 255, PPQ & 255]), chunk('MTrk', tempo)];
        const MELODIC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
        let melodicCh = 0;
        tracks.forEach(t => {
            const isDrum = t.instrument.type === 'drums';
            const ch = isDrum ? 9 : MELODIC[melodicCh++ % MELODIC.length];
            const evs = [];
            t.clips.forEach(c => c.kind === 'midi' && !c.muted && c.notes.forEach(n => {
                if (n.s >= c.length) return;
                const s = Math.round((c.start + n.s) * PPQ), e = Math.round((c.start + Math.min(n.s + n.l, c.length)) * PPQ);
                const pitch = isDrum ? DAW.drumToGM(n.p) : n.p;
                evs.push({ t: s, d: [0x90 | ch, pitch & 127, Math.max(1, Math.round(n.v * 127))] });
                evs.push({ t: Math.max(e, s + 1), d: [0x80 | ch, pitch & 127, 0] });
            }));
            evs.sort((a, b) => a.t - b.t || (a.d[0] & 0xf0) - (b.d[0] & 0xf0));
            let data = [0].concat([0xff, 0x03], vlq(t.name.length), str(t.name));
            let last = 0;
            evs.forEach(e => { data = data.concat(vlq(e.t - last), e.d); last = e.t; });
            data = data.concat([0, 0xff, 0x2f, 0]);
            chunks.push(chunk('MTrk', data));
        });
        return new Blob([new Uint8Array([].concat(...chunks))], { type: 'audio/midi' });
    };
    // Our drum kit uses pitch classes; GM uses fixed note numbers.
    const DRUM_GM = [36, 37, 38, 39, 41, 45, 42, 48, 56, 70, 46, 49];
    DAW.drumToGM = p => DRUM_GM[((p % 12) + 12) % 12];
    DAW.gmToDrum = gm => {
        const map = { 35: 0, 36: 0, 37: 1, 38: 2, 40: 2, 39: 3, 41: 4, 43: 4, 45: 5, 47: 5, 42: 6, 44: 6, 48: 7, 50: 7, 56: 8, 69: 9, 70: 9, 82: 9, 46: 10, 49: 11, 51: 11, 52: 11, 55: 11, 57: 11, 59: 11 };
        const pc = map[gm] != null ? map[gm] : 6;
        return 36 + pc;
    };
    DAW.importMidi = function (arrayBuffer) {
        const d = new Uint8Array(arrayBuffer);
        let p = 0;
        const rd32 = () => (d[p++] << 24) | (d[p++] << 16) | (d[p++] << 8) | d[p++];
        const rd16 = () => (d[p++] << 8) | d[p++];
        const rdStr = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d[p++]); return s; };
        const rdVlq = () => { let v = 0, b; do { b = d[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
        if (rdStr(4) !== 'MThd') throw new Error('Not a MIDI file');
        const hl = rd32(); rd16(); const ntrk = rd16(); const div = rd16(); p += hl - 6;
        if (div & 0x8000) throw new Error('SMPTE time division is not supported');
        const result = { bpm: null, timeSig: null, tracks: [] };
        for (let ti = 0; ti < ntrk && p < d.length; ti++) {
            if (rdStr(4) !== 'MTrk') break;
            const len = rd32(), end = p + len;
            let tick = 0, status = 0, name = 'MIDI ' + (ti + 1);
            const open = new Map();
            const chNotes = new Map();
            while (p < end) {
                tick += rdVlq();
                let b = d[p];
                if (b & 0x80) { status = b; p++; }
                const hi = status & 0xf0, ch = status & 0x0f;
                if (status === 0xff) {
                    const type = d[p++]; const l = rdVlq();
                    if (type === 0x03) name = rdStr(l) || name;
                    else if (type === 0x51 && result.bpm == null) { const mp = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2]; result.bpm = Math.round(60000000 / mp * 100) / 100; p += l; }
                    else if (type === 0x58 && !result.timeSig) { result.timeSig = [d[p], Math.pow(2, d[p + 1])]; p += l; }
                    else p += l;
                } else if (status === 0xf0 || status === 0xf7) { p += rdVlq(); }
                else if (hi === 0x90 || hi === 0x80) {
                    const note = d[p++], vel = d[p++];
                    const key = ch * 128 + note;
                    if (hi === 0x90 && vel > 0) { open.set(key, { tick, vel }); }
                    else if (open.has(key)) {
                        const o = open.get(key); open.delete(key);
                        if (!chNotes.has(ch)) chNotes.set(ch, []);
                        chNotes.get(ch).push({ p: note, s: o.tick / div, l: Math.max(1 / 64, (tick - o.tick) / div), v: o.vel / 127 });
                    }
                } else if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) p += 2;
                else if (hi === 0xc0 || hi === 0xd0) p += 1;
                else p++;
            }
            p = end;
            chNotes.forEach((notes, ch) => result.tracks.push({ name: chNotes.size > 1 ? `${name} Ch${ch + 1}` : name, drums: ch === 9, notes }));
        }
        return result;
    };

    // ------------------------------------------------- project (de)serialise
    function bufferToBase64Wav(buffer) {
        return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(DAW.encodeWav(buffer, 16)); });
    }
    DAW.serializeProject = async function (project, includeAudio = true) {
        const out = { app: 'Ultimate Synthesia Online DAW', project: U.deepClone(project), audio: {} };
        if (includeAudio) {
            const used = new Set();
            project.tracks.forEach(t => { t.clips.forEach(c => c.bufferId && used.add(c.bufferId)); if (t.instrument && t.instrument.params.sampleId) used.add(t.instrument.params.sampleId); });
            for (const id of used) { const e = pool.get(id); if (e) out.audio[id] = { name: e.name, wav: await bufferToBase64Wav(e.buffer) }; }
        }
        return out;
    };
    DAW.deserializeProject = async function (obj, ctx) {
        if (!obj || !obj.project || !Array.isArray(obj.project.tracks)) throw new Error('Not a DAW project file');
        const audio = obj.audio || {};
        for (const id of Object.keys(audio)) {
            const bin = atob(audio[id].wav), bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const buf = await ctx.decodeAudioData(bytes.buffer);
            DAW.addToPool(buf, audio[id].name, id);
        }
        return obj.project;
    };
})();
