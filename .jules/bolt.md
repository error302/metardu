## 2024-05-18 - Math.min/max spread anti-pattern on large arrays
**Learning:** Using `Math.min(...arr)` or `Math.max(...arr)` on large arrays (like point clouds with 100k+ elements) causes V8 'Maximum call stack size exceeded' errors and excessive memory allocation.
**Action:** Use standard `for` loops or `.reduce()` when calculating min/max bounds on potentially large datasets (like `easting`/`northing`/`elevation` in point clouds).
