/* Ultimate Synthesia Online - Advanced Mode DAW
 * DSP layer: shared helpers, instruments (sound generators) and plugins (audio effects).
 * Everything here is written against a generic BaseAudioContext so the exact same code
 * runs in real time and inside an OfflineAudioContext when bouncing to WAV.
 */
(function () {
    'use strict';
    const DAW = window.DAW = window.DAW || {};

    // ------------------------------------------------------------------ utils
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const U = DAW.util = {
        NOTE_NAMES,
        clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
        uid: (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10),
        dbToGain: db => Math.pow(10, db / 20),
        gainToDb: g => (g <= 0.00001 ? -Infinity : 20 * Math.log10(g)),
        midiToFreq: m => 440 * Math.pow(2, (m - 69) / 12),
        noteName: m => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1),
        isBlack: m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12),
        // The synth panel names notes "C4" as MIDI 48 (octave * 12 + index); keep that mapping for live input.
        noteStringToMidi: s => {
            const m = /^([A-G]#?)(-?\d+)$/.exec(s);
            if (!m) return 60;
            return parseInt(m[2], 10) * 12 + NOTE_NAMES.indexOf(m[1]);
        },
        deepClone: o => JSON.parse(JSON.stringify(o)),
        fmt: (v, digits = 2) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(digits)),
    };

    // Per-context caches (PeriodicWaves and noise buffers belong to a context).
    const ctxCache = new WeakMap();
    function cacheFor(ctx) {
        let c = ctxCache.get(ctx);
        if (!c) { c = { waves: new Map(), noise: null }; ctxCache.set(ctx, c); }
        return c;
    }
    function noiseBuffer(ctx) {
        const c = cacheFor(ctx);
        if (!c.noise) {
            const len = ctx.sampleRate * 2;
            c.noise = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = c.noise.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        return c.noise;
    }
    function pulseWave(ctx, width) {
        const w = Math.round(U.clamp(width, 0.01, 0.99) * 100) / 100;
        const c = cacheFor(ctx), key = 'pulse' + w;
        if (!c.waves.has(key)) {
            const n = 64, re = new Float32Array(n), im = new Float32Array(n);
            for (let k = 1; k < n; k++) {
                // Fourier series of a pulse train with duty cycle w (cosine terms).
                re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * w);
            }
            c.waves.set(key, ctx.createPeriodicWave(re, im));
        }
        return c.waves.get(key);
    }
    function harmonicWave(ctx, key, amps) {
        const c = cacheFor(ctx);
        if (!c.waves.has(key)) {
            const n = amps.length + 1, re = new Float32Array(n), im = new Float32Array(n);
            for (let k = 1; k < n; k++) im[k] = amps[k - 1];
            c.waves.set(key, ctx.createPeriodicWave(re, im));
        }
        return c.waves.get(key);
    }
    function setOscType(ctx, osc, type, pw) {
        if (type === 'pulse') osc.setPeriodicWave(pulseWave(ctx, pw));
        else osc.type = type;
    }
    DAW.dsp = { noiseBuffer, pulseWave, harmonicWave, setOscType };

    // Analytic value of a linear ADSR at time dt after note on (used for clean releases).
    function adsrValueAt(dt, a, d, s, peak) {
        if (dt <= 0) return 0;
        if (dt < a) return peak * (dt / a);
        if (dt < a + d) return peak + (s * peak - peak) * ((dt - a) / d);
        return s * peak;
    }

    // Generic helper that turns a gain param into an ADSR amplitude envelope.
    function ampEnvelope(param, t, peak, a, d, s) {
        param.cancelScheduledValues(t);
        param.setValueAtTime(0, t);
        param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
        param.linearRampToValueAtTime(Math.max(0.00001, peak * s), t + Math.max(0.001, a) + Math.max(0.001, d));
    }
    function ampRelease(param, t0, rt, peak, a, d, s, rel) {
        const v = Math.max(0.00001, adsrValueAt(rt - t0, Math.max(0.001, a), Math.max(0.001, d), s, peak));
        param.cancelScheduledValues(rt);
        param.setValueAtTime(v, rt);
        param.exponentialRampToValueAtTime(0.00001, rt + Math.max(0.005, rel));
        return rt + Math.max(0.005, rel);
    }

    // Builds the common voice wrapper (tracking of sources, kill + cleanup).
    function makeVoice(ctx, out, sources, releaseFn) {
        let ended = false, endTime = Infinity;
        const voice = {
            output: out,
            endTime: () => endTime,
            release(rt) {
                if (ended) return endTime;
                endTime = releaseFn(Math.max(rt, ctx.currentTime));
                sources.forEach(s => { try { s.stop(endTime + 0.05); } catch (e) { /* already stopped */ } });
                return endTime;
            },
            kill(at) {
                const t = Math.max(at || ctx.currentTime, ctx.currentTime);
                try {
                    out.gain.cancelScheduledValues(t);
                    out.gain.setValueAtTime(out.gain.value, t);
                    out.gain.linearRampToValueAtTime(0, t + 0.02);
                } catch (e) { /* noop */ }
                sources.forEach(s => { try { s.stop(t + 0.03); } catch (e) { /* noop */ } });
                endTime = t + 0.03;
                ended = true;
            },
        };
        if (sources[0]) {
            sources[0].onended = () => {
                ended = true;
                setTimeout(() => { try { out.disconnect(); } catch (e) { /* noop */ } }, 50);
                if (voice.onended) voice.onended();
            };
        }
        return voice;
    }

    // ------------------------------------------------------------ instruments
    const WAVES = ['sine', 'square', 'sawtooth', 'triangle', 'pulse'];
    const P = (id, name, min, max, def, extra = {}) => Object.assign({ id, name, min, max, def, step: extra.step || (max - min) / 200 }, extra);
    const S = (id, name, options, def) => ({ id, name, type: 'select', options, def });
    const T = (id, name, def) => ({ id, name, type: 'toggle', def });

    const INSTRUMENTS = {};
    DAW.INSTRUMENTS = INSTRUMENTS;

    // --- Ultimate Synth: mirrors the main synth panel (2 osc + sub + noise + filter + ADSR) with polyphonic filters.
    INSTRUMENTS.synth = {
        name: 'Ultimate Synth',
        description: 'Subtractive synth with the same engine as the main panel. Can be linked live to the panel.',
        params: [
            T('linkMain', 'Link to Main Panel', 0),
            S('wave1', 'Osc 1 Wave', WAVES, 'sawtooth'),
            P('oct1', 'Osc 1 Octave', -2, 2, 0, { step: 1 }),
            P('detune1', 'Osc 1 Detune', -100, 100, 0, { step: 1, unit: 'ct' }),
            P('level1', 'Osc 1 Level', 0, 1, 0.7),
            T('osc2On', 'Osc 2 On', 1),
            S('wave2', 'Osc 2 Wave', WAVES, 'sawtooth'),
            P('oct2', 'Osc 2 Octave', -2, 2, 0, { step: 1 }),
            P('fine2', 'Osc 2 Fine', -100, 100, 7, { step: 1, unit: 'ct' }),
            P('level2', 'Osc 2 Level', 0, 1, 0.5),
            P('pw', 'Pulse Width', 0.05, 0.95, 0.5),
            P('unison', 'Unison Voices', 1, 7, 1, { step: 1 }),
            P('spread', 'Unison Spread', 0, 50, 15, { step: 1, unit: 'ct' }),
            T('subOn', 'Sub On', 0),
            S('subWave', 'Sub Wave', ['sine', 'square', 'triangle'], 'square'),
            P('subOct', 'Sub Octave', -2, -1, -1, { step: 1 }),
            P('subLevel', 'Sub Level', 0, 1, 0.4),
            T('noiseOn', 'Noise On', 0),
            S('noiseType', 'Noise Type', ['white', 'pink'], 'white'),
            P('noiseLevel', 'Noise Level', 0, 1, 0.1),
            P('slop', 'Analog Slop', 0, 0.1, 0.005, { step: 0.001 }),
            T('filterOn', 'Filter On', 1),
            S('filterType', 'Filter Type', ['lowpass', 'highpass', 'bandpass', 'notch'], 'lowpass'),
            P('cutoff', 'Cutoff', 20, 20000, 3000, { log: true, unit: 'Hz' }),
            P('res', 'Resonance', 0.1, 20, 1.5),
            P('fenv', 'Filter Env Amt', -4, 6, 2, { step: 0.1, unit: 'oct' }),
            P('keytrack', 'Key Tracking', 0, 1, 0.3),
            P('attack', 'Attack', 0.001, 4, 0.01, { log: true, unit: 's' }),
            P('decay', 'Decay', 0.001, 4, 0.3, { log: true, unit: 's' }),
            P('sustain', 'Sustain', 0, 1, 0.6),
            P('release', 'Release', 0.005, 8, 0.4, { log: true, unit: 's' }),
            P('velSens', 'Velocity Sens.', 0, 1, 0.7),
            P('gain', 'Output', 0, 1.5, 0.8),
        ],
        presets: {
            'Init Saw': {},
            'Super Saw Lead': { unison: 5, spread: 22, level2: 0.6, fine2: 12, cutoff: 6000, fenv: 1, release: 0.3 },
            'Fat Bass': { wave1: 'sawtooth', wave2: 'square', oct2: -1, subOn: 1, subLevel: 0.6, cutoff: 600, res: 4, fenv: 2.5, decay: 0.25, sustain: 0.3, release: 0.15 },
            'Warm Pad': { wave1: 'sawtooth', wave2: 'triangle', unison: 3, spread: 18, cutoff: 1500, res: 0.8, fenv: 1, attack: 0.8, decay: 1.2, sustain: 0.8, release: 2.5 },
            'Square Pluck': { wave1: 'square', osc2On: 0, cutoff: 500, res: 6, fenv: 4, attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
            'Hollow Pulse': { wave1: 'pulse', wave2: 'pulse', pw: 0.2, fine2: 5, cutoff: 4000, fenv: 0.5 },
            'Brass Stab': { wave1: 'sawtooth', wave2: 'sawtooth', fine2: 9, cutoff: 900, res: 1.2, fenv: 3, attack: 0.04, decay: 0.3, sustain: 0.5, release: 0.25 },
            'Noise Sweep FX': { osc2On: 0, level1: 0, noiseOn: 1, noiseLevel: 0.8, filterType: 'bandpass', cutoff: 300, res: 8, fenv: 5, attack: 1.5, decay: 1.5, sustain: 0.2, release: 1.5 },
        },
        // Maps the main panel's getCurrentSynthParams() output onto this instrument's params.
        fromMain(mp) {
            if (!mp) return {};
            return {
                wave1: mp.osc1.waveform, detune1: mp.osc1.detune, level1: mp.osc1.level,
                osc2On: mp.osc2.enabled ? 1 : 0, wave2: mp.osc2.waveform, oct2: mp.osc2.octaveOffset,
                fine2: mp.osc2.fineTune, level2: mp.osc2.level, pw: mp.osc1.pulseWidth || mp.osc2.pulseWidth || 0.5,
                subOn: mp.sub.enabled ? 1 : 0, subWave: mp.sub.waveform, subOct: mp.sub.octave, subLevel: mp.sub.level,
                noiseOn: mp.noise.enabled ? 1 : 0, noiseType: mp.noise.type, noiseLevel: mp.noise.level,
                slop: mp.common.oscSlop, unison: 1, fenv: 0, keytrack: 0,
                filterOn: mp.filter.enabled ? 1 : 0, filterType: mp.filter.type === 'allpass' ? 'lowpass' : mp.filter.type,
                cutoff: mp.filter.type === 'allpass' ? 20000 : mp.filter.cutoff, res: mp.filter.resonance,
                attack: mp.adsr.enabled ? mp.adsr.attack : 0.002, decay: mp.adsr.enabled ? mp.adsr.decay : 0.01,
                sustain: mp.adsr.enabled ? mp.adsr.sustain : 1, release: mp.adsr.enabled ? mp.adsr.release : 0.01,
            };
        },
        voice(ctx, dest, p, midi, vel, t) {
            if (p.linkMain && typeof window.getCurrentSynthParams === 'function') {
                try { p = Object.assign({}, p, this.fromMain(window.getCurrentSynthParams())); } catch (e) { /* panel not ready */ }
            }
            const f = U.midiToFreq(midi);
            const velAmp = 1 - p.velSens + p.velSens * vel;
            const peak = 0.32 * velAmp * p.gain;
            const out = ctx.createGain();
            out.connect(dest);
            const mix = ctx.createGain();
            let filt = null;
            if (p.filterOn) {
                filt = ctx.createBiquadFilter();
                filt.type = p.filterType;
                filt.Q.value = p.res;
                const keyMul = Math.pow(f / 261.63, p.keytrack);
                const base = U.clamp(p.cutoff * keyMul, 20, 20000);
                filt.frequency.setValueAtTime(base, t);
                if (p.fenv) {
                    const peakF = U.clamp(base * Math.pow(2, p.fenv), 20, 20000);
                    const susF = U.clamp(base * Math.pow(2, p.fenv * p.sustain), 20, 20000);
                    filt.frequency.exponentialRampToValueAtTime(peakF, t + Math.max(0.002, p.attack));
                    filt.frequency.exponentialRampToValueAtTime(susF, t + Math.max(0.002, p.attack) + Math.max(0.002, p.decay));
                }
                mix.connect(filt).connect(out);
            } else {
                mix.connect(out);
            }
            const sources = [];
            const slop = () => (Math.random() * 2 - 1) * p.slop * 100;
            const uni = Math.max(1, Math.round(p.unison));
            const uniGain = 1 / Math.sqrt(uni);
            const addOsc = (type, freq, cents, level, startAt) => {
                if (level <= 0) return;
                for (let u = 0; u < uni; u++) {
                    const spreadCents = uni > 1 ? (u / (uni - 1) - 0.5) * 2 * p.spread : 0;
                    const o = ctx.createOscillator();
                    setOscType(ctx, o, type, p.pw);
                    o.frequency.setValueAtTime(freq, t);
                    o.detune.setValueAtTime(cents + spreadCents + slop(), t);
                    const g = ctx.createGain();
                    g.gain.value = level * uniGain;
                    o.connect(g).connect(mix);
                    o.start(startAt);
                    sources.push(o);
                }
            };
            addOsc(p.wave1, f * Math.pow(2, p.oct1), p.detune1, p.level1, t);
            if (p.osc2On) addOsc(p.wave2, f * Math.pow(2, p.oct2), p.fine2, p.level2, t);
            if (p.subOn && p.subLevel > 0) {
                const o = ctx.createOscillator();
                o.type = p.subWave;
                o.frequency.setValueAtTime(f * Math.pow(2, p.subOct), t);
                const g = ctx.createGain(); g.gain.value = p.subLevel;
                o.connect(g).connect(mix); o.start(t); sources.push(o);
            }
            if (p.noiseOn && p.noiseLevel > 0) {
                const n = ctx.createBufferSource();
                n.buffer = noiseBuffer(ctx); n.loop = true;
                n.loopStart = Math.random();
                const g = ctx.createGain(); g.gain.value = p.noiseLevel;
                if (p.noiseType === 'pink') {
                    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.707;
                    n.connect(lp).connect(g);
                } else n.connect(g);
                g.connect(mix); n.start(t, Math.random()); sources.push(n);
            }
            ampEnvelope(out.gain, t, peak, p.attack, p.decay, p.sustain);
            return makeVoice(ctx, out, sources, rt => {
                if (filt && p.fenv) {
                    filt.frequency.cancelScheduledValues(rt);
                    const keyMul = Math.pow(f / 261.63, p.keytrack);
                    filt.frequency.setTargetAtTime(U.clamp(p.cutoff * keyMul, 20, 20000), rt, Math.max(0.005, p.release) / 3);
                }
                return ampRelease(out.gain, t, rt, peak, p.attack, p.decay, p.sustain, p.release);
            });
        },
    };

    // --- FM Synth: 2-operator FM with decaying modulation index (e-pianos, bells, basses).
    INSTRUMENTS.fm = {
        name: 'FM Synth',
        description: 'Two-operator FM synth. Great for electric pianos, bells and plucky basses.',
        params: [
            S('carWave', 'Carrier Wave', ['sine', 'triangle', 'square', 'sawtooth'], 'sine'),
            P('ratio', 'Mod Ratio', 0.5, 16, 1, { step: 0.5 }),
            P('index', 'Mod Index', 0, 20, 3, { step: 0.1 }),
            P('indexDecay', 'Index Decay', 0.01, 5, 0.6, { log: true, unit: 's' }),
            P('indexSus', 'Index Sustain', 0, 1, 0.15),
            P('detune', 'Mod Detune', -50, 50, 0, { step: 1, unit: 'ct' }),
            P('attack', 'Attack', 0.001, 4, 0.003, { log: true, unit: 's' }),
            P('decay', 'Decay', 0.01, 8, 1.5, { log: true, unit: 's' }),
            P('sustain', 'Sustain', 0, 1, 0.3),
            P('release', 'Release', 0.005, 8, 0.5, { log: true, unit: 's' }),
            P('velSens', 'Velocity Sens.', 0, 1, 0.8),
            P('gain', 'Output', 0, 1.5, 0.9),
        ],
        presets: {
            'E-Piano': {},
            'Bell': { ratio: 3.5, index: 6, indexDecay: 2, indexSus: 0.1, decay: 4, sustain: 0, release: 3 },
            'FM Bass': { ratio: 1, index: 5, indexDecay: 0.15, indexSus: 0.2, attack: 0.002, decay: 0.4, sustain: 0.5, release: 0.1 },
            'Marimba': { ratio: 4, index: 2.5, indexDecay: 0.05, indexSus: 0, decay: 0.5, sustain: 0, release: 0.3 },
            'Glass Pad': { ratio: 2, index: 1.5, indexDecay: 3, indexSus: 0.6, attack: 0.6, decay: 2, sustain: 0.7, release: 2.5 },
            'Metallic Lead': { carWave: 'sawtooth', ratio: 1.5, index: 2, indexDecay: 1, indexSus: 0.5, attack: 0.01, decay: 0.5, sustain: 0.7, release: 0.3 },
        },
        voice(ctx, dest, p, midi, vel, t) {
            const f = U.midiToFreq(midi);
            const velAmp = 1 - p.velSens + p.velSens * vel;
            const peak = 0.35 * velAmp * p.gain;
            const out = ctx.createGain(); out.connect(dest);
            const car = ctx.createOscillator(); car.type = p.carWave; car.frequency.setValueAtTime(f, t);
            const mod = ctx.createOscillator(); mod.type = 'sine';
            mod.frequency.setValueAtTime(f * p.ratio, t); mod.detune.setValueAtTime(p.detune, t);
            const modGain = ctx.createGain();
            const idxPeak = p.index * f * p.ratio * (0.4 + 0.6 * vel);
            modGain.gain.setValueAtTime(idxPeak, t);
            modGain.gain.setTargetAtTime(idxPeak * p.indexSus, t + 0.001, Math.max(0.005, p.indexDecay) / 3);
            mod.connect(modGain).connect(car.frequency);
            car.connect(out);
            car.start(t); mod.start(t);
            ampEnvelope(out.gain, t, peak, p.attack, p.decay, p.sustain);
            return makeVoice(ctx, out, [car, mod], rt => ampRelease(out.gain, t, rt, peak, p.attack, p.decay, p.sustain, p.release));
        },
    };

    // --- Pluck: Karplus-Strong string, rendered to a buffer per pitch and cached.
    const pluckCache = new Map();
    function pluckBuffer(ctx, midi, p) {
        const sr = ctx.sampleRate;
        const key = [sr, midi, p.decayTime, p.brightness, p.pick].join('|');
        if (pluckCache.has(key)) return pluckCache.get(key);
        if (pluckCache.size > 96) pluckCache.delete(pluckCache.keys().next().value);
        const f = U.midiToFreq(midi);
        const period = sr / f;
        const L = Math.max(2, Math.round(period));
        const dur = Math.min(8, p.decayTime + 0.3);
        const N = Math.floor(sr * dur);
        const buf = ctx.createBuffer(1, N, sr);
        const y = buf.getChannelData(0);
        const loopGain = Math.pow(10, (-3 * L) / (sr * Math.max(0.05, p.decayTime)));
        const b = p.brightness;
        let prev = 0;
        for (let i = 0; i < L && i < N; i++) {
            const n = Math.random() * 2 - 1;
            prev = prev + (n - prev) * (0.15 + 0.85 * p.pick); // one-pole lowpass on the excitation
            y[i] = prev;
        }
        for (let i = L; i < N; i++) {
            const a = y[i - L], c = y[i - L - 1] || 0;
            y[i] = loopGain * (b * a + (1 - b) * 0.5 * (a + c));
        }
        // Remove DC and normalise.
        let mean = 0; for (let i = 0; i < Math.min(N, sr); i++) mean += y[i]; mean /= Math.min(N, sr);
        let mx = 0; for (let i = 0; i < N; i++) { y[i] -= mean; mx = Math.max(mx, Math.abs(y[i])); }
        if (mx > 0) for (let i = 0; i < N; i++) y[i] /= mx;
        const res = { buffer: buf, rate: L / period };
        pluckCache.set(key, res);
        return res;
    }
    INSTRUMENTS.pluck = {
        name: 'Pluck String',
        description: 'Physically-modelled plucked string (Karplus-Strong). Guitars, harps, koto.',
        params: [
            P('decayTime', 'Decay Time', 0.1, 8, 2.5, { unit: 's' }),
            P('brightness', 'Brightness', 0, 1, 0.5),
            P('pick', 'Pick Hardness', 0, 1, 0.7),
            P('body', 'Body Tone', 200, 8000, 3500, { log: true, unit: 'Hz' }),
            P('release', 'Release', 0.01, 3, 0.2, { log: true, unit: 's' }),
            P('velSens', 'Velocity Sens.', 0, 1, 0.7),
            P('gain', 'Output', 0, 1.5, 0.9),
        ],
        presets: {
            'Nylon Guitar': {},
            'Steel Guitar': { brightness: 0.85, pick: 0.95, body: 6000, decayTime: 4 },
            'Harp': { brightness: 0.4, pick: 0.4, decayTime: 5, body: 3000, release: 1 },
            'Muted Pluck': { decayTime: 0.4, brightness: 0.2, pick: 0.5, body: 1500 },
            'Koto': { brightness: 0.95, pick: 1, decayTime: 3, body: 5000 },
        },
        voice(ctx, dest, p, midi, vel, t) {
            const { buffer, rate } = pluckBuffer(ctx, midi, p);
            const velAmp = 1 - p.velSens + p.velSens * vel;
            const peak = 0.45 * velAmp * p.gain;
            const out = ctx.createGain(); out.connect(dest);
            const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
            const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = p.body; tone.Q.value = 0.6;
            src.connect(tone).connect(out);
            out.gain.setValueAtTime(peak, t);
            src.start(t);
            return makeVoice(ctx, out, [src], rt => {
                out.gain.cancelScheduledValues(rt);
                out.gain.setValueAtTime(peak, rt);
                out.gain.exponentialRampToValueAtTime(0.00001, rt + p.release);
                return rt + p.release;
            });
        },
    };

    // --- Tonewheel organ with drawbars, percussion and vibrato.
    const DRAWBAR_HARMONICS = [1, 2, 3, 4, 6, 8, 16]; // relative to the 16' sub-fundamental
    INSTRUMENTS.organ = {
        name: 'Drawbar Organ',
        description: 'Tonewheel organ with 7 drawbars, percussion and vibrato.',
        params: [
            P('db16', "16' Drawbar", 0, 8, 8, { step: 1 }),
            P('db8', "8' Drawbar", 0, 8, 8, { step: 1 }),
            P('db513', "5 1/3' Drawbar", 0, 8, 8, { step: 1 }),
            P('db4', "4' Drawbar", 0, 8, 0, { step: 1 }),
            P('db223', "2 2/3' Drawbar", 0, 8, 0, { step: 1 }),
            P('db2', "2' Drawbar", 0, 8, 0, { step: 1 }),
            P('db1', "1' Drawbar", 0, 8, 0, { step: 1 }),
            T('perc', 'Percussion', 1),
            S('percHarm', 'Perc. Harmonic', ['2nd', '3rd'], '3rd'),
            P('percDecay', 'Perc. Decay', 0.05, 1.5, 0.3, { unit: 's' }),
            P('vibDepth', 'Vibrato Depth', 0, 40, 8, { step: 1, unit: 'ct' }),
            P('vibRate', 'Vibrato Rate', 0.5, 9, 6.5, { unit: 'Hz' }),
            P('click', 'Key Click', 0, 1, 0.3),
            P('release', 'Release', 0.005, 2, 0.05, { log: true, unit: 's' }),
            P('gain', 'Output', 0, 1.5, 0.7),
        ],
        presets: {
            'Gospel 888': {},
            'Full Organ': { db4: 8, db223: 8, db2: 8, db1: 8, perc: 0 },
            'Jazz 8800': { db513: 0, perc: 1, percHarm: '3rd', vibDepth: 12 },
            'Flute': { db16: 0, db8: 8, db513: 0, db4: 4, perc: 0, vibDepth: 15 },
            'Church': { db16: 8, db8: 6, db513: 4, db4: 8, db223: 4, db2: 6, db1: 2, perc: 0, release: 0.8 },
        },
        voice(ctx, dest, p, midi, vel, t) {
            const f = U.midiToFreq(midi);
            const amps = [p.db16, p.db8, p.db513, p.db4, p.db223, p.db2, p.db1];
            const harm = new Array(16).fill(0);
            amps.forEach((a, i) => { if (a > 0) harm[DRAWBAR_HARMONICS[i] - 1] += Math.pow(10, ((a - 8) * 3) / 20); });
            const total = harm.reduce((s, v) => s + v, 0) || 1;
            const key = 'organ' + harm.map(v => v.toFixed(3)).join(',');
            const peak = (0.5 * p.gain) / Math.sqrt(total);
            const out = ctx.createGain(); out.connect(dest);
            const o = ctx.createOscillator();
            o.setPeriodicWave(harmonicWave(ctx, key, harm));
            o.frequency.setValueAtTime(f / 2, t);
            const sources = [o];
            if (p.vibDepth > 0) {
                const lfo = ctx.createOscillator(); lfo.frequency.value = p.vibRate;
                const lg = ctx.createGain(); lg.gain.value = p.vibDepth;
                lfo.connect(lg).connect(o.detune); lfo.start(t); sources.push(lfo);
            }
            o.connect(out); o.start(t);
            if (p.perc) {
                const po = ctx.createOscillator(); po.type = 'sine';
                po.frequency.setValueAtTime(f * (p.percHarm === '2nd' ? 2 : 3), t);
                const pg = ctx.createGain();
                pg.gain.setValueAtTime(0.25 * p.gain, t);
                pg.gain.setTargetAtTime(0, t, p.percDecay / 3);
                po.connect(pg).connect(dest); po.start(t); sources.push(po);
                out.percGain = pg;
            }
            if (p.click > 0) {
                const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx);
                const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
                const cg = ctx.createGain();
                cg.gain.setValueAtTime(0.15 * p.click * p.gain, t);
                cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
                n.connect(hp).connect(cg).connect(dest); n.start(t, Math.random()); n.stop(t + 0.02);
            }
            out.gain.setValueAtTime(0, t);
            out.gain.linearRampToValueAtTime(peak, t + 0.004);
            return makeVoice(ctx, out, sources, rt => {
                out.gain.cancelScheduledValues(rt);
                out.gain.setValueAtTime(rt - t < 0.004 ? 0.0001 + peak * ((rt - t) / 0.004) : peak, rt);
                out.gain.exponentialRampToValueAtTime(0.00001, rt + p.release);
                if (out.percGain) { out.percGain.gain.cancelScheduledValues(rt); out.percGain.gain.setTargetAtTime(0, rt, 0.01); }
                return rt + p.release;
            });
        },
    };

    // --- Drum Machine: synthesised kit, mapped by pitch class so every octave plays the kit.
    const DRUM_NAMES = ['Kick', 'Rim', 'Snare', 'Clap', 'Low Tom', 'Mid Tom', 'Closed Hat', 'High Tom', 'Cowbell', 'Shaker', 'Open Hat', 'Crash'];
    INSTRUMENTS.drums = {
        name: 'Drum Machine',
        description: 'Synthesised 12-piece kit. C=Kick C#=Rim D=Snare D#=Clap E/F/G=Toms F#=Closed Hat G#=Cowbell A=Shaker A#=Open Hat B=Crash.',
        drumNames: DRUM_NAMES,
        drumName: m => DRUM_NAMES[((m % 12) + 12) % 12],
        params: [
            P('tune', 'Tune', -12, 12, 0, { step: 1, unit: 'st' }),
            P('kickDecay', 'Kick Decay', 0.1, 2, 0.45, { unit: 's' }),
            P('kickPitch', 'Kick Pitch', 30, 90, 48, { unit: 'Hz' }),
            P('kickPunch', 'Kick Punch', 0, 1, 0.6),
            P('snareTone', 'Snare Tone', 120, 400, 190, { unit: 'Hz' }),
            P('snappy', 'Snare Snappy', 0, 1, 0.7),
            P('snareDecay', 'Snare Decay', 0.05, 0.8, 0.2, { unit: 's' }),
            P('hatDecay', 'Hat Decay', 0.02, 0.4, 0.06, { unit: 's' }),
            P('openDecay', 'Open Hat Decay', 0.1, 1.5, 0.45, { unit: 's' }),
            P('tomDecay', 'Tom Decay', 0.1, 1.5, 0.45, { unit: 's' }),
            P('crashDecay', 'Crash Decay', 0.3, 4, 1.6, { unit: 's' }),
            P('velSens', 'Velocity Sens.', 0, 1, 0.8),
            P('gain', 'Output', 0, 1.5, 1),
        ],
        presets: {
            '808 Style': { kickDecay: 1.1, kickPitch: 42, kickPunch: 0.3, snareTone: 180, snappy: 0.8, hatDecay: 0.05 },
            'Acoustic-ish': { kickDecay: 0.35, kickPitch: 55, kickPunch: 0.8, snareTone: 220, snappy: 0.55, snareDecay: 0.25 },
            'Tight Techno': { kickDecay: 0.3, kickPitch: 50, kickPunch: 1, snareDecay: 0.12, hatDecay: 0.03, openDecay: 0.25 },
            'Lo-Fi': { tune: -3, kickDecay: 0.5, snareTone: 160, snappy: 0.4, hatDecay: 0.08 },
        },
        voice(ctx, dest, p, midi, vel, t) {
            const pc = ((midi % 12) + 12) % 12;
            const tm = Math.pow(2, p.tune / 12);
            const velAmp = (1 - p.velSens + p.velSens * vel) * p.gain;
            const out = ctx.createGain(); out.gain.value = velAmp; out.connect(dest);
            const sources = [];
            let end = t + 0.3;
            const noise = (startAt, stopAt) => { const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx); n.loop = true; n.start(startAt, Math.random() * 1.5); n.stop(stopAt); sources.push(n); return n; };
            const env = (g, peak, decay, at = t) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + decay); };
            const metal = (decay, hpFreq, peak) => {
                const g = ctx.createGain(); env(g, peak, decay);
                const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000 * tm; bp.Q.value = 0.8;
                const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hpFreq;
                [2, 3, 4.16, 5.43, 6.79, 8.21].forEach(r => {
                    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 40 * r * tm * 2.5;
                    o.connect(bp); o.start(t); o.stop(t + decay + 0.05); sources.push(o);
                });
                bp.connect(hp).connect(g).connect(out);
                end = t + decay;
            };
            const tom = freq => {
                const o = ctx.createOscillator(); o.type = 'sine';
                o.frequency.setValueAtTime(freq * 1.6 * tm, t);
                o.frequency.exponentialRampToValueAtTime(freq * tm, t + 0.08);
                const g = ctx.createGain(); env(g, 0.9, p.tomDecay);
                o.connect(g).connect(out); o.start(t); o.stop(t + p.tomDecay + 0.05); sources.push(o);
                end = t + p.tomDecay;
            };
            switch (pc) {
                case 0: { // Kick
                    const o = ctx.createOscillator(); o.type = 'sine';
                    o.frequency.setValueAtTime(p.kickPitch * 3.5 * tm, t);
                    o.frequency.exponentialRampToValueAtTime(p.kickPitch * tm, t + 0.06);
                    const g = ctx.createGain(); env(g, 1, p.kickDecay);
                    o.connect(g).connect(out); o.start(t); o.stop(t + p.kickDecay + 0.05); sources.push(o);
                    if (p.kickPunch > 0) {
                        const c = ctx.createOscillator(); c.type = 'triangle'; c.frequency.setValueAtTime(1200 * tm, t);
                        c.frequency.exponentialRampToValueAtTime(200, t + 0.01);
                        const cg = ctx.createGain(); env(cg, 0.5 * p.kickPunch, 0.015);
                        c.connect(cg).connect(out); c.start(t); c.stop(t + 0.03); sources.push(c);
                    }
                    end = t + p.kickDecay; break;
                }
                case 1: { // Rim
                    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1700 * tm;
                    const g = ctx.createGain(); env(g, 0.6, 0.03);
                    const n = noise(t, t + 0.05); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
                    const ng = ctx.createGain(); env(ng, 0.3, 0.02);
                    o.connect(g).connect(out); n.connect(hp).connect(ng).connect(out);
                    o.start(t); o.stop(t + 0.06); sources.push(o); end = t + 0.06; break;
                }
                case 2: { // Snare
                    const o = ctx.createOscillator(); o.type = 'triangle';
                    o.frequency.setValueAtTime(p.snareTone * 1.5 * tm, t);
                    o.frequency.exponentialRampToValueAtTime(p.snareTone * tm, t + 0.03);
                    const g = ctx.createGain(); env(g, 0.7 * (1.2 - p.snappy), p.snareDecay * 0.6);
                    o.connect(g).connect(out); o.start(t); o.stop(t + p.snareDecay + 0.05); sources.push(o);
                    const n = noise(t, t + p.snareDecay + 0.05);
                    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 * tm;
                    const ng = ctx.createGain(); env(ng, 0.7 * (0.3 + p.snappy), p.snareDecay);
                    n.connect(hp).connect(ng).connect(out);
                    end = t + p.snareDecay; break;
                }
                case 3: { // Clap
                    const n = noise(t, t + 0.35);
                    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200 * tm; bp.Q.value = 1.2;
                    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
                    [0, 0.011, 0.022].forEach(o => { g.gain.setValueAtTime(0.9, t + o); g.gain.exponentialRampToValueAtTime(0.05, t + o + 0.009); });
                    g.gain.setValueAtTime(0.7, t + 0.033); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
                    n.connect(bp).connect(g).connect(out); end = t + 0.32; break;
                }
                case 4: tom(90); break;
                case 5: tom(130); break;
                case 6: metal(p.hatDecay, 7000, 0.5); break;
                case 7: tom(185); break;
                case 8: { // Cowbell
                    const g = ctx.createGain(); env(g, 0.5, 0.35);
                    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800 * tm; bp.Q.value = 2;
                    [540, 800].forEach(fq => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fq * tm; o.connect(bp); o.start(t); o.stop(t + 0.4); sources.push(o); });
                    bp.connect(g).connect(out); end = t + 0.4; break;
                }
                case 9: { // Shaker
                    const n = noise(t, t + 0.15);
                    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
                    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
                    g.gain.exponentialRampToValueAtTime(0.35, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
                    n.connect(hp).connect(g).connect(out); end = t + 0.15; break;
                }
                case 10: metal(p.openDecay, 6000, 0.45); break;
                case 11: { // Crash
                    metal(p.crashDecay, 4000, 0.35);
                    const n = noise(t, t + p.crashDecay);
                    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
                    const g = ctx.createGain(); env(g, 0.3, p.crashDecay);
                    n.connect(hp).connect(g).connect(out); end = t + p.crashDecay; break;
                }
            }
            // Drums are one-shots: note-off does not cut them.
            const voice = makeVoice(ctx, out, sources, () => end);
            voice.oneShot = true;
            return voice;
        },
    };

    // --- Sampler: plays an audio file chromatically.
    INSTRUMENTS.sampler = {
        name: 'Sampler',
        description: 'Load any audio file and play it chromatically across the keyboard.',
        params: [
            { id: 'sampleId', name: 'Sample', type: 'sample', def: '' },
            P('root', 'Root Note', 24, 96, 60, { step: 1, unit: 'note' }),
            P('fine', 'Fine Tune', -100, 100, 0, { step: 1, unit: 'ct' }),
            P('start', 'Start Offset', 0, 1, 0),
            T('loop', 'Loop', 0),
            P('attack', 'Attack', 0.001, 4, 0.002, { log: true, unit: 's' }),
            P('decay', 'Decay', 0.001, 4, 0.5, { log: true, unit: 's' }),
            P('sustain', 'Sustain', 0, 1, 1),
            P('release', 'Release', 0.005, 8, 0.3, { log: true, unit: 's' }),
            P('velSens', 'Velocity Sens.', 0, 1, 0.7),
            P('gain', 'Output', 0, 2, 0.9),
        ],
        presets: { 'Default': {}, 'One-Shot': { sustain: 1, release: 2 }, 'Pad': { loop: 1, attack: 0.6, release: 2 } },
        voice(ctx, dest, p, midi, vel, t) {
            const buf = DAW.audioPool && DAW.audioPool.get(p.sampleId);
            const velAmp = 1 - p.velSens + p.velSens * vel;
            const peak = 0.6 * velAmp * p.gain;
            const out = ctx.createGain(); out.connect(dest);
            if (!buf) {
                // No sample loaded: short blip so the user hears that something should happen.
                const o = ctx.createOscillator(); o.frequency.value = U.midiToFreq(midi);
                o.connect(out); out.gain.setValueAtTime(0.05, t); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
                o.start(t); o.stop(t + 0.12);
                return makeVoice(ctx, out, [o], () => t + 0.12);
            }
            const src = ctx.createBufferSource(); src.buffer = buf.buffer;
            src.playbackRate.value = Math.pow(2, (midi - p.root) / 12 + p.fine / 1200);
            if (p.loop) { src.loop = true; src.loopStart = p.start * buf.buffer.duration; src.loopEnd = buf.buffer.duration; }
            src.connect(out);
            src.start(t, p.start * buf.buffer.duration);
            ampEnvelope(out.gain, t, peak, p.attack, p.decay, p.sustain);
            return makeVoice(ctx, out, [src], rt => ampRelease(out.gain, t, rt, peak, p.attack, p.decay, p.sustain, p.release));
        },
    };

    DAW.defaultParams = function (defs, presetValues) {
        const o = {};
        defs.forEach(d => { o[d.id] = d.def; });
        return Object.assign(o, presetValues || {});
    };
    DAW.newInstrument = function (type, presetName) {
        const def = INSTRUMENTS[type];
        const presetVals = presetName && def.presets[presetName] ? def.presets[presetName] : null;
        return { type, preset: presetName || Object.keys(def.presets)[0], params: DAW.defaultParams(def.params, presetVals) };
    };

    // ---------------------------------------------------------------- plugins
    const PLUGINS = {};
    DAW.PLUGINS = PLUGINS;

    function makeIR(ctx, seconds, decayCurve) {
        const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
        const buf = ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                const x = i / len;
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, decayCurve) * Math.exp(-3 * x);
            }
            // A few discrete early reflections.
            for (let r = 0; r < 6; r++) {
                const pos = Math.floor(sr * (0.007 + Math.random() * 0.05));
                if (pos < len) d[pos] += (Math.random() > 0.5 ? 1 : -1) * (0.6 - r * 0.08);
            }
        }
        return buf;
    }
    function distortionCurve(type, drive) {
        const n = 2048, c = new Float32Array(n), k = drive;
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            switch (type) {
                case 'hard': c[i] = U.clamp(x * k * 0.5, -1, 1); break;
                case 'fuzz': c[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x * k))); break;
                case 'fold': c[i] = Math.sin(x * (1 + k * 0.15)); break;
                case 'tube': { const y = x * (1 + k * 0.1); c[i] = y >= 0 ? Math.tanh(y) : Math.tanh(y * 0.6) / 0.6 * 0.8; break; }
                default: c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); // soft clip
            }
        }
        return c;
    }
    function crushCurve(bits) {
        const n = 4096, c = new Float32Array(n), steps = Math.pow(2, bits) / 2;
        for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
        return c;
    }
    const SYNC_OPTIONS = ['free', '1/32', '1/16', '1/16d', '1/8t', '1/8', '1/8d', '1/4t', '1/4', '1/4d', '1/2', '1 bar'];
    const SYNC_BEATS = { '1/32': 0.125, '1/16': 0.25, '1/16d': 0.375, '1/8t': 1 / 3, '1/8': 0.5, '1/8d': 0.75, '1/4t': 2 / 3, '1/4': 1, '1/4d': 1.5, '1/2': 2, '1 bar': 4 };

    // Wet/dry helper: returns {input, output, dry, wet, setMix}.
    function wetDry(ctx) {
        const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
        input.connect(dry).connect(output); wet.connect(output);
        return { input, output, dry, wet, setMix(m) { dry.gain.setTargetAtTime(Math.cos(m * Math.PI / 2), ctx.currentTime, 0.01); wet.gain.setTargetAtTime(Math.sin(m * Math.PI / 2), ctx.currentTime, 0.01); } };
    }
    const smooth = (ctx, param, v) => { try { param.setTargetAtTime(v, ctx.currentTime, 0.015); } catch (e) { param.value = v; } };

    PLUGINS.eq = {
        name: 'Channel EQ', category: 'EQ & Filter', description: 'Low cut + 3-band parametric EQ with output gain.',
        params: [
            P('lowCut', 'Low Cut', 20, 1000, 20, { log: true, unit: 'Hz' }),
            P('lowGain', 'Low Gain', -18, 18, 0, { step: 0.1, unit: 'dB' }),
            P('lowFreq', 'Low Freq', 40, 600, 120, { log: true, unit: 'Hz' }),
            P('midGain', 'Mid Gain', -18, 18, 0, { step: 0.1, unit: 'dB' }),
            P('midFreq', 'Mid Freq', 200, 8000, 1000, { log: true, unit: 'Hz' }),
            P('midQ', 'Mid Q', 0.2, 10, 1, { log: true }),
            P('highGain', 'High Gain', -18, 18, 0, { step: 0.1, unit: 'dB' }),
            P('highFreq', 'High Freq', 1500, 16000, 8000, { log: true, unit: 'Hz' }),
            P('output', 'Output', -24, 12, 0, { step: 0.1, unit: 'dB' }),
        ],
        presets: { 'Flat': {}, 'Bass Boost': { lowGain: 6, lowFreq: 90 }, 'Presence': { midGain: 3, midFreq: 3500, highGain: 2 }, 'Telephone': { lowCut: 500, highGain: -18, midGain: 6, midFreq: 1500 }, 'Mud Cut': { lowCut: 60, midGain: -4, midFreq: 350, midQ: 1.5 } },
        create(ctx) {
            const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 0.707;
            const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf';
            const mid = ctx.createBiquadFilter(); mid.type = 'peaking';
            const hi = ctx.createBiquadFilter(); hi.type = 'highshelf';
            const out = ctx.createGain();
            hp.connect(lo).connect(mid).connect(hi).connect(out);
            return {
                input: hp, output: out, filters: [hp, lo, mid, hi],
                update(p) {
                    smooth(ctx, hp.frequency, p.lowCut); smooth(ctx, lo.gain, p.lowGain); smooth(ctx, lo.frequency, p.lowFreq);
                    smooth(ctx, mid.gain, p.midGain); smooth(ctx, mid.frequency, p.midFreq); smooth(ctx, mid.Q, p.midQ);
                    smooth(ctx, hi.gain, p.highGain); smooth(ctx, hi.frequency, p.highFreq); smooth(ctx, out.gain, U.dbToGain(p.output));
                },
            };
        },
    };

    PLUGINS.comp = {
        name: 'Compressor', category: 'Dynamics', description: 'Feed-forward compressor with makeup gain and parallel mix.',
        params: [
            P('threshold', 'Threshold', -60, 0, -18, { step: 0.5, unit: 'dB' }),
            P('ratio', 'Ratio', 1, 20, 4, { step: 0.1, unit: ':1' }),
            P('knee', 'Knee', 0, 40, 6, { step: 0.5, unit: 'dB' }),
            P('attack', 'Attack', 0.0005, 1, 0.01, { log: true, unit: 's' }),
            P('release', 'Release', 0.01, 1, 0.2, { log: true, unit: 's' }),
            P('makeup', 'Makeup', 0, 24, 3, { step: 0.1, unit: 'dB' }),
            P('mix', 'Dry/Wet', 0, 1, 1),
        ],
        presets: { 'Gentle': {}, 'Vocal': { threshold: -24, ratio: 3, attack: 0.005, release: 0.15, makeup: 5 }, 'Drum Smash': { threshold: -35, ratio: 12, attack: 0.001, release: 0.08, makeup: 10, mix: 0.5 }, 'Glue Bus': { threshold: -12, ratio: 2, attack: 0.03, release: 0.3, makeup: 2 } },
        meter: 'gr',
        create(ctx) {
            const wd = wetDry(ctx);
            const comp = ctx.createDynamicsCompressor(); const mk = ctx.createGain();
            wd.input.connect(comp).connect(mk).connect(wd.wet);
            return {
                input: wd.input, output: wd.output, comp,
                getReduction: () => (typeof comp.reduction === 'number' ? comp.reduction : (comp.reduction && comp.reduction.value) || 0),
                update(p) {
                    smooth(ctx, comp.threshold, p.threshold); smooth(ctx, comp.ratio, p.ratio); smooth(ctx, comp.knee, p.knee);
                    smooth(ctx, comp.attack, p.attack); smooth(ctx, comp.release, p.release); smooth(ctx, mk.gain, U.dbToGain(p.makeup)); wd.setMix(p.mix);
                },
            };
        },
    };

    PLUGINS.limiter = {
        name: 'Limiter', category: 'Dynamics', description: 'Brickwall-style limiter with drive and ceiling.',
        params: [P('drive', 'Input Drive', 0, 24, 0, { step: 0.1, unit: 'dB' }), P('ceiling', 'Ceiling', -12, 0, -0.5, { step: 0.1, unit: 'dB' }), P('release', 'Release', 0.01, 1, 0.08, { log: true, unit: 's' })],
        presets: { 'Safe': {}, 'Loud': { drive: 6, ceiling: -0.3 } },
        meter: 'gr',
        create(ctx) {
            const inG = ctx.createGain(), comp = ctx.createDynamicsCompressor(), out = ctx.createGain();
            comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.001;
            inG.connect(comp).connect(out);
            return {
                input: inG, output: out, comp,
                getReduction: () => (typeof comp.reduction === 'number' ? comp.reduction : (comp.reduction && comp.reduction.value) || 0),
                update(p) { smooth(ctx, inG.gain, U.dbToGain(p.drive)); smooth(ctx, comp.threshold, p.ceiling); smooth(ctx, comp.release, p.release); },
            };
        },
    };

    PLUGINS.gate = {
        name: 'Noise Gate', category: 'Dynamics', description: 'Expander-style gate that cuts quiet signals below the threshold.',
        params: [P('threshold', 'Threshold', -80, 0, -45, { step: 0.5, unit: 'dB' }), P('attack', 'Attack', 0.001, 0.2, 0.005, { log: true, unit: 's' }), P('release', 'Release', 0.01, 1, 0.12, { log: true, unit: 's' }), P('floor', 'Floor', -80, 0, -60, { step: 1, unit: 'dB' })],
        presets: { 'Default': {}, 'Tight': { threshold: -35, release: 0.05 } },
        create(ctx) {
            // Envelope follower: rectify -> lowpass -> threshold shaper -> drives the VCA gain.
            const input = ctx.createGain(), vca = ctx.createGain(), output = ctx.createGain();
            vca.gain.value = 0;
            input.connect(vca).connect(output);
            const rect = ctx.createWaveShaper();
            const rc = new Float32Array(1024); for (let i = 0; i < 1024; i++) rc[i] = Math.abs((i / 1023) * 2 - 1); rect.curve = rc;
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 30;
            const shaper = ctx.createWaveShaper();
            input.connect(rect).connect(lp).connect(shaper).connect(vca.gain);
            let last = '';
            return {
                input, output,
                update(p) {
                    const key = p.threshold + '|' + p.floor;
                    lp.frequency.value = U.clamp(1 / (2 * Math.PI * Math.max(0.001, (p.attack + p.release) / 2)), 1, 200);
                    if (key === last) return; last = key;
                    const n = 2048, c = new Float32Array(n), th = U.dbToGain(p.threshold), fl = U.dbToGain(p.floor);
                    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; const a = Math.abs(x); c[i] = a >= th ? 1 : (x < 0 ? fl : fl + (1 - fl) * Math.pow(a / th, 4)); }
                    shaper.curve = c;
                },
            };
        },
    };

    PLUGINS.reverb = {
        name: 'Reverb', category: 'Space', description: 'Convolution reverb with generated rooms, pre-delay and damping.',
        params: [
            P('decay', 'Decay Time', 0.2, 10, 2.5, { step: 0.1, unit: 's' }),
            P('preDelay', 'Pre-Delay', 0, 0.25, 0.02, { step: 0.001, unit: 's' }),
            P('damping', 'Damping', 1000, 20000, 7000, { log: true, unit: 'Hz' }),
            P('lowCut', 'Low Cut', 20, 1000, 150, { log: true, unit: 'Hz' }),
            P('shape', 'Tail Shape', 0.5, 6, 2, { step: 0.1 }),
            P('mix', 'Dry/Wet', 0, 1, 0.3),
        ],
        presets: { 'Room': { decay: 0.8, preDelay: 0.005, damping: 6000, mix: 0.25 }, 'Hall': { decay: 3, preDelay: 0.03, mix: 0.35 }, 'Cathedral': { decay: 8, preDelay: 0.06, damping: 4500, mix: 0.45 }, 'Plate': { decay: 1.8, preDelay: 0, damping: 14000, lowCut: 300, shape: 1 }, 'Return 100% Wet': { decay: 2.5, mix: 1 } },
        create(ctx) {
            const wd = wetDry(ctx);
            const pd = ctx.createDelay(1); const conv = ctx.createConvolver();
            const damp = ctx.createBiquadFilter(); damp.type = 'lowpass';
            const lc = ctx.createBiquadFilter(); lc.type = 'highpass';
            wd.input.connect(pd).connect(conv).connect(damp).connect(lc).connect(wd.wet);
            let lastIR = '', irTimer = null;
            return {
                input: wd.input, output: wd.output,
                update(p) {
                    smooth(ctx, pd.delayTime, p.preDelay); smooth(ctx, damp.frequency, p.damping); smooth(ctx, lc.frequency, p.lowCut); wd.setMix(p.mix);
                    const key = p.decay + '|' + p.shape;
                    if (key !== lastIR) {
                        const first = !lastIR; lastIR = key;
                        const build = () => { conv.buffer = makeIR(ctx, p.decay, p.shape); };
                        // Debounce IR regeneration while dragging (offline renders build immediately).
                        if (first || !(ctx instanceof (window.AudioContext || window.webkitAudioContext))) build();
                        else { clearTimeout(irTimer); irTimer = setTimeout(build, 120); }
                    }
                },
            };
        },
    };

    PLUGINS.delay = {
        name: 'Delay', category: 'Space', description: 'Tempo-synced stereo / ping-pong delay with feedback filter.',
        params: [
            S('sync', 'Sync', SYNC_OPTIONS, '1/8d'),
            P('time', 'Free Time', 0.01, 2, 0.35, { step: 0.005, unit: 's' }),
            P('feedback', 'Feedback', 0, 0.95, 0.4),
            T('pingpong', 'Ping-Pong', 1),
            P('tone', 'Feedback Tone', 300, 20000, 5000, { log: true, unit: 'Hz' }),
            P('mix', 'Dry/Wet', 0, 1, 0.3),
        ],
        presets: { 'Dotted Eighth': {}, 'Slapback': { sync: 'free', time: 0.09, feedback: 0.1, pingpong: 0, mix: 0.3 }, 'Dub Echo': { sync: '1/4', feedback: 0.75, tone: 1500, mix: 0.4 }, 'Return 100% Wet': { mix: 1 } },
        create(ctx, env) {
            const wd = wetDry(ctx);
            const normalIn = ctx.createGain(), ppIn = ctx.createGain();
            wd.input.connect(normalIn); wd.input.connect(ppIn);
            // Stereo delay.
            const d = ctx.createDelay(4), tone = ctx.createBiquadFilter(), fb = ctx.createGain();
            tone.type = 'lowpass';
            normalIn.connect(d).connect(tone).connect(fb).connect(d); tone.connect(wd.wet);
            // Ping-pong delay (mono in, alternating L/R).
            const mono = ctx.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
            const dl = ctx.createDelay(4), dr = ctx.createDelay(4), tl = ctx.createBiquadFilter(), fbl = ctx.createGain(), fbr = ctx.createGain();
            tl.type = 'lowpass';
            const merger = ctx.createChannelMerger(2);
            ppIn.connect(mono).connect(dl);
            dl.connect(tl); tl.connect(merger, 0, 0); tl.connect(fbl).connect(dr);
            dr.connect(merger, 0, 1); dr.connect(fbr).connect(dl);
            merger.connect(wd.wet);
            return {
                input: wd.input, output: wd.output,
                update(p) {
                    const t = p.sync === 'free' ? p.time : SYNC_BEATS[p.sync] * 60 / env.getBpm();
                    const tt = U.clamp(t, 0.001, 3.9);
                    smooth(ctx, d.delayTime, tt); smooth(ctx, dl.delayTime, tt); smooth(ctx, dr.delayTime, tt);
                    smooth(ctx, fb.gain, p.feedback); smooth(ctx, fbl.gain, p.feedback); smooth(ctx, fbr.gain, p.feedback);
                    smooth(ctx, tone.frequency, p.tone); smooth(ctx, tl.frequency, p.tone);
                    smooth(ctx, normalIn.gain, p.pingpong ? 0 : 1); smooth(ctx, ppIn.gain, p.pingpong ? 1 : 0);
                    wd.setMix(p.mix);
                },
            };
        },
    };

    function modDelay(ctx, kind) {
        // Shared stereo modulated delay used by chorus and flanger.
        const wd = wetDry(ctx);
        const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
        const dL = ctx.createDelay(0.1), dR = ctx.createDelay(0.1);
        const lfo = ctx.createOscillator(); lfo.type = 'sine';
        const depthL = ctx.createGain(), depthR = ctx.createGain();
        const fbL = ctx.createGain(), fbR = ctx.createGain();
        const up = ctx.createGain(); up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers';
        wd.input.connect(up).connect(split);
        split.connect(dL, 0); split.connect(dR, 1);
        lfo.connect(depthL).connect(dL.delayTime); lfo.connect(depthR).connect(dR.delayTime);
        dL.connect(fbL).connect(dL); dR.connect(fbR).connect(dR);
        dL.connect(merge, 0, 0); dR.connect(merge, 0, 1); merge.connect(wd.wet);
        lfo.start();
        return {
            input: wd.input, output: wd.output,
            dispose() { try { lfo.stop(); } catch (e) { /* noop */ } },
            update(p) {
                const base = p.delay / 1000, depth = p.depth / 1000;
                smooth(ctx, dL.delayTime, base); smooth(ctx, dR.delayTime, base);
                smooth(ctx, lfo.frequency, p.rate);
                smooth(ctx, depthL.gain, depth); smooth(ctx, depthR.gain, kind === 'chorus' ? -depth : depth * 0.9);
                const fbv = kind === 'flanger' ? p.feedback : 0;
                smooth(ctx, fbL.gain, fbv); smooth(ctx, fbR.gain, fbv);
                wd.setMix(p.mix);
            },
        };
    }
    PLUGINS.chorus = {
        name: 'Chorus', category: 'Modulation', description: 'Stereo chorus for width and shimmer.',
        params: [P('rate', 'Rate', 0.05, 8, 0.8, { log: true, unit: 'Hz' }), P('depth', 'Depth', 0, 10, 3, { step: 0.1, unit: 'ms' }), P('delay', 'Delay', 5, 40, 15, { step: 0.1, unit: 'ms' }), P('mix', 'Dry/Wet', 0, 1, 0.5)],
        presets: { 'Classic': {}, 'Wide Ensemble': { rate: 0.4, depth: 5, delay: 20, mix: 0.6 }, 'Vibrato': { rate: 5, depth: 2, delay: 5, mix: 1 } },
        create: ctx => modDelay(ctx, 'chorus'),
    };
    PLUGINS.flanger = {
        name: 'Flanger', category: 'Modulation', description: 'Jet-plane flanger with feedback.',
        params: [P('rate', 'Rate', 0.02, 5, 0.25, { log: true, unit: 'Hz' }), P('depth', 'Depth', 0, 5, 2, { step: 0.05, unit: 'ms' }), P('delay', 'Delay', 0.5, 10, 2.5, { step: 0.05, unit: 'ms' }), P('feedback', 'Feedback', -0.95, 0.95, 0.6), P('mix', 'Dry/Wet', 0, 1, 0.5)],
        presets: { 'Jet': {}, 'Subtle': { feedback: 0.3, mix: 0.3 }, 'Metallic': { rate: 0.1, feedback: 0.9, delay: 1 } },
        create: ctx => modDelay(ctx, 'flanger'),
    };

    PLUGINS.phaser = {
        name: 'Phaser', category: 'Modulation', description: 'Swept all-pass phaser with feedback.',
        params: [P('rate', 'Rate', 0.02, 8, 0.4, { log: true, unit: 'Hz' }), P('base', 'Center', 100, 4000, 700, { log: true, unit: 'Hz' }), P('depth', 'Depth', 0, 1, 0.7), P('feedback', 'Feedback', 0, 0.9, 0.5), S('stages', 'Stages', ['2', '4', '6', '8', '12'], '6'), P('mix', 'Dry/Wet', 0, 1, 0.5)],
        presets: { 'Classic': {}, 'Slow Sweep': { rate: 0.1, depth: 0.9, stages: '8' }, 'Fast Wobble': { rate: 4, depth: 0.5, feedback: 0.7 } },
        create(ctx) {
            const wd = wetDry(ctx);
            const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain(); lfo.connect(lfoGain); lfo.start();
            const fb = ctx.createGain(); const sum = ctx.createGain();
            wd.input.connect(sum);
            let filters = [], stagesNow = 0;
            const rebuild = n => {
                filters.forEach(f => { try { f.disconnect(); lfoGain.disconnect(f.frequency); } catch (e) { /* noop */ } });
                try { sum.disconnect(); fb.disconnect(); } catch (e) { /* noop */ }
                filters = [];
                let prev = sum;
                for (let i = 0; i < n; i++) { const f = ctx.createBiquadFilter(); f.type = 'allpass'; f.Q.value = 0.5; lfoGain.connect(f.frequency); prev.connect(f); prev = f; filters.push(f); }
                prev.connect(wd.wet); prev.connect(fb).connect(sum);
                stagesNow = n;
            };
            return {
                input: wd.input, output: wd.output,
                dispose() { try { lfo.stop(); } catch (e) { /* noop */ } },
                update(p) {
                    const n = parseInt(p.stages, 10) || 6;
                    if (n !== stagesNow) rebuild(n);
                    filters.forEach(f => smooth(ctx, f.frequency, p.base));
                    smooth(ctx, lfo.frequency, p.rate); smooth(ctx, lfoGain.gain, p.base * p.depth * 0.9); smooth(ctx, fb.gain, p.feedback);
                    wd.setMix(p.mix);
                },
            };
        },
    };

    PLUGINS.dist = {
        name: 'Distortion', category: 'Drive', description: 'Waveshaping distortion: soft, hard, fuzz, tube and wavefolder.',
        params: [S('type', 'Type', ['soft', 'hard', 'fuzz', 'tube', 'fold'], 'soft'), P('drive', 'Drive', 1, 100, 10, { log: true }), P('tone', 'Tone', 500, 16000, 6000, { log: true, unit: 'Hz' }), P('mix', 'Dry/Wet', 0, 1, 1), P('output', 'Output', -30, 6, -6, { step: 0.1, unit: 'dB' })],
        presets: { 'Warm Saturation': { type: 'tube', drive: 4, output: -2 }, 'Crunch': { type: 'soft', drive: 20 }, 'Fuzz Box': { type: 'fuzz', drive: 60, tone: 3500, output: -10 }, 'Wavefolder': { type: 'fold', drive: 30, tone: 9000 } },
        create(ctx) {
            const wd = wetDry(ctx);
            const ws = ctx.createWaveShaper(); ws.oversample = '4x';
            const tone = ctx.createBiquadFilter(); tone.type = 'lowpass';
            const out = ctx.createGain();
            wd.input.connect(ws).connect(tone).connect(wd.wet);
            wd.output.connect(out);
            let last = '';
            return {
                input: wd.input, output: out,
                update(p) {
                    const key = p.type + p.drive;
                    if (key !== last) { last = key; ws.curve = distortionCurve(p.type, p.drive); }
                    smooth(ctx, tone.frequency, p.tone); smooth(ctx, out.gain, U.dbToGain(p.output)); wd.setMix(p.mix);
                },
            };
        },
    };

    PLUGINS.crusher = {
        name: 'Bitcrusher', category: 'Drive', description: 'Bit-depth reduction for lo-fi grit, with tone control.',
        params: [P('bits', 'Bit Depth', 1, 16, 6, { step: 1, unit: 'bit' }), P('tone', 'Tone', 500, 20000, 12000, { log: true, unit: 'Hz' }), P('mix', 'Dry/Wet', 0, 1, 1)],
        presets: { 'Lo-Fi': {}, '8-Bit': { bits: 8, tone: 8000 }, 'Destroyed': { bits: 2, tone: 4000, mix: 0.7 } },
        create(ctx) {
            const wd = wetDry(ctx);
            const ws = ctx.createWaveShaper(); const tone = ctx.createBiquadFilter(); tone.type = 'lowpass';
            wd.input.connect(ws).connect(tone).connect(wd.wet);
            let last = -1;
            return { input: wd.input, output: wd.output, update(p) { if (p.bits !== last) { last = p.bits; ws.curve = crushCurve(p.bits); } smooth(ctx, tone.frequency, p.tone); wd.setMix(p.mix); } };
        },
    };

    PLUGINS.autofilter = {
        name: 'Auto Filter', category: 'EQ & Filter', description: 'Resonant filter with tempo-syncable LFO.',
        params: [S('type', 'Type', ['lowpass', 'highpass', 'bandpass', 'notch'], 'lowpass'), P('cutoff', 'Cutoff', 20, 20000, 1200, { log: true, unit: 'Hz' }), P('res', 'Resonance', 0.1, 25, 4, { log: true }), S('sync', 'LFO Sync', SYNC_OPTIONS, 'free'), P('rate', 'LFO Rate', 0.02, 20, 1, { log: true, unit: 'Hz' }), P('depth', 'LFO Depth', 0, 1, 0.5), S('lfoWave', 'LFO Wave', ['sine', 'triangle', 'square', 'sawtooth'], 'sine'), P('mix', 'Dry/Wet', 0, 1, 1)],
        presets: { 'Slow Sweep': {}, 'Wobble 1/8': { sync: '1/8', depth: 0.8, res: 8, cutoff: 600 }, 'Highpass Riser': { type: 'highpass', cutoff: 200, depth: 0, res: 2 }, 'Static Lowpass': { depth: 0, cutoff: 2000 } },
        create(ctx, env) {
            const wd = wetDry(ctx);
            const f = ctx.createBiquadFilter(); const lfo = ctx.createOscillator(); const lg = ctx.createGain();
            lfo.connect(lg).connect(f.frequency); lfo.start();
            wd.input.connect(f).connect(wd.wet);
            return {
                input: wd.input, output: wd.output, filters: [f],
                dispose() { try { lfo.stop(); } catch (e) { /* noop */ } },
                update(p) {
                    f.type = p.type; lfo.type = p.lfoWave;
                    const rate = p.sync === 'free' ? p.rate : 1 / (SYNC_BEATS[p.sync] * 60 / env.getBpm());
                    smooth(ctx, f.frequency, p.cutoff); smooth(ctx, f.Q, p.res); smooth(ctx, lfo.frequency, rate);
                    smooth(ctx, lg.gain, p.cutoff * p.depth * 0.95); wd.setMix(p.mix);
                },
            };
        },
    };

    PLUGINS.tremolo = {
        name: 'Tremolo / Auto-Pan', category: 'Modulation', description: 'Amplitude or stereo-position modulation, tempo-syncable.',
        params: [S('mode', 'Mode', ['tremolo', 'autopan'], 'tremolo'), S('sync', 'Sync', SYNC_OPTIONS, '1/8'), P('rate', 'Free Rate', 0.1, 20, 4, { log: true, unit: 'Hz' }), P('depth', 'Depth', 0, 1, 0.6), S('wave', 'Wave', ['sine', 'triangle', 'square'], 'sine')],
        presets: { 'Tremolo 1/8': {}, 'Auto-Pan 1/4': { mode: 'autopan', sync: '1/4', depth: 0.8 }, 'Helicopter': { sync: '1/16', wave: 'square', depth: 1 } },
        create(ctx, env) {
            const input = ctx.createGain(), amp = ctx.createGain(), pan = ctx.createStereoPanner(), output = ctx.createGain();
            input.connect(amp).connect(pan).connect(output);
            const lfo = ctx.createOscillator(); const ag = ctx.createGain(), pg = ctx.createGain();
            lfo.connect(ag).connect(amp.gain); lfo.connect(pg).connect(pan.pan); lfo.start();
            return {
                input, output,
                dispose() { try { lfo.stop(); } catch (e) { /* noop */ } },
                update(p) {
                    lfo.type = p.wave;
                    const rate = p.sync === 'free' ? p.rate : 1 / (SYNC_BEATS[p.sync] * 60 / env.getBpm());
                    smooth(ctx, lfo.frequency, rate);
                    const trem = p.mode === 'tremolo';
                    smooth(ctx, amp.gain, trem ? 1 - p.depth / 2 : 1); smooth(ctx, ag.gain, trem ? p.depth / 2 : 0);
                    smooth(ctx, pg.gain, trem ? 0 : p.depth);
                },
            };
        },
    };

    PLUGINS.utility = {
        name: 'Utility', category: 'Utility', description: 'Gain, stereo width, mono, pan and phase invert.',
        params: [P('gain', 'Gain', -36, 36, 0, { step: 0.1, unit: 'dB' }), P('width', 'Stereo Width', 0, 2, 1, { step: 0.01 }), P('pan', 'Pan', -1, 1, 0, { step: 0.01 }), T('mono', 'Mono', 0), T('invertL', 'Invert L', 0), T('invertR', 'Invert R', 0)],
        presets: { 'Neutral': {}, 'Mono Check': { mono: 1 }, 'Extra Wide': { width: 1.6 } },
        create(ctx) {
            const input = ctx.createGain(); input.channelCount = 2; input.channelCountMode = 'explicit';
            const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
            const ll = ctx.createGain(), lr = ctx.createGain(), rl = ctx.createGain(), rr = ctx.createGain();
            const pan = ctx.createStereoPanner(), output = ctx.createGain();
            input.connect(split);
            split.connect(ll, 0); split.connect(lr, 0); split.connect(rl, 1); split.connect(rr, 1);
            ll.connect(merge, 0, 0); rl.connect(merge, 0, 0); lr.connect(merge, 0, 1); rr.connect(merge, 0, 1);
            merge.connect(pan).connect(output);
            return {
                input, output,
                update(p) {
                    const w = p.mono ? 0 : p.width, a = 0.5 + 0.5 * w, b = 0.5 - 0.5 * w;
                    const sl = p.invertL ? -1 : 1, sr = p.invertR ? -1 : 1;
                    smooth(ctx, ll.gain, a * sl); smooth(ctx, rl.gain, b * sr); smooth(ctx, rr.gain, a * sr); smooth(ctx, lr.gain, b * sl);
                    smooth(ctx, pan.pan, p.pan); smooth(ctx, output.gain, U.dbToGain(p.gain));
                },
            };
        },
    };

    PLUGINS.spectrum = {
        name: 'Spectrum Analyzer', category: 'Utility', description: 'Real-time FFT display (pass-through).',
        params: [S('resolution', 'Resolution', ['1024', '2048', '4096', '8192'], '4096'), P('smoothing', 'Smoothing', 0, 0.95, 0.8)],
        presets: { 'Default': {} },
        meter: 'spectrum',
        create(ctx) {
            const input = ctx.createGain(), an = ctx.createAnalyser();
            input.connect(an);
            return { input, output: input, analyser: an, update(p) { an.fftSize = parseInt(p.resolution, 10); an.smoothingTimeConstant = p.smoothing; } };
        },
    };

    DAW.newPlugin = function (type, presetName) {
        const def = PLUGINS[type];
        const presetVals = presetName && def.presets[presetName] ? def.presets[presetName] : null;
        return { id: U.uid('fx'), type, bypass: false, preset: presetName || Object.keys(def.presets)[0], params: DAW.defaultParams(def.params, presetVals) };
    };
})();
