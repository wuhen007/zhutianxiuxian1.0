import { appsOut } from './robot/index.js';
const apps = await appsOut('apps').then(req => {
  logger.info(`zhutianxiuxian1.0 start ~`);
  return req;
});
export { apps };
