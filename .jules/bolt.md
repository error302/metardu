## 2024-05-19 - Replace spread operator in Math.min/max with loop for point cloud bounds
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (like point cloud data) causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation in this codebase.
**Action:** When computing bounds (e.g., minX, maxX) on large datasets, avoid `.map()` and `Math.min(...arr)`. Instead, use a single `for` loop to compute the min and max values directly. This prevents app crashes and reduces memory overhead.
