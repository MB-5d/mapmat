// Used by both the connection window and its independent cleanup worker.
self.VELLIC_PERMISSIONS = Object.freeze({
  async revoke(api, permanentOrigin) {
    const current = await api.permissions.getAll();
    const origins = (current.origins || []).filter(origin => origin !== permanentOrigin);
    const permissions = (current.permissions || []).filter(name => ['cookies', 'scripting'].includes(name));
    if (origins.length || permissions.length) {
      if (!await api.permissions.remove({ origins, permissions })) throw Error('Chrome did not remove the temporary access.');
    }
    const remaining = await api.permissions.getAll();
    if ((remaining.origins || []).some(origin => origin !== permanentOrigin)
      || (remaining.permissions || []).some(name => ['cookies','scripting'].includes(name))) throw Error('Temporary access remains.');
    for (const origin of origins) if (await api.permissions.contains({ origins: [origin] })) throw Error('Site access remains.');
    for (const name of ['cookies','scripting']) if (await api.permissions.contains({ permissions: [name] })) throw Error('Session access remains.');
    return true;
  },
  async verifyDenied(api, tabId, url, storeId) {
    // Negative probes return no page or session data. They must fail after cleanup.
    if (api.scripting?.executeScript) {
      try { await api.scripting.executeScript({ target: { tabId }, func: () => true }); }
      catch (error) { if (/permission|cannot access|missing host|not available in this context/i.test(error.message || '')) return this.verifyCookiesDenied(api, url, storeId); throw error; }
      throw Error('Page access still works after cleanup.');
    }
    return this.verifyCookiesDenied(api, url, storeId);
  },
  async verifyCookiesDenied(api, url, storeId) {
    if (!api.cookies?.get) return true;
    try { await api.cookies.get({ url, storeId, name: '__vellic_cleanup_probe_never_set__' }); }
    catch (error) { if (/permission|cannot access|missing host|not available in this context/i.test(error.message || '')) return true; throw error; }
    throw Error('Cookie access still works after cleanup.');
  },
});
