
## 2024-05-24 - Performance issues with Math.min/max on large arrays
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (like point cloud data) causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation.
**Action:** Avoid using the spread operator with `Math.min()` or `Math.max()` on large arrays. Use a `for` loop or `reduce` instead to iterate through the array and find the min/max values.
