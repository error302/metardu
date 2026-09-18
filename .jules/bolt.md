## 2024-05-24 - V8 Call Stack Limits with Math.min/Math.max
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (like point clouds with thousands of points) causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation in this codebase.
**Action:** Avoid spread syntax for calculating bounds on large data sets. Use standard `for` loops or `reduce` instead for stability and performance.
