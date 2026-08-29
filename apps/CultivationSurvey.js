import { Show, config, plugin, puppeteer } from '../api/api.js';
import {
  Add_najie_thing,
  Add_源石,
  Read_najie,
  Read_player,
  channel,
  existplayer,
} from '../model/xiuxian.js';
import {
  SURVEY_QUESTIONS,
  SURVEY_REWARDS,
  SURVEY_VERSION,
  buildSurveyStatistics,
  buildSurveyStatisticsView,
  formatSurveyStatistics,
  readSurveyResponse,
  readSurveyResponses,
  submitSurveyResponse,
} from '../model/cultivationSurvey.js';
import {
  createSurveyWebLink,
  getEndlessWebConfig,
  registerSurveyWebController,
} from '../model/endlessWebServer.js';

const REWARD_KEYS = Object.freeze({
  众生仙钓: `zhutian-survey-v${SURVEY_VERSION}:fishing`,
  无尽秘钥: `zhutian-survey-v${SURVEY_VERSION}:endless-key`,
  超越宝盒: `zhutian-survey-v${SURVEY_VERSION}:transcend-box`,
  源石: `zhutian-survey-v${SURVEY_VERSION}:source-stone`,
});

export class CultivationSurvey extends plugin {
  constructor() {
    super({
      name: '诸天修仙调研问卷',
      dsc: '网页问卷、一次性奖励与后台统计',
      event: 'message',
      priority: 580,
      rule: [
        { reg: '^#诸天调研问卷$', fnc: 'openSurvey' },
        { reg: '^#诸天调研统计$', fnc: 'showSurveyStatistics' },
      ],
    });
    registerSurveyWebController(this);
  }

  async resolveUserId(e) {
    return channel(String(e.user_id).replace('qg_', ''));
  }

  async openSurvey(e) {
    const userId = await this.resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('请先创建修仙角色，再参与诸天调研。');
    const existing = readSurveyResponse(userId);
    if (existing?.status === 'granted') {
      return e.reply('你已经完成本期诸天调研，问卷奖励也已发放。');
    }
    if (!getEndlessWebConfig().enabled) {
      return e.reply('诸天调研网页服务尚未开启，请检查 config/endless-web.json。');
    }
    try {
      const player = await Read_player(userId);
      const link = await createSurveyWebLink(this, {
        rawUserId: String(e.user_id),
        userId: String(userId),
        playerName: player.名号 || '无名道友',
      });
      return e.reply([
        `【${player.名号 || '道友'}的诸天修仙调研问卷】`,
        link,
        '专属入口两分钟内有效，仅限本人首次打开。',
        '完成奖励：众生仙钓×10、无尽秘钥×3、超越宝盒×20、源石×1500万。',
      ].join('\n'));
    } catch (error) {
      logger.error('[诸天调研] 入口生成失败', error);
      return e.reply('问卷入口生成失败，请稍后重试。');
    }
  }

  async getSurveyWebState(session) {
    const response = readSurveyResponse(session.userId);
    return {
      version: SURVEY_VERSION,
      playerName: session.playerName || '无名道友',
      submitted: response?.status === 'granted',
      pendingReward: response?.status === 'rewarding',
      questions: SURVEY_QUESTIONS,
      rewards: SURVEY_REWARDS,
    };
  }

  async awardSurveyRewards(userId) {
    const player = await Read_player(userId);
    const najie = await Read_najie(userId);
    if (player.练气存档状态 === '不可用' || player.练气存档状态 === '永久不可用') {
      throw new Error('当前练气存档处于封锁状态，暂时不能领取问卷奖励');
    }
    if (najie.时间线封锁?.locked) {
      throw new Error('当前纳戒处于时间线封锁状态，解除后可重新提交领取奖励');
    }

    await Add_najie_thing(userId, '众生仙钓', '道具', SURVEY_REWARDS.众生仙钓, undefined, 1, {
      idempotencyKey: REWARD_KEYS.众生仙钓,
    });
    await Add_najie_thing(userId, '无尽秘钥', '道具', SURVEY_REWARDS.无尽秘钥, undefined, 1, {
      idempotencyKey: REWARD_KEYS.无尽秘钥,
    });
    await Add_najie_thing(userId, '超越宝盒', '盒子', SURVEY_REWARDS.超越宝盒, undefined, 1, {
      idempotencyKey: REWARD_KEYS.超越宝盒,
    });
    await Add_源石(userId, SURVEY_REWARDS.源石, {
      applyMingge: false,
      idempotencyKey: REWARD_KEYS.源石,
    });

    const [savedPlayer, savedNajie] = await Promise.all([
      Read_player(userId),
      Read_najie(userId),
    ]);
    const missingClaim = [REWARD_KEYS.众生仙钓, REWARD_KEYS.无尽秘钥, REWARD_KEYS.超越宝盒]
      .find(key => !savedNajie._rewardClaims?.[key]);
    if (missingClaim || !savedPlayer._rewardClaims?.[REWARD_KEYS.源石]) {
      throw new Error('奖励存档校验失败，请重新提交');
    }
  }

  async submitSurvey(session, body) {
    const redisClient = globalThis.redis;
    const lockKey = `Xiuxian:Survey:Submit:${SURVEY_VERSION}:${session.userId}`;
    const lockToken = `${Date.now()}:${Math.random()}`;
    const acquired = await redisClient.set(lockKey, lockToken, { NX: true, EX: 60 });
    if (!acquired) throw new Error('答卷正在提交，请勿重复操作');
    try {
      const result = await submitSurveyResponse({
        userId: session.userId,
        playerName: session.playerName,
        answers: body.answers,
        award: userId => this.awardSurveyRewards(userId),
      });
      return {
        ok: true,
        alreadySubmitted: result.alreadySubmitted,
        message: result.alreadySubmitted
          ? '本期答卷已经提交，奖励已发放。'
          : '答卷提交成功，全部奖励已发放至你的存档与纳戒。',
        rewards: SURVEY_REWARDS,
      };
    } finally {
      if ((await redisClient.get(lockKey)) === lockToken) await redisClient.del(lockKey);
    }
  }

  async showSurveyStatistics(e) {
    const userId = String(await this.resolveUserId(e));
    const masters = (config.getConfig('xiuxian', 'xiuxian')?.Master || []).map(String);
    if (!e.isMaster && !masters.includes(userId)) return false;
    const statistics = buildSurveyStatistics(readSurveyResponses());
    const report = formatSurveyStatistics(statistics);
    try {
      const view = buildSurveyStatisticsView(statistics);
      const renderData = await new Show(e).get_surveyStatisticsData({
        ...view,
        saveId: `survey_statistics_v${statistics.version}`,
        imgType: 'png',
      });
      const image = await puppeteer.screenshot('survey_statistics', renderData);
      if (!image) throw new Error('统计图未生成');
      return e.reply(image);
    } catch (error) {
      logger.error('[诸天调研] 统计图片生成失败', error);
      return e.reply(report);
    }
  }
}

export default CultivationSurvey;
