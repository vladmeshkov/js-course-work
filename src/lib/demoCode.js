import { config } from '../config/index.js';
import * as mailService from '../services/mailService.js';

/**
 * Отправляет код подтверждения письмом. Без настроенной почты в учебной версии (не production) код запоминается в сессии
 * и отдаётся клиенту в JSON (demoCode), экран подтверждения показывает его вместо письма.
 * @param {import('express').Request} req
 * @param {{ intentId: string | number, code: string, label: string }} input
 * @returns {Promise<{ sentTo: string | null, demoCode: string | null }>}
 */
export async function deliverCode(req, { intentId, code, label }) {
  const sentTo = await mailService.sendCode(req.user.id, code, label);
  if (sentTo || config.isProd) return { sentTo, demoCode: null };
  req.session.demoOtp = { intentId: String(intentId), code };
  return { sentTo: null, demoCode: code };
}

/** Учебный код для заявки, если он был сохранён в сессии при её создании. */
export function demoCodeFor(req, intentId) {
  const demo = req.session.demoOtp;
  return demo && demo.intentId === String(intentId) ? demo.code : null;
}

/** Забывает учебный код заявки (после подтверждения или отмены); коды других операций в сессии не трогает. */
export function clearDemoCode(req, intentId) {
  if (req.session.demoOtp?.intentId === String(intentId)) delete req.session.demoOtp;
}
