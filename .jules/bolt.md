## 2026-09-27 - [Avoid Math.min/Math.max spread operators for large arrays]
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays, such as point cloud data or spot heights in this codebase, will cause a V8 "Maximum call stack size exceeded" error because it tries to pass all array elements as individual arguments.
**Action:** Avoid `Math.min(...array)` and `Math.max(...array)` on potentially large datasets. Use `for` loops or `reduce` instead when calculating bounds to prevent memory allocation issues and stack crashes.
