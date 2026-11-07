
## 2024-05-18 - Avoid Math.min(...)/Math.max(...) on large point clouds
**Learning:** Using `Math.min(...points.map(...))` and `Math.max(...)` with large arrays (e.g. point cloud data) will throw a V8 `Maximum call stack size exceeded` error because V8 has a limit on the number of arguments a function can accept (usually ~65,535). Further, doing `.map(...)` creates a copy of the array, causing O(N) memory allocation and hurting performance.
**Action:** For large datasets like point clouds or vertex arrays, always use a single-pass `for` loop to compute minimum and maximum values without `.map(...)` overhead and avoiding V8 argument limits.
