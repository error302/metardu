## 2024-05-19 - Math.min/max Call Stack Overflow on Large Datasets
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (like spot heights or point cloud data) causes V8 "Maximum call stack size exceeded" errors and allocates excessive memory for intermediate `.map()` results.
**Action:** Always use a single `for` loop or `.reduce()` when calculating min/max bounds on large datasets in this codebase to prevent runtime crashes and memory spikes.
