// 诸天世界频道：群管理员显式加入后实时收发。
import { plugin } from '../../api/api.js';
import { worldChatClient as client } from './client.js';
import { clientFilter } from './filter.js';

const USER_COOLDOWN_MS = 5_000;

function senderName(e) {
  return String(
    e.sender?.card || e.sender?.nickname || e.nickname || '无名道友'
  )
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 30);
}

function canManageGroup(e) {
  const role = String(e.sender?.role || e.member?.role || '').toLowerCase();
  return (
    e.isMaster ||
    role === 'owner' ||
    role === 'admin' ||
    e.member?.is_owner === true ||
    e.member?.is_admin === true
  );
}

function readableConnectionError(error) {
  return (
    {
      replaced: '同一本服标识已在另一台机器登录',
      auth_failed: '本服凭据未登记或不匹配',
      banned: '本服已被总机禁用',
      enrollment_required: '未配置总机登记令牌',
      enrollment_invalid: '总机登记令牌无效',
      registration_rate_limited: '总机登记过于频繁，请稍后再试',
    }[error] ||
    error ||
    '无'
  );
}

export class WorldChat extends plugin {
  constructor() {
    super({
      name: 'WorldChat',
      dsc: '诸天世界聊天频道',
      event: 'message',
      priority: 9000,
      rule: [
        { reg: '^#世界\\s*(?:说|留言)\\s*([\\s\\S]+)$', fnc: 'say' },
        { reg: '^#世界\\s*查看\\s*(\\d+)?$', fnc: 'view' },
        { reg: '^#世界\\s*加入$', fnc: 'join' },
        { reg: '^#世界\\s*退出$', fnc: 'leave' },
        { reg: '^#世界\\s*改名\\s*([\\s\\S]+)$', fnc: 'rename' },
        { reg: '^#世界\\s*公开群号$', fnc: 'exposeAdmin' },
        { reg: '^#世界\\s*群号全员公开$', fnc: 'exposePublic' },
        { reg: '^#世界\\s*关闭群号$', fnc: 'exposeOff' },
        { reg: '^#世界\\s*状态$', fnc: 'stat' },
        { reg: '^#世界\\s*开关$', fnc: 'toggle' },
      ],
    });
    this.cooldowns = new Map();
    this.pendingConfirmations = new Map();
    client.setMessageHandler((message) => this.broadcast(message));
    setTimeout(() => client.connect(), 0);
  }

  async broadcast(message) {
    const time = new Date(message.ts).toLocaleString('zh-CN', {
      hour12: false,
    });
    let output = `【诸天世界 · ${message.name}】\n${
      message.sender_name
    }：${clientFilter(message.msg)}\n${time}`;
    if (message.expose_level === 'public' && message.groups?.length) {
      output += `\n来源群：${message.groups.join('、')}`;
    }
    const results = await Promise.allSettled(
      client.groups().map((groupId) => Bot.pickGroup(groupId).sendMsg(output))
    );
    for (const result of results) {
      if (result.status === 'rejected')
        Bot.logger?.warn?.(`[worldchat] 群推送失败: ${result.reason}`);
    }
  }

  requireJoinedGroup(e) {
    if (!e.isGroup) {
      e.reply('世界频道仅限群聊使用');
      return false;
    }
    if (!client.isGroupJoined(e.group_id)) {
      e.reply('本群尚未加入世界频道，请让机器人管理员发送「#世界 加入」');
      return false;
    }
    return true;
  }

