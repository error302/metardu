## 2024-05-18 - Math.max(...array) call stack overflow on large arrays
**Learning:** Using the spread operator (`...`) with `Math.max()` or `Math.min()` on large arrays (like point cloud data with > 100k points) causes V8 to throw a "Maximum call stack size exceeded" error. This also hurts performance by creating intermediate arrays if combined with `.map()`.
**Action:** Always use `for` loops or `.reduce()` to calculate bounds on large arrays to avoid call stack limits and avoid unnecessary memory allocations.
