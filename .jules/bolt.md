## 2024-05-24 - V8 Call Stack Exceeded with Array Spread on Point Clouds
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (like point cloud datasets) can cause a "Maximum call stack size exceeded" error in V8, and causes excessive memory allocation due to intermediary array mapping.
**Action:** Use standard `for` loops or `reduce()` to calculate minimums and maximums over potentially large datasets instead of relying on `Math.min(...array)` or `Math.max(...array)`.
