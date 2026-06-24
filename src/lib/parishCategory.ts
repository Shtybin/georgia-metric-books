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

export { categorizeParish } from "@/lib/confessionRules";
