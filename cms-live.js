'use strict';
// Read Pages CMS content from this GitHub Pages repository.
// The original menu scripts remain as an offline fallback; this file never carries credentials.
(() => {
  const readJson = async path => {
    const res = await fetch(path + '?published=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('CMS data unavailable: ' + path + ' (' + res.status + ')');
    return res.json();
  };
  const validPrice = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100000;

  readJson('cms/menu-prices.json').then(groups => {
    if (!groups || typeof groups !== 'object' || Array.isArray(groups)) throw new Error('Invalid prices');
    const current = new Map(data.map(item => [item[1], item]));
    const proposed = new Map();
    for (const [category, products] of Object.entries(groups)) {
      if (!Array.isArray(products)) throw new Error('Invalid product category: ' + category);
      for (const product of products) {
        if (!product || typeof product.name !== 'string' || !validPrice(product.price) ||
            proposed.has(product.name) || current.get(product.name)?.[0] !== category) {
          throw new Error('Invalid or duplicate menu price: ' + (product?.name || category));
        }
        proposed.set(product.name, product.price);
      }
    }
    if (proposed.size !== current.size) throw new Error('Missing menu prices');
    for (const [name, price] of proposed) current.get(name)[3] = price;
    window.dispatchEvent(new Event('nohut:prices-updated'));
  }).catch(error => console.error('Nohut menu CMS:', error));

  const assetPath = value => {
    if (typeof value !== 'string') return '';
    const path = value.trim();
    if (path.startsWith('/assets/')) return '.' + path;
    if (path.startsWith('assets/')) return path;
    if (path.startsWith('./assets/')) return path;
    return '';
  };
  readJson('cms/campaigns.json').then(list => {
    if (!Array.isArray(list)) throw new Error('Invalid campaigns');
    const used = new Set();
    const safe = list.map(c => {
      if (!c || !/^[a-z0-9-]+$/.test(c.id) || used.has(c.id) ||
          typeof c.active !== 'boolean' || !validPrice(c.price) ||
          typeof c.title?.tr !== 'string' || !Array.isArray(c.items)) {
        throw new Error('Invalid campaign data');
      }
      used.add(c.id);
      const poster = assetPath(c.poster), thumbnail = assetPath(c.thumbnail) || poster;
      if (!poster) throw new Error('Invalid campaign poster for ' + c.id);
      return { ...c, poster, thumbnail };
    });
    window.nohutCampaigns = safe;
    window.dispatchEvent(new Event('nohut:campaigns-updated'));
  }).catch(error => console.error('Nohut campaign CMS:', error));
})();
