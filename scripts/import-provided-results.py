"""Import supplied CitcomCU outputs and training logs without inventing measurements.

Usage: python scripts/import-provided-results.py --geodynamics-zip FILE
       --workflow FILE --training-log FILE [--output artifacts/provided]
Only the archive's allowlisted files are read; no ZIP paths are extracted.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import xml.etree.ElementTree as ET
import zipfile


def fact(label, value, unit=''):
    return {'label': label, 'value': value, 'unit': unit}


def parse_geodynamics(archive, workflow):
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip():
            raise ValueError('ZIP CRC verification failed')
        checks = bundle.read('SHA256SUMS.txt').decode('utf-8-sig').splitlines()
        hashes = {}
        for line in checks:
            digest, name = line.split(maxsplit=1)
            hashes[name] = hashlib.sha256(bundle.read(name)).hexdigest()
            if hashes[name] != digest.lower():
                raise ValueError(f'SHA256 mismatch: {name}')
        grid_bytes = bundle.read('02_paraview/caseA-12500.vtr')
        root = ET.fromstring(grid_bytes)
        piece = root.find('./RectilinearGrid/Piece')
        arrays = {item.get('Name'): [float(x) for x in item.text.split()] for item in piece.findall('.//DataArray')}
        radii, theta, phi = [arrays[name] for name in ['radius', 'theta', 'phi']]
        shape = [len(radii), len(theta), len(phi)]
        total = math.prod(shape)
        temperature, velocity = arrays['temperature'], arrays['velocity']
        if len(temperature) != total or len(velocity) != total * 3:
            raise ValueError('Grid and field lengths disagree')
        if not all(math.isfinite(value) for values in arrays.values() for value in values):
            raise ValueError('Non-finite field values')
        raw = {}
        overlap_max_difference = [0.0, 0.0, 0.0, 0.0]
        headers = []
        for rank in range(4):
            rows = {}
            for field in ['coord', 'temp', 'velo']:
                suffix = '' if field == 'coord' else '.12500'
                lines = bundle.read(f'03_raw/caseA.{field}.{rank}{suffix}').decode().splitlines()
                header = lines[0].split()
                rows[field] = [list(map(float, line.split())) for line in lines[1:] if line.strip()]
                if len(rows[field]) != int(header[0]):
                    raise ValueError('Raw row count differs from header')
                if field != 'coord':
                    headers.append((int(header[1]), float(header[2])))
            if not len(rows['coord']) == len(rows['temp']) == len(rows['velo']):
                raise ValueError('Raw coordinate/field lengths disagree')
            for coord, temp, velo in zip(rows['coord'], rows['temp'], rows['velo']):
                key = tuple(round(x, 5) for x in coord)
                # Raw components are theta/phi/radius; the supplied VTR uses
                # radius/theta/phi. Keep every overlap candidate, without averaging.
                values = [temp[0], velo[2], velo[0], velo[1]]
                if key in raw:
                    overlap_max_difference = [max(delta, abs(a - b)) for delta, a, b in zip(overlap_max_difference, raw[key][0], values)]
                raw.setdefault(key, []).append(values)
        if len(set(headers)) != 1 or headers[0][0] != 12500 or len(raw) != total:
            raise ValueError('Inconsistent snapshot step, time or coverage')
        for z, p in enumerate(phi):
            for y, t in enumerate(theta):
                for x, r in enumerate(radii):
                    i = (z * len(theta) + y) * len(radii) + x
                    candidates = raw.get(tuple(round(v, 5) for v in (t, p, r)), [])
                    target = [temperature[i], *velocity[i * 3:i * 3 + 3]]
                    if not any(all(math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-7) for a, b in zip(source, target)) for source in candidates):
                        raise ValueError('VTR field differs from raw snapshot')
        verified = workflow['verified_example']
        if verified['grid_shape'] != shape or verified['simulation_time'] != headers[0][1]:
            raise ValueError('Workflow example differs from supplied snapshot')
        speed = [math.hypot(*velocity[i:i + 3]) for i in range(0, len(velocity), 3)]
        middle = len(phi) // 2
        cells = lambda field: [[y, x, field[(middle * len(theta) + y) * len(radii) + x]] for x in range(len(radii)) for y in range(len(theta))]
        data = {
            'step': 12500, 'simulation_time': headers[0][1], 'grid_shape': shape, 'point_count': total,
            'rank_count': 4, 'snapshot_count': 1, 'unit_note': '温度、速度和模拟时间保留原始数值，材料未提供物理单位。',
            'statistics': {
                'temperature': {'min': min(temperature), 'max': max(temperature), 'mean': statistics.fmean(temperature)},
                'velocity': {'min': min(speed), 'max': max(speed), 'mean': statistics.fmean(speed)},
            },
            'slice': {'longitude_degrees': math.degrees(phi[middle]), 'latitudes': [90 - math.degrees(t) for t in theta],
                      'radii': radii, 'temperature': cells(temperature), 'velocity': cells(speed)},
            'verification': {'sha256_files': len(hashes), 'unique_raw_points': len(raw), 'raw_fields_match_vtr': True,
                             'velocity_component_order': ['radius', 'theta', 'phi'], 'overlap_max_absolute_difference': overlap_max_difference},
        }
        files = {'caseA-12500.vtr': grid_bytes, 'caseA-12500-preview.png': bundle.read('01_preview/caseA-12500-preview.png'),
                 '00_README.txt': bundle.read('00_README.txt'), 'SHA256SUMS.txt': bundle.read('SHA256SUMS.txt')}
        return data, files


def parse_training(text):
    blocks = re.findall(r'## ([^\n]+)\n+```text\n(.*?)```', text, re.S)
    operators = []
    for title, block in blocks:
        match = re.search(r'operator=([\w-]+).*?status=RUNNING', block)
        if not match:
            continue
        name = match.group(1)
        if f'operator={name} status=SUCCESS exit_code=0' not in block:
            raise ValueError(f'Operator did not complete: {name}')
        item = {'id': name, 'title': title.strip(), 'logs': block.strip().splitlines(), 'facts': [], 'series': [], 'trials': [], 'output_paths': []}
        for epoch, loss, accuracy in re.findall(r'epoch=(\d+)/\d+ train_loss=([\d.]+) train_accuracy=([\d.]+)%', block):
            item['series'].append({'epoch': int(epoch), 'loss': float(loss), 'accuracy': float(accuracy)})
        if name == 'ai-data-prep':
            unique = int(re.search(r'unique_images=(\d+)', block)[1])
            duplicates = int(re.search(r'duplicate_entries=(\d+)', block)[1])
            item['splits'] = [{'split': split, 'images': int(images), 'samples': int(samples), 'path': path}
                              for split, images, samples, path in re.findall(r'\[INFO\] (train|validation|test)\s+images=(\d+) samples=(\d+) file=(\S+)', block)]
            if sum(row['images'] for row in item['splits']) != unique:
                raise ValueError('Split image counts disagree')
            item['facts'] = [fact('有效图像', unique, '张'), fact('重复条目', duplicates, '条'),
                             fact('训练样本', item['splits'][0]['samples'], '条'), fact('验证样本', item['splits'][1]['samples'], '条')]
            item['output_paths'] = [row['path'] for row in item['splits']]
        elif name == 'transformers-trainer':
            last = item['series'][-1]
            item['facts'] = [fact('训练轮次', len(item['series']), '轮'), fact('最终训练损失', last['loss']), fact('最终训练准确率', last['accuracy'], '%')]
        elif name == 'peft-lora':
            rank, alpha, dropout = re.search(r'r=(\d+) alpha=(\d+) dropout=([\d.]+)', block).groups()
            loss, evaluation = re.search(r'train_loss=([\d.]+) eval_loss=([\d.]+)', block).groups()
            item['facts'] = [fact('训练损失', float(loss)), fact('验证损失', float(evaluation)), fact('LoRA rank', int(rank)), fact('LoRA alpha', int(alpha)), fact('Dropout', float(dropout))]
            item['series'] = [{'epoch': 1, 'loss': float(loss), 'eval_loss': float(evaluation)}]
        elif name == 'pytorch-ddp':
            item['series'] = [{'trial': int(trial), 'epoch': int(epoch), 'loss': float(loss), 'accuracy': float(accuracy)}
                              for trial, epoch, loss, accuracy in re.findall(r'trial=(\d+) epoch=(\d+)/\d+ train_loss=([\d.]+) train_accuracy=([\d.]+)%', block)]
            util = {int(trial): (float(base), float(parallel), float(gain)) for trial, base, parallel, gain in
                    re.findall(r'trial=(\d+) baseline_util=([\d.]+)% parallel_util=([\d.]+)% relative_gain=([\d.]+)%', block)}
            for trial, baseline, parallel, reduction in re.findall(r'trial=(\d+) baseline=([\d.]+)s parallel=([\d.]+)s time_reduction=([\d.]+)%', block):
                base_util, parallel_util, gain = util[int(trial)]
                item['trials'].append({'trial': int(trial), 'baseline_seconds': float(baseline), 'parallel_seconds': float(parallel),
                                       'time_reduction_percent': float(reduction), 'baseline_util_percent': base_util,
                                       'parallel_util_percent': parallel_util, 'relative_util_gain_percent': gain})
            count, reduction, gain = re.search(r'trials_completed=(\d+) mean_time_reduction=([\d.]+)% mean_relative_util_gain=([\d.]+)%', block).groups()
            if len(item['trials']) != int(count):
                raise ValueError('Trial count disagrees')
            for key, reported in [('time_reduction_percent', reduction), ('relative_util_gain_percent', gain)]:
                if abs(statistics.fmean(row[key] for row in item['trials']) - float(reported)) > .011:
                    raise ValueError('Reported trial mean disagrees')
            item['facts'] = [fact('对比试验', int(count), '次'), fact('平均耗时降低', float(reduction), '%'), fact('平均利用率相对提升', float(gain), '%')]
        item['output_paths'] += re.findall(r'Saving (?:checkpoint|adapter|metrics): (\S+)', block)
        operators.append(item)
    expected = {'ai-data-prep', 'transformers-trainer', 'peft-lora', 'pytorch-ddp'}
    if {item['id'] for item in operators} != expected:
        raise ValueError('Missing or unexpected training operator blocks')
    return {'run_id': re.search(r'run_id=(\S+)', text)[1], 'operators': operators}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--geodynamics-zip', type=Path, required=True)
    parser.add_argument('--workflow', type=Path, required=True)
    parser.add_argument('--training-log', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'artifacts/provided')
    args = parser.parse_args()
    workflow = json.loads(args.workflow.read_text(encoding='utf-8-sig'))
    geo, files = parse_geodynamics(args.geodynamics_zip, workflow)
    training = parse_training(args.training_log.read_text(encoding='utf-8-sig'))
    args.output.mkdir(parents=True, exist_ok=True)
    assets = []
    def asset(asset_id, name, data, kind, preview=False):
        path = args.output / name
        path.write_bytes(data)
        entry = {'id': asset_id, 'name': name, 'path': name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                 'type': kind, 'format': path.suffix[1:], 'source_type': 'provided', 'preview_supported': preview,
                 'download_url': f'/api/v1/provided-files/{asset_id}/download'}
        if preview:
            entry['preview_url'] = f'/api/v1/provided-files/{asset_id}/preview'
        assets.append(entry)
        return {k: v for k, v in entry.items() if k != 'path'}
    geo_assets = [asset('citcomcu-archive', '地球动力_结果.zip', args.geodynamics_zip.read_bytes(), 'dataset')]
    for name, data in files.items():
        kind = 'image' if name.endswith('.png') else 'dataset' if name.endswith('.vtr') else 'report'
        geo_assets.append(asset(f'citcomcu-{name}', name, data, kind, not name.endswith('.vtr')))
    geo_assets.append(asset('citcomcu-workflow', 'geodynamics-workflow.json', args.workflow.read_bytes(), 'report', True))
    training_assets = [asset('training-source', '训练算子输出.md', args.training_log.read_bytes(), 'log', True)]
    preparation = next(item for item in training['operators'] if item['id'] == 'ai-data-prep')
    split_by_name = {item['split']: item for item in preparation['splits']}
    results = [
        {'id': 'citcomcu-caseA-12500', 'kind': 'geodynamics', 'domain': 'geodynamics', 'scenario_id': 'tectonic-evolution',
         'title': 'CitcomCU caseA · 温度与流速结果', 'source_name': '地球动力_结果.zip', 'source_type': 'provided',
         'summary': [fact('时间步', geo['step']), fact('模拟时间', geo['simulation_time']), fact('网格点数', geo['point_count'], '个'), fact('结果分块', geo['rank_count'], '个')],
         'snapshot': geo, 'artifacts': geo_assets},
        {'id': 'word-image-training', 'kind': 'training', 'domain': 'llm', 'scenario_id': 'llm-pretraining',
         'title': '图文模型训练 · 算子实测结果', 'source_name': '训练算子输出.md', 'source_type': 'provided',
         'summary': [fact('有效图像', sum(item['images'] for item in preparation['splits']), '张'),
                     *[fact(label, split_by_name[name]['samples'], '条') for name, label in [('train', '训练样本'), ('validation', '验证样本'), ('test', '测试样本')]]],
         'training': training, 'artifacts': training_assets},
    ]
    document = {'version': 1, 'results': results, 'assets': assets}
    (args.output / 'index.json').write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'results': [r['id'] for r in results], 'grid_points': geo['point_count'], 'verified_files': geo['verification']['sha256_files'],
                      'operators': [item['id'] for item in training['operators']], 'output': str(args.output)}, ensure_ascii=True))


if __name__ == '__main__':
    main()
