## 2024-05-14 - Spread Operator with Math.min/max on Large Arrays
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays, such as point cloud datasets, causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation due to intermediate array creation (e.g., when chained with `.map()`).
**Action:** Use explicit `for` loops or `reduce` instead when calculating bounds on large datasets to avoid call stack limits and unnecessary memory allocations.
