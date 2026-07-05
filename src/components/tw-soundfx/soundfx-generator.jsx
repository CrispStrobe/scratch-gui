import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import Modal from '../../containers/modal.jsx';
import {soundUpload} from '../../lib/file-uploader.js';
import {SynthParams, AudioSynthesizer, audioBufferToWav} from '../../lib/crispfxr-core.js';

/**
 * Brickwright Sound FX generator — an 8-bit sfxr-style synth (vendored from
 * CrispStrobe/CrispFXR-web) in a modal. Pick a preset, tweak, preview, and
 * "Add to sprite" bakes the rendered WAV onto the editing target as a real
 * Scratch sound.
 */

const WAVES = ['Square', 'Sawtooth', 'Sine', 'Noise'];
const PRESETS = [
    ['pickupCoin', '🪙 Coin'], ['laserShoot', '🔫 Laser'], ['explosion', '💥 Explosion'],
    ['powerUp', '⭐ Power-up'], ['hitHurt', '🤕 Hit'], ['jump', '⬆️ Jump'],
    ['blip', '🔹 Blip'], ['zap', '⚡ Zap'], ['bell', '🔔 Bell'],
    ['click', '🖱️ Click'], ['woosh', '🌬️ Woosh'], ['random', '🎲 Random']
];
const SLIDERS = [
    ['p_base_freq', 'Frequency', 0.001, 1],
    ['p_env_sustain', 'Sustain', 0, 1],
    ['p_env_decay', 'Decay', 0, 1],
    ['p_env_punch', 'Punch', 0, 1],
    ['sound_vol', 'Volume', 0, 1]
];

class SoundFxGenerator extends React.Component {
    constructor (props) {
        super(props);
        this.synth = new AudioSynthesizer();
        const p = new SynthParams();
        p.pickupCoin();
        this.state = {params: {...p}, name: 'FX', status: '', busy: false};
        this.applyPreset = this.applyPreset.bind(this);
        this.play = this.play.bind(this);
        this.add = this.add.bind(this);
    }
    duration () {
        const p = this.state.params;
        return Math.max(0.3, Math.min(3, (p.p_env_attack || 0) + (p.p_env_sustain || 0) + (p.p_env_decay || 0) + 0.2));
    }
    applyPreset (method) {
        const p = new SynthParams();
        p[method]();
        const label = (PRESETS.find(x => x[0] === method) || [, method])[1].replace(/^\S+\s/, '');
        this.setState({params: {...p}, name: label, status: ''});
    }
    setParam (key, value) {
        this.setState(s => ({params: {...s.params, [key]: value}}));
    }
    async render_ () {
        const buf = await this.synth.generateBuffer(this.state.params, this.duration());
        // sfxr buffers come out quiet and at inconsistent levels — normalise to a
        // healthy peak so both the preview and the saved sound are clearly audible.
        if (buf) {
            const d = buf.getChannelData(0);
            let peak = 0;
            for (let i = 0; i < d.length; i++) {
                const a = Math.abs(d[i]);
                if (a > peak) peak = a;
            }
            if (peak > 0.0001) {
                const gain = 0.9 / peak;
                for (let i = 0; i < d.length; i++) d[i] *= gain;
            }
        }
        return buf;
    }
    async play () {
        try {
            const buf = await this.render_();
            if (!buf) {
                this.setState({status: 'No audio was produced — try another preset.'});
                return;
            }
            const ctx = this.synth.audioContext;
            if (ctx.state !== 'running') {
                try {
                    await ctx.resume();
                } catch (e) { /* best effort */ }
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start();
            this.setState({status: ''});
        } catch (e) {
            this.setState({status: `Preview failed: ${e.message}`});
        }
    }
    async add () {
        this.setState({busy: true, status: 'Rendering…'});
        try {
            const buf = await this.render_();
            if (!buf) throw new Error('render returned no audio');
            const wav = audioBufferToWav(buf, null, 16);
            const arrayBuffer = await wav.arrayBuffer();
            const storage = this.props.vm.runtime.storage;
            const targetId = this.props.vm.editingTarget.id;
            soundUpload(arrayBuffer, 'audio/wav', storage, newSound => {
                newSound.name = (this.state.name || 'FX').slice(0, 40);
                this.props.vm.addSound(newSound, targetId).then(() => {
                    if (this.props.onNewSound) this.props.onNewSound();
                    this.props.onRequestClose();
                });
            }, () => this.setState({busy: false, status: 'Could not add the sound.'}));
        } catch (e) {
            this.setState({busy: false, status: `Error: ${e.message}`});
        }
    }
    render () {
        const p = this.state.params;
        const btn = {padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', cursor: 'pointer',
            background: '#f8fafc', font: 'inherit'};
        const primary = {...btn, border: 'none', color: '#fff', fontWeight: 600,
            background: 'linear-gradient(135deg,#22c3d6,#0e9bb0)'};
        return (
            <Modal
                id="soundFxGenerator"
                contentLabel="Generate a Sound"
                onRequestClose={this.props.onRequestClose}
            >
                <div style={{padding: 20, width: 560, maxWidth: '92vw', boxSizing: 'border-box',
                    font: '14px/1.5 sans-serif', color: '#575e75'}}>
                    <div style={{marginBottom: 10, opacity: .8}}>
                        Pick a preset, tweak it, preview, then add it to the current sprite as a real sound.
                    </div>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8, marginBottom: 14}}>
                        {PRESETS.map(([method, label]) => (
                            <button key={method} style={btn} onClick={() => this.applyPreset(method)}>{label}</button>
                        ))}
                    </div>

                    <div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
                        <label style={{fontWeight: 600}}>Wave{' '}
                            <select value={p.wave_type}
                                onChange={e => this.setParam('wave_type', Number(e.target.value))}
                                style={{padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1'}}>
                                {WAVES.map((w, i) => <option key={w} value={i}>{w}</option>)}
                            </select>
                        </label>
                    </div>

                    <div style={{margin: '12px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px'}}>
                        {SLIDERS.map(([key, label, min, max]) => (
                            <label key={key} style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                <span style={{width: 80}}>{label}</span>
                                <input type="range" min={min} max={max} step={0.01}
                                    value={p[key] === undefined ? 0 : p[key]}
                                    onChange={e => this.setParam(key, Number(e.target.value))}
                                    style={{flex: 1}} />
                            </label>
                        ))}
                    </div>

                    <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6}}>
                        <button style={btn} onClick={() => this.applyPreset('random')}>🎲 Randomize</button>
                        <button style={btn} onClick={this.play}>▶ Preview</button>
                        <input value={this.state.name} onChange={e => this.setState({name: e.target.value})}
                            placeholder="sound name"
                            style={{padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', width: 130}} />
                        <button style={primary} disabled={this.state.busy} onClick={this.add}>➕ Add to sprite</button>
                        {this.state.status ? <span style={{fontSize: 13}}>{this.state.status}</span> : null}
                    </div>

                    <div style={{marginTop: 14, fontSize: 11, opacity: .55}}>
                        Synth engine vendored from CrispFXR (CrispStrobe/CrispFXR-web).
                    </div>
                </div>
            </Modal>
        );
    }
}

SoundFxGenerator.propTypes = {
    vm: PropTypes.shape({addSound: PropTypes.func}).isRequired,
    onRequestClose: PropTypes.func.isRequired,
    onNewSound: PropTypes.func
};

export default connect(state => ({vm: state.scratchGui.vm}))(SoundFxGenerator);
