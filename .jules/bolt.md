## 2024-11-03 - Maximum call stack size exceeded on large arrays
**Learning:** In V8, using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (like point cloud data) can cause a "Maximum call stack size exceeded" error and excessive memory allocation.
**Action:** Use a `for` loop or `reduce` instead when calculating bounds on large datasets to avoid stack overflow issues.
