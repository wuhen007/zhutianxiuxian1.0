// 世界聊天频道 · 插件指令层(留言板/拉取模型)
// 指令:
//   #世界 说 <内容>      -> 上送一条留言到云端(跨服可见)
//   #世界 留言 <内容>    -> 同"说"
//   #世界 查看 [n]       -> 拉取最近 n 条(默认 config.query_default)
//   #世界 改名 <昵称>    -> 管理员设置本服展示昵称(会显示在所有服的留言里)
//   #世界 公开群号       -> 管理员两步确认:向其他服【管理员】公开本服真实群号
//   #世界 群号全员公开   -> 二次确认:群号对全员公开(普通成员也可见)
//   #世界 关闭群号       -> 管理员关闭群号公开
//   #世界 状态           -> 显示本服连接状态 + 本服群号(仅本地可见)
//   #世界 开关           -> 管理员开/关本服世界频道(默认开,明示可控)
import { plugin } from '../../api/api.js';
import { worldChatClient as client } from './client.js';
import { clientFilter } from './filter.js';

export class WorldChat extends plugin {
  constructor() {
    super({
      name: 'WorldChat',
      dsc: '诸天世界聊天频道(跨服留言板)',
      event: 'message',
      priority: 9000,
      rule: [
        { reg: '^#世界\\s*(?:说|留言)\\s*([\\s\\S]+)$', fnc: 'say' },
        { reg: '^#世界\\s*查看\\s*(\\d+)?$', fnc: 'view' },
        { reg: '^#世界\\s*改名\\s*([\\s\\S]+)$', fnc: 'rename' },
        { reg: '^#世界\\s*公开群号$', fnc: 'exposeAdmin' },
        { reg: '^#世界\\s*群号全员公开$', fnc: 'exposePublic' },
        { reg: '^#世界\\s*关闭群号$', fnc: 'exposeOff' },
        { reg: '^#世界\\s*状态$', fnc: 'stat' },
        { reg: '^#世界\\s*开关$', fnc: 'toggle' }
      ]
    });
    // 启动即尝试连接云端(配置 enable=true 时)。用 setTimeout 避免阻塞插件注册。
    setTimeout(() => client.connect(), 0);
    // 群号公开两步确认状态: { admin: 时间戳, public: 时间戳 }
    this._pending = { admin: 0, public: 0 };
  }

  // 两步确认是否仍在有效期(60s)
  _pendingValid(key) {
    return Date.now() - this._pending[key] < 60000;
  }

