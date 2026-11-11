## 2024-05-30 - Maximum call stack size exceeded with Math.max on large arrays
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (like point cloud data) can cause V8 "Maximum call stack size exceeded" errors and excessive memory allocation because the array elements are pushed onto the stack as arguments.
**Action:** Always use `for` loops or `reduce` instead of `Math.min(...arr)` / `Math.max(...arr)` when computing bounds on large datasets like point clouds.
