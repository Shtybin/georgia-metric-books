/**
 * Категоризация приходов основной карты — единая таксономия с картой
 * Тбилиси (`Confession` из `@/lib/i18n-tbilisi`). См. `confessionRules.ts`
 * для логики автоматического присвоения.
 */
import {
  CONFESSION_ORDER,
  CONFESSION_COLORS,
  type Confession,
} from "@/lib/i18n-tbilisi";

export type ParishCategory = Confession;
export const CATEGORY_ORDER: readonly ParishCategory[] = CONFESSION_ORDER;
export const CATEGORY_COLORS: Record<ParishCategory, string> = CONFESSION_COLORS;

/**
 * Подмножество категорий, отображаемое в легенде/фильтре основной карты.
 * Баптистскую, Ассирийскую и «Прочие» оставляем только на карте Тбилиси —
 * на общей карте Грузии у них нет статистически значимых приходов
 * (≤1 точки), и они визуально засоряют легенду.
 * При этом точки таких категорий не пропадают: они остаются включёнными
 * по умолчанию в `enabledCategories` и просто не имеют отдельного
 * чек-бокса в легенде.
 */
export const MAIN_MAP_CATEGORIES: readonly ParishCategory[] = CONFESSION_ORDER.filter(
  (c) => c !== "baptist" && c !== "assyrian" && c !== "other",
);

export { categorizeParish } from "@/lib/confessionRules";
