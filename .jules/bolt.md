## 2024-05-18 - Replacing Math.min/max array spreads in point cloud bounds calculations
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (such as point cloud data) can cause V8 "Maximum call stack size exceeded" errors and excessive memory allocation.
**Action:** Use standard `for` loops or `reduce` instead when calculating bounds on large datasets to prevent call stack issues and improve performance.
