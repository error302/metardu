
## 2024-09-10 - Avoid Math.min/max spread on large arrays
**Learning:** Using `Math.min(...array)` or `Math.max(...array)` with the spread operator on large arrays (such as point cloud data) causes V8 'Maximum call stack size exceeded' errors and excessive memory allocation, leading to application crashes. Additionally, using `.map()` just to extract the coordinates for these functions allocates unnecessary intermediate arrays, worsening memory footprint.
**Action:** Always avoid using the spread operator with `Math.min` or `Math.max` for potentially large data arrays. Instead, use a single-pass `for` loop (or `reduce`) to calculate bounds efficiently without blowing up the call stack or creating intermediate arrays.
