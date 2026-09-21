## 2024-10-18 - Avoid Spread Operator on Large Data Structures
**Learning:** Using `Math.min(...array.map())` or `Math.max(...array.map())` for calculating extents on large arrays (such as point cloud data in `topographicPlanRenderer`) leads to V8 'Maximum call stack size exceeded' errors and allocates unnecessary intermediate arrays via `.map()`.
**Action:** Always use a simple `for` loop or `reduce()` to calculate min/max values for array data when dealing with potentially large datasets.
