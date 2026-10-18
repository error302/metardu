
## 2025-01-01 - Avoid Math.min/Math.max with spread operator for large arrays
**Learning:** Using `Math.min(...array)` or `Math.max(...array)` throws "Maximum call stack size exceeded" errors for large arrays, which is problematic for point cloud data and other large datasets.
**Action:** Use `.reduce()` to iterate through elements and calculate mins/maxs for large collections of data instead of the spread operator.
