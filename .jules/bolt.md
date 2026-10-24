## 2024-06-25 - Avoid Math.min/max spread on large arrays
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (e.g., point cloud data) causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation in this codebase.
**Action:** Always use a single-pass `for` loop or `reduce` instead when calculating bounds on large datasets to prevent stack overflows and improve performance.
