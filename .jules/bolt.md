## 2024-09-16 - Math.max / Math.min with Spread Operator on Point Clouds
**Learning:** Using `Math.max(...points.map(p => p.easting))` on large point clouds causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation. It also iterates multiple times if done sequentially for easting/northing and min/max.
**Action:** Replace `Math.max(...arr)` and `Math.min(...arr)` with a single `for` loop or `reduce` when calculating bounds on point clouds and other large arrays to improve performance and prevent crashes.
