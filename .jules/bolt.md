## 2024-05-18 - Avoid spread operator for calculating bounds on large arrays
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays, such as point cloud data arrays, causes V8 'Maximum call stack size exceeded' errors and allocates excessive memory.
**Action:** Always use an iterative approach like a `for` loop to manually track and find minimum/maximum values instead of `.map(...)` and `Math.min(...)/Math.max(...)` when processing large data collections in this codebase.
