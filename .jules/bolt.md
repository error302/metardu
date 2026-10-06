## 2026-10-06 - Prevent Maximum call stack size exceeded on large array spreads
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (e.g. mapping over `spotHeights` point cloud data) causes V8 'Maximum call stack size exceeded' errors and excessive memory allocation.
**Action:** Use a single-pass `for` loop or `reduce` instead when calculating bounds on large datasets to avoid intermediate array allocations and call stack overflows.
