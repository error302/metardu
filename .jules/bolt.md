## 2024-05-17 - Avoid Math.max/min with Array Spread on Large Point Clouds
**Learning:** Using `Math.max(...points.map(...))` on large datasets like point clouds causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation because the spread operator expands the entire array onto the call stack. This crashes the calculation for large point cloud volumes.
**Action:** Always use a `for` loop or `.reduce()` to calculate min/max bounds when dealing with potentially large arrays (like points in point cloud or DTM modules).
