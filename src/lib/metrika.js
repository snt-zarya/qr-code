// Отправка целей (JavaScript-событий) в Яндекс.Метрику.
// Счётчик подключён в index.html; здесь только обёртка над глобальным ym().
// Если Метрика не загрузилась (блокировщик, офлайн) — вызовы безопасно игнорируются.

export const YM_ID = 110204684

export function reachGoal(goal, params) {
  if (typeof window !== 'undefined' && typeof window.ym === 'function') {
    window.ym(YM_ID, 'reachGoal', goal, params)
  }
}
