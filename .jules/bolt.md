## 2025-01-22 - Prevent V8 Maximum call stack size exceeded on point cloud arrays
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays, such as point cloud coordinate maps, causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation.
**Action:** Always use explicit `for` loops or `reduce` instead of spreading into `Math.min`/`Math.max` when calculating bounds on large datasets to ensure reliable performance and prevent crashes.
