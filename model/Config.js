import YAML from 'yaml';
import fs from 'fs';
import path from 'path';
import { __dirname } from '../app.config.js';
import { atomicWriteConfig, validateMainConfig } from '../utils/configFileSafety.js';

export class Config {
  getConfig(app, name) {
    const file = this.getConfigPath(app, name);
    const main = app === 'xiuxian' && name === 'xiuxian';
    if (!fs.existsSync(file)) {
      if (main) throw new Error('修仙主配置文件缺失，请从已验证备份恢复；已停止默认初始化。');
      return {};
    }
    const data = YAML.parse(fs.readFileSync(file, 'utf8'));
    return main ? validateMainConfig(data) : data;
  }

  setConfig(app, name, config) {
    const file = this.getConfigPath(app, name);
    const main = app === 'xiuxian' && name === 'xiuxian';
    if (main) validateMainConfig(config);
    const yamlStr = YAML.stringify(config);
    // 序列化后再验证，防止传入值与实际 YAML 内容出现差异。
    if (main) validateMainConfig(YAML.parse(yamlStr));
    fs.mkdirSync(path.dirname(file), { recursive: true });

    if (main && fs.existsSync(file)) {
      const previous = fs.readFileSync(file, 'utf8');
      validateMainConfig(YAML.parse(previous));
      // 只保留一份先前的健康配置；备份失败即终止本次写入。
      atomicWriteConfig(`${file}.last-good`, previous);
    }
    // 先写临时文件并刷盘，再替换；替换失败时没有原地覆盖退路。
    atomicWriteConfig(file, yamlStr);
  }

  getConfigPath(app, name) {
    return path.join(__dirname, 'config', app, `${name}.yaml`);
  }
}

export default new Config();
