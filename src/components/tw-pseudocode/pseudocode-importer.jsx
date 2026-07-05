import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

/**
 * "Pseudocode" editor tab: compile SB3 Creator pseudocode (plus optional uploaded
 * SVG costumes) into a project and load it into the running VM.
 */
class PseudocodeImporter extends React.Component {
    constructor (props) {
        super(props);
        this.state = {code: '', uploads: [], status: '', busy: false};
        this.handleFiles = this.handleFiles.bind(this);
        this.compile = this.compile.bind(this);
    }
    handleFiles (e) {
        const files = Array.from(e.target.files || []);
        files.forEach(f => {
            if (!/\.svg$/i.test(f.name) && !f.type.includes('svg')) return;
            const reader = new FileReader();
            reader.onload = () => this.setState(s => ({
                uploads: [...s.uploads, {sprite: '', filename: f.name, svg: String(reader.result)}]
            }));
            reader.readAsText(f);
        });
        e.target.value = '';
    }
    setSprite (i, sprite) {
        this.setState(s => ({uploads: s.uploads.map((u, idx) => (idx === i ? {...u, sprite} : u))}));
    }
    removeUpload (i) {
        this.setState(s => ({uploads: s.uploads.filter((_, idx) => idx !== i)}));
    }
    async compile () {
        this.setState({busy: true, status: 'Compiling…'});
        try {
            const mod = await import(/* webpackChunkName: "sb3-creator" */ '../../lib/sb3-creator.js');
            const SB3Creator = mod.default;
            const creator = new SB3Creator();
            creator.parse(this.state.code);
            const missing = [];
            this.state.uploads.forEach(u => {
                const name = (u.sprite || '').trim();
                if (name && u.svg && !creator.applyCustomSVG(name, u.svg)) missing.push(name);
            });
            const blob = await creator.generateSB3();
            const buffer = await blob.arrayBuffer();
            await this.props.vm.loadProject(buffer);
            const first = this.props.vm.runtime.targets.find(target => !target.isStage);
            if (first) this.props.vm.setEditingTarget(first.id);
            const warns = [...creator.warnings];
            if (missing.length) warns.push(`no sprite: ${missing.join(', ')}`);
            this.setState({status: warns.length ?
                `Loaded with warnings — ${warns.slice(0, 4).join(' · ')}` :
                'Loaded into the editor. Switch to the Code tab to see the blocks.'});
        } catch (e) {
            this.setState({status: `Error: ${e.message}`});
        }
        this.setState({busy: false});
    }
    render () {
        const wrap = {height: '100%', boxSizing: 'border-box', padding: 16, overflow: 'auto',
            display: 'flex', flexDirection: 'column', font: '14px/1.5 sans-serif', color: '#575e75'};
        const btn = {padding: '10px 18px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer',
            fontWeight: 600, background: 'linear-gradient(135deg,#4c97ff,#4280d7)', alignSelf: 'flex-start'};
        return (
            <div style={wrap}>
                <div style={{marginBottom: 10}}>
                    <strong style={{fontSize: 16}}>Pseudocode → Project</strong>
                    <span style={{marginLeft: 10, opacity: .7}}>
                        Write SB3 Creator pseudocode, compile it into blocks, and load it here.
                    </span>
                </div>
                <textarea
                    value={this.state.code}
                    onChange={e => this.setState({code: e.target.value})}
                    placeholder={'SPRITE Cat:\n  WHEN flag clicked:\n    say "Hello!" for 2 seconds\n    FOREVER:\n      move 10 steps\n      turn right 15 degrees'}
                    spellCheck={false}
                    style={{flex: 1, minHeight: 220, width: '100%', boxSizing: 'border-box', resize: 'vertical',
                        fontFamily: 'monospace', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 8, padding: 12}}
                />
                <div style={{margin: '12px 0 4px'}}>
                    <label style={{fontWeight: 600}}>Custom SVG costumes: </label>
                    <input type="file" accept=".svg,image/svg+xml" multiple onChange={this.handleFiles} />
                    <span style={{marginLeft: 8, opacity: .6, fontSize: 12}}>assign each to a sprite by name</span>
                </div>
                {this.state.uploads.map((u, i) => (
                    <div key={i} style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6}}>
                        <img src={`data:image/svg+xml,${encodeURIComponent(u.svg)}`} alt=""
                            style={{width: 32, height: 32, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 6}} />
                        <input placeholder="sprite name" value={u.sprite}
                            onChange={e => this.setSprite(i, e.target.value)}
                            style={{padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', width: 130}} />
                        <span style={{flex: 1, opacity: .6, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis'}}>{u.filename}</span>
                        <button onClick={() => this.removeUpload(i)} style={{border: 'none', background: 'none', cursor: 'pointer', fontSize: 16}}>✕</button>
                    </div>
                ))}
                <div style={{marginTop: 12, display: 'flex', alignItems: 'center', gap: 14}}>
                    <button onClick={this.compile} disabled={this.state.busy || !this.state.code.trim()} style={btn}>
                        🚀 Compile &amp; Load
                    </button>
                    {this.state.status ? <span style={{fontSize: 13}}>{this.state.status}</span> : null}
                </div>
            </div>
        );
    }
}

PseudocodeImporter.propTypes = {
    vm: PropTypes.shape({loadProject: PropTypes.func}).isRequired
};

export default connect(state => ({vm: state.scratchGui.vm}))(PseudocodeImporter);
