## 2024-10-25 - Avoid Spread Operator with Math.min/max on Large Point Cloud Arrays
**Learning:** Using `Math.min(...arr)` or `Math.max(...arr)` on large datasets like point cloud arrays causes V8 "Maximum call stack size exceeded" errors. Additionally, using `.map()` just to extract values (e.g. `points.map(p => p.x)`) causes unnecessary memory allocations and hurts performance.
**Action:** Always compute bounding boxes or find min/max values in large arrays using a single standard `for` loop iteration. This reduces memory pressure and avoids call stack size limitations.