  async say(e) {
    if (!this.requireJoinedGroup(e)) return true;
    if (!client.cfg.enable) {
      e.reply('本服世界频道已关闭，管理员可用「#世界 开关」开启');
      return true;
    }
    const match = e.msg.match(/^#世界\s*(?:说|留言)\s*([\s\S]+)$/);
    const text = (match?.[1] || '').trim();
    if (!text) return true;

    const cooldownKey = String(e.user_id);
    const wait =
      USER_COOLDOWN_MS - (Date.now() - (this.cooldowns.get(cooldownKey) || 0));
    if (wait > 0) {
      e.reply(`世界频道传音尚在回响，请等待 ${Math.ceil(wait / 1000)} 秒`);
      return true;
    }
    this.cooldowns.set(cooldownKey, Date.now());

    const result = await client.pub(clientFilter(text), {
      name: senderName(e),
      tag: client.userTag(e.user_id),
    });
    if (!result.ok) {
      const reasons = {
        disconnected: '尚未连接到世界频道总机，正在自动重连',
        timeout: '总机响应超时，请稍后再试',
        user_cooldown: '发送过快，请稍后再试',
        rate_limited: '本服发送过于频繁，请稍后再试',
        auth_failed: '本服凭据未在总机登记，请联系管理员',
      };
      e.reply(
        `世界传音失败：${reasons[result.reason] || result.reason || '未知错误'}`
      );
    }
    return true;
  }

  async view(e) {
    if (!this.requireJoinedGroup(e)) return true;
    const match = e.msg.match(/^#世界\s*查看\s*(\d+)?$/);
    const limit = match?.[1]
      ? Math.min(50, Number(match[1]))
      : client.cfg.query_default;
    const result = await client.query(limit);
    if (!result.ok) {
      e.reply('世界频道暂时无法查询，请稍后再试');
      return true;
    }
    if (!result.messages?.length) {
      e.reply('诸天世界频道暂无消息');
      return true;
    }
    const lines = result.messages.map((message) => {
      const time = new Date(message.ts).toLocaleString('zh-CN', {
        hour12: false,
      });
      let line = `[${message.name} · ${
        message.sender_name
      } · ${time}]\n${clientFilter(message.msg)}`;
      if (message.expose_level === 'public' && message.groups?.length) {
        line += `\n[群：${message.groups.join('、')}]`;
      } else if (
        message.expose_level === 'admin' &&
        e.isMaster &&
        message.groups?.length
      ) {
        line += `\n[群：${message.groups.join('、')}，仅管理员可见]`;
      }
      return line;
    });
    e.reply(
      `【诸天世界频道 · 最近 ${result.messages.length} 条】\n${lines.join(
        '\n\n'
      )}`
    );
    return true;
  }

  async join(e) {
    if (!e.isGroup) return e.reply('请在需要加入世界频道的群里发送该指令');
    if (!canManageGroup(e))
      return e.reply('仅机器人主人、群主或群管理员可让群聊加入世界频道');
    if (!client.joinGroup(e.group_id)) return e.reply('本群已经加入世界频道');
    e.reply('本群已加入诸天世界频道，之后将实时收取跨服消息');
    return true;
  }

  async leave(e) {
    if (!e.isGroup) return e.reply('请在需要退出世界频道的群里发送该指令');
    if (!canManageGroup(e))
      return e.reply('仅机器人主人、群主或群管理员可让群聊退出世界频道');
    if (!client.leaveGroup(e.group_id)) return e.reply('本群尚未加入世界频道');
    e.reply('本群已退出诸天世界频道');
    return true;
  }

  async stat(e) {
    const status = client.status();
    const connection = status.connected
      ? status.authed
        ? '已连接'
        : '鉴权中'
      : '未连接，自动重连中';
    const lines = [
      '【世界频道状态】',
      `开关：${status.enable ? '已开启' : '已关闭'}`,
      `连接：${connection}`,
      `当前群：${
        e.isGroup && client.isGroupJoined(e.group_id) ? '已加入' : '未加入'
      }`,
      `已收取序号：${status.last_seen_seq}`,
    ];
    if (e.isMaster) {
      if (!e.isGroup) {
        lines.push(
          `总机：${status.url}`,
          `本服标识：${status.server_id}`,
          `区服昵称：${status.name}`,
          `身份登记：${status.registered ? '已登记' : '待自动登记'}`,
          `已加入群：${
            status.joined_groups.length
              ? status.joined_groups.join('、')
              : '无'
          }`
        );
      }
      lines.push(`最近错误：${readableConnectionError(status.last_error)}`);
    }
    e.reply(lines.join('\n'));
    return true;
  }

  async rename(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可修改本服昵称');
    const name = (e.msg.match(/^#世界\s*改名\s*([\s\S]+)$/)?.[1] || '')
      .trim()
      .slice(0, 30);
    if (!name) return true;
    client.setName(name);
    e.reply(`本服昵称已设为「${name}」，重连后生效`);
    return true;
  }

  confirmationKey(type, e) {
    return `${type}:${e.user_id}:${e.group_id || 'private'}`;
  }

  confirmed(type, e) {
    const key = this.confirmationKey(type, e);
    const timestamp = this.pendingConfirmations.get(key) || 0;
    if (Date.now() - timestamp < 30_000) {
      this.pendingConfirmations.delete(key);
      return true;
    }
    this.pendingConfirmations.set(key, Date.now());
    return false;
  }

  async exposeAdmin(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可操作群号公开');
    if (client.cfg.expose_group === 'admin')
      return e.reply('当前已设为仅其他服管理员可见');
    if (!this.confirmed('admin', e)) {
      return e.reply(
        '确认后，已加入世界频道的群号会提供给其他服管理员。30 秒内再次发送本指令确认。'
      );
    }
    client.setExpose('admin');
    e.reply('群号已设为仅其他服管理员可见');
    return true;
  }

  async exposePublic(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可操作群号公开');
    if (!this.confirmed('public', e)) {
      return e.reply(
        '确认后，已加入世界频道的群号会对所有成员公开。30 秒内再次发送本指令确认。'
      );
    }
    client.setExpose('public');
    e.reply('群号已对所有世界频道成员公开');
    return true;
  }

  async exposeOff(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可操作群号公开');
    client.setExpose(false);
    e.reply('已关闭群号公开');
    return true;
  }

  async toggle(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可操作世界频道开关');
    const enabled = !client.cfg.enable;
    client.setEnable(enabled);
    e.reply(`诸天世界频道已${enabled ? '开启' : '关闭'}`);
    return true;
  }
}
