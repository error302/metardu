## 2024-05-18 - Optimize spot height bounds calculation
**Learning:** Avoid using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (e.g., point cloud data) as it causes V8 'Maximum call stack size exceeded' errors and excessive memory allocation.
**Action:** Use `reduce` (or `for` loops) instead when calculating bounds on large datasets to iterate in a single pass and prevent stack overflow.
