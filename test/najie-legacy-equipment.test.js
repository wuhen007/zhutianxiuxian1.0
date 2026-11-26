import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isFixedStatEquipment, MAX_PERCENT_EQUIPMENT_STAT } from '../model/equipmentStats.js';

test('扣除旧装备时保留缺失品阶并检查实际命中项', () => {
  const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function Add_najie_thing');
  const end = source.indexOf("} else if (thing_class == '仙宠')", start);
  const equipmentBranch = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(
    equipmentBranch,
    /if \(x > 0 && \(pinji === undefined \|\| pinji === null\)\)/,
  );
  assert.match(equipmentBranch, /if \(!target\) throw new Error\(/);
  assert.doesNotMatch(equipmentBranch, /x < 0[\s\S]*pinji = Math\.trunc/);
});

test('重铸石提升品质时百分比装备封顶499，固定装备和未满词条保持原计算', async () => {
  const source = fs.readFileSync(new URL('../apps/User/UserHome.js', import.meta.url), 'utf8');
  const start = source.indexOf("if (thing_name == '重铸石') {");
  const end = source.indexOf("if (thing_exist.type == '洗髓')", start);
  assert.ok(start >= 0 && end > start);
  let equipment = {
    武器: { pinji: 1, atk: 400, def: 200, HP: 499 },
    护具: { pinji: 1, atk: 1000, def: 200, HP: 300 },
    法宝: { pinji: 1, atk: 2, def: 3, HP: 4 },
  };
  let stoneCost = 0;
  const deps = {
    isFixedStatEquipment, MAX_PERCENT_EQUIPMENT_STAT,
    Read_equipment: async () => structuredClone(equipment),
    Write_equipment: async (_id, result) => { equipment = result; },
    Add_najie_thing: async (_id, name, category, count) => {
      assert.equal(name, '重铸石');
      assert.equal(category, '道具');
      stoneCost += count;
    },
    getPinjiName: String,
    Math: Object.assign(Object.create(Math), { random: () => 0.999 }),
    e: { reply() {} }, thing_name: '重铸石', usr_qq: 'owner',
  };
  await new Function(...Object.keys(deps), `return (async () => { ${source.slice(start, end)} })();`)(...Object.values(deps));
  assert.deepEqual(equipment.武器, { pinji: 5, atk: 499, def: 300, HP: 499 });
  assert.deepEqual(equipment.护具, { pinji: 5, atk: 1500, def: 300, HP: 450 });
  assert.deepEqual(equipment.法宝, { pinji: 5, atk: 3, def: 4.5, HP: 6 });
  assert.equal(stoneCost, -1);
});
