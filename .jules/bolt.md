## 2024-05-18 - Avoid spread operator with Math.min/max on large arrays
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (e.g., point cloud data or survey geometries) causes V8 'Maximum call stack size exceeded' errors and excessive memory allocation, crashing the application or calculations.
**Action:** Use a `for` loop or `reduce` instead of `Math.min(...arr)` or `Math.max(...arr)` when calculating bounds on large datasets.
