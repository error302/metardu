## 2024-05-17 - Avoid Spread Operator with Math.max/min on Large Arrays

**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays (e.g., point cloud datasets) is a severe performance anti-pattern. This causes V8 "Maximum call stack size exceeded" errors and excessive memory allocation, crashing the process or causing massive GC pauses. In `topographicPlanRenderer.ts`, using `...opts.spotHeights.map(...)` inside `Math.min/max` forced 4 intermediate array allocations and deep stack execution.

**Action:** Always use explicit `for` loops or `reduce` to compute minimum and maximum values when iterating over data collections that can be large, such as `spotHeights` or survey data points, to ensure O(N) single-pass performance with minimal overhead.
