// Travailleur en arrière-plan : fait tourner l'IA « ciel » (skynet.js) sans figer l'écran pendant la vérification.
import { loadSkyModel, skyShareOf } from "./skynet.js";

self.onmessage = async (e) => {
  const { id, rgba, enough } = e.data;
  try {
    const model = await loadSkyModel(new URL("../models/", import.meta.url).href);
    self.postMessage({ id, share: skyShareOf(model, rgba, enough) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
