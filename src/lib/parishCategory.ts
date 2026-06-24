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
 * Из легенды исключены:
 *   • `baptist`, `assyrian`, `other` — ≤1 точки на карте Грузии (оставлены
 *     только в Тбилиси, где такие приходы реально существовали);
 *   • `orthodox_russian` — за пределами Тбилиси отдельных русских приходов
 *     в датасете нет (русское население окормлялось военными храмами и
 *     приходами Грузинского экзархата). На карте Тбилиси категория
 *     сохраняется для русских церквей конца XIX в.
 * Точки этих категорий по-прежнему отображаются: они всегда включены в
 * `enabledCategories` — просто не имеют отдельного чек-бокса.
 */
export const MAIN_MAP_CATEGORIES: readonly ParishCategory[] = CONFESSION_ORDER.filter(
  (c) => c !== "baptist" && c !== "assyrian" && c !== "other" && c !== "orthodox_russian",
);

export { categorizeParish } from "@/lib/confessionRules";
