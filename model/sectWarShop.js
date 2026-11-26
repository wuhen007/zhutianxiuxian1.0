import fs from 'node:fs';

const shopData = JSON.parse(
  fs.readFileSync(new URL('../resources/data/圣地战功商店.json', import.meta.url), 'utf8')
);

export const SECT_WAR_TOKEN = shopData.tokenName;
export const SECT_WAR_SHOP = Object.freeze(
  shopData.products.map(product => Object.freeze({ ...product }))
);

export function findSectWarProduct(selector) {
  const value = String(selector || '').replace(/\s+/g, '');
  return SECT_WAR_SHOP.find(
    product => String(product.id) === value || product.name === value
  ) || null;
}
