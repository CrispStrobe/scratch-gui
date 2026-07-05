import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

/**
 * In-GUI panel that compiles SB3 Creator pseudocode (plus optional uploaded SVG
 * costumes) into a project and loads it straight into the running VM.
 */
class PseudocodeImporter extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false, code: '', uploads: [], status: '', busy: false};
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
            this.props.vm.setEditingTarget(this.props.vm.runtime.targets[1] &&
                this.props.vm.runtime.targets[1].id);
            const warns = [...creator.warnings];
            if (missing.length) warns.push(`no sprite: ${missing.join(', ')}`);
            this.setState({status: warns.length ? `Loaded with warnings: ${warns.slice(0, 3).join(' · ')}` : 'Loaded into the editor!'});
        } catch (e) {
            this.setState({status: `Error: ${e.message}`});
        }
        this.setState({busy: false});
    }
    render () {
        const btn = {position: 'fixed', left: 12, bottom: 12, zIndex: 9999, padding: '8px 14px',
            borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600,
            background: 'linear-gradient(135deg,#855cd6,#9966ff)', boxShadow: '0 2px 8px rgba(0,0,0,.25)'};
        if (!this.state.open) {
            return <button style={btn} onClick={() => this.setState({open: true})}>📝 Pseudocode → Project</button>;
        }
        const panel = {position: 'fixed', left: 12, bottom: 12, zIndex: 9999, width: 420, maxWidth: '92vw',
            maxHeight: '80vh', overflow: 'auto', background: '#fff', color: '#222', borderRadius: 10,
            boxShadow: '0 8px 30px rgba(0,0,0,.3)', padding: 14, font: '13px/1.4 sans-serif'};
        return (
            <div style={panel}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                    <strong>Pseudocode → Project</strong>
                    <button style={{border: 'none', background: 'none', fontSize: 18, cursor: 'pointer'}}
                        onClick={() => this.setState({open: false})}>✕</button>
                </div>
                <textarea
                    value={this.state.code}
                    onChange={e => this.setState({code: e.target.value})}
                    placeholder={'SPRITE Cat:\n  WHEN flag clicked:\n    say "Hello!" for 2 seconds'}
                    spellCheck={false}
                    style={{width: '100%', height: 150, fontFamily: 'monospace', fontSize: 12,
                        boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 6, padding: 8}}
                />
                <div style={{margin: '8px 0'}}>
                    <label style={{fontWeight: 600}}>Custom SVG costumes: </label>
                    <input type="file" accept=".svg,image/svg+xml" multiple onChange={this.handleFiles} />
                </div>
                {this.state.uploads.map((u, i) => (
                    <div key={i} style={{display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4}}>
                        <img src={`data:image/svg+xml,${encodeURIComponent(u.svg)}`} alt=""
                            style={{width: 28, height: 28, objectFit: 'contain', border: '1px solid #eee', borderRadius: 4}} />
                        <input placeholder="sprite name" value={u.sprite}
                            onChange={e => this.setSprite(i, e.target.value)}
                            style={{padding: '3px 6px', borderRadius: 5, border: '1px solid #cbd5e1', width: 110}} />
                        <span style={{flex: 1, opacity: .6, overflow: 'hidden', textOverflow: 'ellipsis'}}>{u.filename}</span>
                        <button onClick={() => this.removeUpload(i)} style={{border: 'none', background: 'none', cursor: 'pointer'}}>✕</button>
                    </div>
                ))}
                <button
                    onClick={this.compile}
                    disabled={this.state.busy || !this.state.code.trim()}
                    style={{marginTop: 8, padding: '8px 14px', borderRadius: 8, border: 'none', color: '#fff',
                        cursor: 'pointer', fontWeight: 600, background: 'linear-gradient(135deg,#4c97ff,#4280d7)'}}
                >
                    🚀 Compile &amp; Load
                </button>
                {this.state.status ? <div style={{marginTop: 8, fontSize: 12}}>{this.state.status}</div> : null}
            </div>
        );
    }
}

PseudocodeImporter.propTypes = {
    vm: PropTypes.shape({loadProject: PropTypes.func}).isRequired
};

export default connect(state => ({vm: state.scratchGui.vm}))(PseudocodeImporter);
