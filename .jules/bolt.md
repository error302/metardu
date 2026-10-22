## 2026-10-22 - Optimize Point Cloud Bounds Calculation
**Learning:** Large point clouds processed with `Math.min(...array.map())` or `Math.max(...array.map())` result in 'Maximum call stack size exceeded' exceptions due to V8's call stack limit for spread operators, and they allocate huge memory via intermediate `.map()` arrays.
**Action:** Always use a single O(n) `for` loop to track `min` and `max` values concurrently when processing extensive point arrays (like Easting/Northing or elevations), which bypasses call stack limits and eliminates intermediate array memory overhead.
