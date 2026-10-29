## 2024-05-15 - [Test Entry]
**Learning:** Test
**Action:** Test

## 2024-10-29 - [Avoid spreading large arrays in Math.min/max]
**Learning:** Using `Math.min(...points.map(...))` and `Math.max(...points.map(...))` on large datasets causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation because spread syntax passes each array element as an argument to the function. This is a critical performance bottleneck and anti-pattern in the codebase.
**Action:** Use `for` loops or `reduce` instead when calculating bounds on large datasets, such as point cloud data.
