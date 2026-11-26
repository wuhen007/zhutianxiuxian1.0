import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
const part = (start, end) => {
  const offset = source.indexOf(start);
  const limit = source.indexOf(end, offset + start.length);
  assert.ok(offset >= 0 && limit > offset, start);
  return source.slice(offset, limit).replace(/^export /gm, '');
};

const code = [
  part('const DEFAULT_DANYAO = {', 'export async function Read_danyao'),
  part('export async function Read_danyao', 'export async function Write_danyao'),
].join('\n');

function runtime({ content, writeThrows = false }) {
  const writes = [];
  const sandbox = {
    path,
    __PATH: { danyao_path: '/danyao-fixture' },
    fs: { readFileSync: () => content },
    Write_danyao: async (id, value) => {
      if (writeThrows) throw new Error('global init not idle');
      writes.push({ id, value });
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${code}\nthis.Read_danyao = Read_danyao;`, sandbox);
  return { read: sandbox.Read_danyao, writes };
}

const zeroDanyao = '{\n\t"biguan": 0,\n\t"biguanxl": 0,\n\t"xingyun": 0,\n\t"lianti": 0,\n\t"ped": 0,\n\t"modao": 0,\n\t"beiyong1": 0,\n\t"beiyong2": 0,\n\t"beiyong3": 0,\n\t"beiyong4": 0,\n\t"beiyong5": 0\n}';

test('正常存档按原值返回，且不触发重写', async () => {
  const { read, writes } = runtime({ content: zeroDanyao.replace('"biguanxl": 0', '"biguanxl": 7') });
  const danyao = await read('640292421');
  assert.equal(danyao.biguanxl, 7);
  assert.equal(writes.length, 0);
});

test('全零文件自愈成默认结构并回写', async () => {
  const { read, writes } = runtime({ content: '\x00'.repeat(165) });
  const danyao = await read('640292421');
  assert.deepEqual(Object.keys(danyao).sort(), [
    'beiyong1', 'beiyong2', 'beiyong3', 'beiyong4', 'beiyong5',
    'biguan', 'biguanxl', 'lianti', 'modao', 'ped', 'xingyun',
  ]);
  assert.ok(Object.values(danyao).every(value => value === 0));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, '640292421');
});

test('文件读不到时同样不抛异常', async () => {
  // readFileSync 返回 undefined，等价于 ENOENT 时 JSON.parse 直接抛错
  const { read, writes } = runtime({ content: undefined });
  const danyao = await read('640292421');
  assert.equal(danyao.biguanxl, 0);
  assert.equal(writes.length, 1);
});

test('初始化期间写盘被拒时仍返回默认值', async () => {
  const { read, writes } = runtime({ content: '\x00'.repeat(165), writeThrows: true });
  const danyao = await read('640292421');
  assert.equal(danyao.biguanxl, 0);
  assert.equal(writes.length, 0);
});
