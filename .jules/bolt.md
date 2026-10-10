## 2024-05-13 - [Performance Anti-Pattern: Math.min/max with spread on large arrays]
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (e.g., point cloud data) causes V8 'Maximum call stack size exceeded' errors and excessive memory allocation.
**Action:** Use `for` loops or `reduce` instead when calculating bounds on large datasets.
