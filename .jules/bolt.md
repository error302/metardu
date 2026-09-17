## 2024-03-24 - Avoid spread operator for calculating min/max over arrays of points
**Learning:** Using `Math.min(...arr)` or `Math.max(...arr)` on large arrays (e.g. 10,000+ items like point cloud data) can cause a V8 "Maximum call stack size exceeded" error, and creates unnecessary temporary arrays if mapping is required beforehand (`points.map(p => p.val)`).
**Action:** Use a simple `for` loop or `reduce` when calculating bounds on large datasets to avoid stack overflows and excess memory allocation.