  async say(e) {
    if (!e.isGroup) {
      e.reply('世界频道仅限群聊使用');
      return true;
    }
    client.observeGroup(e.group_id);
    if (!client.cfg.enable) {
      e.reply('本服世界频道已关闭,管理员可用「#世界 开关」开启');
      return true;
    }
    const m = e.msg.match(/^#世界\s*(?:说|留言)\s*([\s\S]+)$/);
    const text = (m && m[1] ? m[1] : '').trim();
    if (!text) {
      e.reply('说点什么吧,例如:#世界 说 道友们,今日遮天位面可有人?');
      return true;
    }
    const clean = clientFilter(text);
    const res = await client.pub(clean);
    if (res.ok) {
      e.reply('✅ 留言已上送诸天世界频道');
    } else if (!client.connected) {
      e.reply('⚠️ 尚未连接到云端,稍后自动重试中…(可用「#世界 状态」查看)');
    } else {
      e.reply('⚠️ 上送失败:' + (res.reason || '未知'));
    }
    return true;
  }

  async view(e) {
    if (!e.isGroup) {
      e.reply('世界频道仅限群聊使用');
      return true;
    }
    client.observeGroup(e.group_id);
    const m = e.msg.match(/^#世界\s*查看\s*(\d+)?$/);
    const limit = m && m[1] ? Math.min(50, Number(m[1])) : client.cfg.query_default;
    const res = await client.query(limit);
    if (!res.ok) {
      e.reply(
        client.connected
          ? '⚠️ 查询超时,请稍后再试'
          : '⚠️ 尚未连接到云端,稍后自动重试中…(可用「#世界 状态」查看)'
      );
      return true;
    }
    if (!res.messages || !res.messages.length) {
      e.reply('🌿 诸天世界频道暂无留言,快来抢占第一楼!');
      return true;
    }
    const lines = res.messages.map((x) => {
      const t = new Date(x.ts).toLocaleString('zh-CN', { hour12: false });
      let line = `[${x.name} · ${t}]\n${clientFilter(x.msg)}`;
      // 群号可见性:public=全员可见;admin=仅本服管理员可见;其他不显示
      if (x.expose_level === 'public' && Array.isArray(x.groups) && x.groups.length) {
        line += `\n[群:${x.groups.join('、')}]`;
      } else if (
        x.expose_level === 'admin' &&
        e.isMaster &&
        Array.isArray(x.groups) &&
        x.groups.length
      ) {
        line += `\n[群:${x.groups.join('、')}](仅管理员可见)`;
      }
      return line;
    });
    e.reply(
      `【诸天世界频道 · 共 ${res.total} 条,显示最近 ${res.messages.length} 条】\n` +
        lines.join('\n\n')
    );
    return true;
  }

  async stat(e) {
    const s = client.status();
    const conn = s.connected ? (s.authed ? '已连接云端' : '握手中…') : '未连接(自动重连中)';
    const groups = client.groups();
    const exposeText =
      s.expose_group === 'public'
        ? '对全员公开'
        : s.expose_group === 'admin'
          ? '仅其他服管理员可见'
          : '不公开';
    e.reply(
      [
        '【世界频道状态】',
        `开关:${s.enable ? '已开启' : '已关闭'}`,
        `连接:${conn}`,
        `云端:${s.url}`,
        `本服标识:${s.server_id}`,
        `区服昵称:${s.name}(对所有服可见)`,
        `群号公开:${exposeText}`,
        `本服群号:${groups.length ? groups.join('、') : '(该实例尚未在此群收发过世界指令)'}`
      ].join('\n')
    );
    return true;
  }

  async rename(e) {
    if (!e.isMaster) {
      e.reply('仅管理员可修改本服昵称');
      return true;
    }
    const m = e.msg.match(/^#世界\s*改名\s*([\s\S]+)$/);
    const name = (m && m[1] ? m[1] : '').trim().slice(0, 30);
    if (!name) {
      e.reply('用法:#世界 改名 <区服昵称>\n例如:#世界 改名 遮天·莫无铭的群');
      return true;
    }
    if (client.setName(name)) {
      e.reply(`✅ 本服昵称已设为「${name}」(重连云端后对所有服生效)`);
    } else {
      e.reply('⚠️ 昵称设置失败');
    }
    return true;
  }

  async exposeAdmin(e) {
    if (!e.isMaster) {
      e.reply('仅管理员可操作群号公开');
      return true;
    }
    const cur = client.cfg.expose_group;
    if (cur === 'public') {
      e.reply('当前已对全员公开。如需改为仅管理员可见,请先「#世界 关闭群号」再重新设置。');
      return true;
    }
    if (cur === 'admin') {
      e.reply('已设为「仅其他服管理员可见」,普通成员看不到你的群号。\n如需对全员公开,发送:#世界 群号全员公开');
      return true;
    }
    // cur === false
    if (this._pendingValid('admin')) {
      this._pending.admin = 0;
      if (client.setExpose('admin')) {
        e.reply('✅ 已开启:你的真实群号将对其他服【管理员】可见(普通成员不可见)。重连云端后生效。');
      } else {
        e.reply('⚠️ 设置失败');
      }
      return true;
    }
    this._pending.admin = Date.now();
    e.reply(
      '⚠️ 确认公开群号?\n开启后你的真实 QQ 群号将显示给其他服的【管理员】(普通成员看不到)。\n30秒内再次发送「#世界 公开群号」以确认。'
    );
    return true;
  }

  async exposePublic(e) {
    if (!e.isMaster) {
      e.reply('仅管理员可操作群号公开');
      return true;
    }
    const cur = client.cfg.expose_group;
    if (cur === false) {
      e.reply('请先发送「#世界 公开群号」开启群号展示,再决定是否需要全员公开。');
      return true;
    }
    if (cur === 'public') {
      e.reply('当前已对【全员】公开,所有服成员查看世界频道都能看到你的群号。');
      return true;
    }
    // cur === 'admin' -> 二次确认
    if (this._pendingValid('public')) {
      this._pending.public = 0;
      if (client.setExpose('public')) {
        e.reply('✅ 群号已对【全员】公开,所有服成员查看世界频道都能看到你的真实群号。重连云端后生效。');
      } else {
        e.reply('⚠️ 设置失败');
      }
      return true;
    }
    this._pending.public = Date.now();
    e.reply(
      '⚠️ 二次确认:对全员公开后,所有服【普通成员】也能看到你的真实群号。\n30秒内再次发送「#世界 群号全员公开」以确认。'
    );
    return true;
  }

  async exposeOff(e) {
    if (!e.isMaster) {
      e.reply('仅管理员可操作群号公开');
      return true;
    }
    this._pending.admin = 0;
    this._pending.public = 0;
    if (client.setExpose(false)) {
      e.reply('✅ 已关闭群号公开,他人世界频道不再显示你的群号。');
    } else {
      e.reply('⚠️ 设置失败');
    }
    return true;
  }

  async toggle(e) {
    if (!e.isMaster) {
      e.reply('仅管理员可操作世界频道开关');
      return true;
    }
    const now = !client.cfg.enable;
    client.setEnable(now);
    e.reply(`诸天世界频道已${now ? '开启' : '关闭'}`);
    return true;
  }
}
