import { createEndlessWebHttpServer } from '../model/endlessWebServer.js';

export async function startWebGateway({ config, redisClient, relayClient, logger = console }) {
  if (!config?.publicUrl || !['http:', 'https:'].includes(new URL(config.publicUrl).protocol)) {
    throw new Error('A valid ENDLESS_WEB_PUBLIC_URL is required');
  }
  if (!redisClient || !relayClient) throw new Error('Redis and relay clients are required');
  const server = createEndlessWebHttpServer({
    realm: null,
    redisClient,
    relayClient,
    config,
    gatewayMode: true,
    healthCheck: () => ({ redis: redisClient.isReady, relay: relayClient.authed }),
  });
  relayClient.cfg.enable = false;
  relayClient.cfg.web_relay_enabled = true;
  if (!relayClient.hasIdentity()) relayClient.cfg.name = 'Public web gateway';
  relayClient.saveConfig();
  relayClient.connect();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    relayClient.close();
    throw error;
  }
  logger.info(`[web-gateway] listening on ${config.host}:${server.address().port}`);
  return {
    server,
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      relayClient.close();
    },
  };
}
