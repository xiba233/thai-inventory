"""Static-site adapter. Runs the unchanged business service in Pyodide.

Backups contain data only: never execute SQL from an uploaded backup.
"""
import base64
import hashlib
import json
import sqlite3
from pathlib import Path
from inventory.service import Service, now

DB = Path('/inventory-data/inventory.db')
FORMAT = 'thai-inventory-data-v1'
ROUTES = {
    'settings': 'save_settings', 'sku': 'save_sku',
    'sku-factory-batch': 'save_factory_batch', 'sku-lead-batch': 'save_lead_batch',
    'clearance': 'save_mapping', 'transit': 'save_transit', 'reconcile': 'reconcile',
    'retire': 'retire', 'restore-sku': 'restore_sku', 'clearance-restore': 'restore_clearance',
    'transit-remove': 'remove_transit', 'transit-delete': 'delete_transit',
    'purchase': 'save_purchase', 'purchase-simple': 'save_simple_purchase',
    'shipment': 'record_shipment', 'purchase-ship': 'ship_purchase',
    'purchase-delete': 'delete_purchase', 'purchase-restore': 'restore_purchase',
    'purchase-cancel': 'cancel_purchase', 'purchase-reconcile': 'reconcile_purchase',
    'purchase-shipment-undo': 'undo_purchase_shipment',
}

def canonical(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':'))

def export_data(path):
    with sqlite3.connect(str(path)) as conn:
        tables = {}
        for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid"):
            columns = [r[1] for r in conn.execute(f'PRAGMA table_info("{name}")')]
            tables[name] = {'columns': columns, 'rows': [list(r) for r in conn.execute(f'SELECT * FROM "{name}"')]}
    return {'format': FORMAT, 'exported_at': now(), 'sha256': hashlib.sha256(canonical(tables).encode()).hexdigest(), 'tables': tables}

def restore_data(value, destination=DB):
    if not isinstance(value, dict) or value.get('format') != FORMAT:
        raise ValueError('请选择本系统导出的完整 JSON 备份；库存 Excel 请到数据导入页面上传。')
    tables = value.get('tables')
    if not isinstance(tables, dict) or hashlib.sha256(canonical(tables).encode()).hexdigest() != value.get('sha256'):
        raise ValueError('备份内容不完整或已被改动，当前数据保持不变。')
    candidate = Path(str(destination) + '.restore')
    candidate.unlink(missing_ok=True)
    try:
        fresh = Service(candidate)
        expected = export_data(candidate)['tables']
        if set(tables) != set(expected):
            raise ValueError('备份版本或数据表不匹配，请使用本系统当前版本的完整备份。')
        with sqlite3.connect(str(candidate)) as conn:
            # Delete seed rows first, insert in schema creation order, then verify foreign keys.
            for name in reversed(list(expected)):
                conn.execute(f'DELETE FROM "{name}"')
            for name, schema in expected.items():
                data = tables[name]
                if not isinstance(data, dict) or not isinstance(data.get('columns'), list) or len(data['columns']) != len(schema['columns']) or set(data['columns']) != set(schema['columns']) or not isinstance(data.get('rows'), list):
                    raise ValueError('备份字段不匹配：' + name)
                rows = data['rows']
                if len(rows) > 500000 or any(not isinstance(r, list) or len(r) != len(schema['columns']) or any(v is not None and type(v) not in (str, int, float) for v in r) for r in rows):
                    raise ValueError('备份记录格式无效：' + name)
                marks = ','.join('?' for _ in schema['columns'])
                order = [data['columns'].index(c) for c in schema['columns']]
                conn.executemany(f'INSERT INTO "{name}" VALUES ({marks})', ([row[i] for i in order] for row in rows))
            if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or conn.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('备份数据关联校验失败，当前数据保持不变。')
        # Exercise normalization, JSON fields and actual calculations before replacing anything.
        validated = Service(candidate)
        result = validated.state()
        with validated.connect() as conn:
            validated._audit(conn, 'browser_restore', {'source_exported_at': value.get('exported_at')})
        candidate.replace(destination)
        return {'ok': True, 'records': len(result['rows']), 'message': '完整备份已恢复，库存、采购、历史及配置已同步更新。'}
    finally:
        candidate.unlink(missing_ok=True)

def dispatch(path, value=None):
    service = Service(DB)
    value = {} if value is None else value
    if not isinstance(value, dict):
        raise ValueError('提交内容格式无效。')
    if path == 'state':
        return service.state()
    if path == 'backup-export':
        return export_data(DB)
    if path == 'backup-restore':
        return restore_data(value)
    if path in {'preview', 'import', 'transit-import'}:
        filename = str(value.get('filename', ''))
        if not filename.lower().endswith('.xlsx'):
            raise ValueError('仅支持 XLSX 文件，不执行宏或代码。')
        content = base64.b64decode(value.get('content', ''), validate=True)
        if not content or len(content) > 15 * 1024 * 1024:
            raise ValueError('Excel 文件为空或超过 15 MB。')
        if path == 'preview':
            return service.preview_upload(content, filename, value.get('snapshot_date'))
        if path == 'import':
            return service.import_inventory(content, filename, value.get('snapshot_date'))
        return service.import_transit(content, filename)
    if path not in ROUTES:
        raise ValueError('未知操作：' + path)
    return getattr(service, ROUTES[path])(value)

def request(encoded):
    try:
        request = json.loads(encoded)
        return canonical({'ok': True, 'value': dispatch(request['path'], request.get('data'))})
    except Exception as exc:
        return canonical({'ok': False, 'error': str(exc) or '操作失败，请检查填写内容。'})
