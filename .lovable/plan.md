# Plan: fix mobile search results overlay

## Goal
On mobile, the search results list should open below the functional buttons row, so the first result is fully visible and tappable when the on-screen keyboard is open.

## Confirmed current issue
In `MapView.tsx`, the search results dropdown is absolutely positioned inside the search input wrapper. The functional buttons row is a separate sibling rendered immediately after that wrapper. Because the dropdown is absolute and has no layout height, it starts under the input while the buttons row is painted over the same area on mobile.

Current simplified structure:

```text
Top bar
  Search/filter column
    Region/Uezd selects
    Search input wrapper
      input
      absolute results dropdown  <- starts here
  Functional buttons row          <- overlaps first dropdown result on mobile
```

## Changes to make
1. Restructure only the top-bar JSX in `src/components/map/MapView.tsx`:
   - Keep Region/Uezd filters and search input in the same visual order.
   - Keep the functional buttons row in the same visual position.
   - Render the search results dropdown after the buttons row on mobile, while preserving the desktop/tablet behavior.

2. Use responsive layout classes instead of hard offsets:
   - Mobile top bar: single-column grid/flex stack.
   - Search result list: normal-flow or explicitly placed below the full top controls on mobile.
   - Desktop/tablet: retain the compact floating dropdown under the search field.

3. Preserve behavior:
   - Existing search selection, area highlighting, Enter/Escape handling, blur delay, analytics events, and language/embed behavior stay unchanged.
   - Keep the result list scrollable with viewport-bounded max height, accounting for the mobile keyboard as much as CSS can.

4. Accessibility check:
   - Keep `role="combobox"`, `aria-expanded`, and `role="listbox" / role="option"`.
   - Ensure the list remains keyboard/touch selectable.

5. Verify:
   - Reproduce on a narrow mobile viewport with a query like `све`.
   - Confirm the first result is not covered by the buttons row.
   - Check no horizontal overflow and no build errors.
