#!/usr/bin/env python3
"""Buat game/public/assets/m/motion.{json,bin.wasm} dari animasi rekam-gerak (GLB kerangka Ready Player Me).
pakai: python3 tools/make-motion.py <folder masculine/glb>
Yang dilakukan: buang mesh, buang jari tangan kanan (ditimpa genggaman joran), buang gerak maju (root motion)
supaya animasi di tempat, simpan geser pinggul sebagai selisih dari tinggi pinggul T-pose, idle diambil tiap 2 gambar."""
import json, struct, sys, math, os
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'game', 'public', 'assets', 'm')
CLIPS = [('idle', 'idle/M_Standing_Idle_001.glb', 0, 2), ('walk', 'locomotion/M_Walk_001.glb', 2, 1), ('jog', 'locomotion/M_Jog_001.glb', 1, 1)]  # nama, berkas, jumlah siklus langkah, ambil tiap n gambar
HIP_REF = 1.0026113986969  # tinggi pinggul T-pose pustaka (m)

def load(f):
    b = open(f, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), b[20 + n + 8:]
def acc(j, bn, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return [list(struct.unpack_from('<%df' % n, bn, off + k * 4 * n)) for k in range(a['count'])]

nodes, node_ix, anims, blob, views, accs = [], {}, [], bytearray(), [], []
def node(name):
    if name not in node_ix: node_ix[name] = len(nodes); nodes.append({'name': name})
    return node_ix[name]
def put(rows, typ, minmax=False):
    flat = [x for r in rows for x in r]; off = len(blob); blob.extend(struct.pack('<%df' % len(flat), *flat))
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(flat) * 4})
    a = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': len(rows), 'type': typ}
    if minmax: a['min'] = [min(flat)]; a['max'] = [max(flat)]
    accs.append(a); return len(accs) - 1

meta = {}
for name, f, cycles, every in CLIPS:
    j, bn = load(os.path.join(SRC, f)); names = [x.get('name') for x in j['nodes']]; a = j['animations'][0]
    samplers, channels, sig = [], [], {}
    tcache = {}
    for c in a['channels']:
        bone, path = names[c['target']['node']], c['target']['path']; s = a['samplers'][c['sampler']]
        if path == 'translation' and bone != 'Hips': continue
        if path == 'scale' or (bone.startswith('RightHand') and bone != 'RightHand'): continue
        t = [r[0] for r in acc(j, bn, s['input'])]; v = acc(j, bn, s['output'])
        if path == 'translation':  # pinggul: selisih dari T-pose, gerak maju dibuang
            x0 = sum(r[0] for r in v) / len(v); z0, z1 = v[0][2], v[-1][2]; dur = t[-1] - t[0] or 1
            v = [[r[0] - x0, r[1] - HIP_REF, r[2] - z0 - (z1 - z0) * (tt - t[0]) / dur] for r, tt in zip(v, t)]
            zm = sum(r[2] for r in v) / len(v); v = [[r[0], r[1], r[2] - zm] for r in v]
            meta[name] = {'dur': round(dur, 4), 'cycles': cycles, 'dist': round(z1 - z0, 3)}
        if bone in ('LeftUpLeg', 'RightUpLeg') and path == 'rotation': sig[bone] = (t, v)
        idx = list(range(0, len(t), every)); 
        if idx[-1] != len(t) - 1: idx.append(len(t) - 1)
        t2 = [[t[i] - t[0]] for i in idx]; v2 = [v[i] for i in idx]
        key = tuple(round(x[0], 5) for x in t2)
        if key not in tcache: tcache[key] = put(t2, 'SCALAR', True)
        samplers.append({'input': tcache[key], 'output': put(v2, 'VEC4' if path == 'rotation' else 'VEC3'), 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': node(bone), 'path': path}})
    anims.append({'name': name, 'samplers': samplers, 'channels': channels})
    # fase langkah: kapan kaki kiri paling depan (untuk menyamakan jalan & lari)
    if cycles:
        t, L = sig['LeftUpLeg']; _, R = sig['RightUpLeg']; n = len(t) - 1
        d = [L[i][0] - R[i][0] for i in range(n)]; per = n / cycles
        re = sum(d[i] * math.cos(2 * math.pi * i / per) for i in range(n)); im = sum(d[i] * math.sin(2 * math.pi * i / per) for i in range(n))
        meta[name]['lead'] = round(math.atan2(im, re) / (2 * math.pi) % 1, 4)   # bagian siklus saat selisih kaki maksimum
        meta[name]['step'] = round(meta[name]['dist'] / (cycles * 2), 3)
doc = {'asset': {'version': '2.0', 'generator': 'paunjunan make-motion'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes))), 'extras': {'motion': meta}}],
       'nodes': nodes, 'animations': anims, 'accessors': accs, 'bufferViews': views, 'buffers': [{'uri': 'motion.bin.wasm', 'byteLength': len(blob)}]}
open(os.path.join(OUT, 'motion.json'), 'w').write(json.dumps(doc, separators=(',', ':')))
open(os.path.join(OUT, 'motion.bin.wasm'), 'wb').write(blob)
print(meta, 'bin', len(blob) // 1024, 'KB', 'json', len(json.dumps(doc)) // 1024, 'KB')
